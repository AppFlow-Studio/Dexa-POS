// /components/tables/TableLayoutView.tsx

import { storage } from "@/lib/storage";
import { TABLE_SHAPES } from "@/lib/table-shapes";
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { getWallEdgeFlags, WallEdgeFlags } from "@/lib/wallCornerSnap";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { FloorPlanObject, ServerSection } from "@/types/db-floor-plan-types";
import { Lock, LockOpen, Minus, Plus } from "lucide-react-native";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  LayoutChangeEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import Svg, {
  Line,
  Path as SvgPath,
  Rect as SvgRect,
  Text as SvgText,
} from "react-native-svg";
import { useShallow } from "zustand/react/shallow";
import DraggableTable from "./DraggableTable";
import TableLayoutSkeleton from "./TableLayoutSkeleton";

// Precomputed grid paths — built once at module load, not on every render
const GRID_MINOR = 20;
const GRID_MAJOR = 100;
const DEFAULT_CANVAS_WORLD_WIDTH = 2400;
const DEFAULT_CANVAS_WORLD_HEIGHT = 1600;
const INITIAL_ZOOM_MULTIPLIER = 2.0;
const ENTRY_ANIMATION_OBJECT_LIMIT = 40;
const PROGRESSIVE_RENDER_THRESHOLD = 80;
const INITIAL_RENDER_BATCH = 80;
const PROGRESSIVE_RENDER_BATCH = 20;
const PROGRESSIVE_RENDER_DELAY_MS = 8;

// Viewport windowing: keep all tables mounted but hide off-screen ones via
// opacity/pointerEvents to avoid React mount/unmount churn on scroll.
const VIEWPORT_WINDOW_THRESHOLD = 20;
const VIEWPORT_OVERSCAN_PX = 600;

const getMedian = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
};

const clamp = (value: number, min: number, max: number) => {
  "worklet";
  return Math.min(Math.max(value, min), max);
};

const clampCanvasTranslation = (
  tx: number,
  ty: number,
  scale: number,
  viewportWidth: number,
  viewportHeight: number,
  worldWidth: number,
  worldHeight: number,
) => {
  "worklet";

  const maxOffsetX = Math.max(0, (worldWidth * scale - viewportWidth) / 2);
  const maxOffsetY = Math.max(0, (worldHeight * scale - viewportHeight) / 2);

  return {
    x: clamp(tx, -maxOffsetX, maxOffsetX),
    y: clamp(ty, -maxOffsetY, maxOffsetY),
  };
};

interface TableLayoutViewProps {
  tables: FloorPlanObject[];
  layoutId: string;
  isEditMode?: boolean;
  showConnections?: boolean;
  className?: string;
  isSelectionMode?: boolean;
  onTableSelect?: (table: FloorPlanObject) => void;
  selectedTableId?: string; // Added to handle selection state from parent
  activeOrderId?: string | null;
  sectionsById?: Record<string, ServerSection>;
  onTableLongPress?: (table: FloorPlanObject) => void;
  disableLongPress?: boolean;
  interactionMode?: "normal" | "selection" | "merge";
}

type PersistedCameraState = {
  scale: number;
  translateX: number;
  translateY: number;
};

const TableLayoutView: React.FC<TableLayoutViewProps> = ({
  tables,
  layoutId,
  isEditMode = false,
  showConnections = true,
  className = "",
  isSelectionMode = false,
  onTableSelect,
  selectedTableId, // Consuming the new prop
  activeOrderId,
  sectionsById,
  onTableLongPress,
  disableLongPress = false,
  interactionMode = "normal",
}) => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);

  const toggleTableSelection = useFloorPlanStore((s) => s.toggleTableSelection);
  // useShallow: both selectors return arrays. Without shallow equality, every
  // mutation to useFloorPlanStore (even unrelated) returns a new array ref and
  // re-renders the whole canvas. Shallow compare lets us re-render only when
  // contents actually change.
  const globallySelectedTableIds = useFloorPlanStore(
    useShallow((s) => s.selectedTableIds),
  );
  const floorPlans = useFloorPlanStore(useShallow((s) => s.floorPlans));

  // Stable handlers passed to every DraggableTable. Previously each table got
  // a fresh inline arrow per render; with N tables that's N closure
  // allocations per render even when the memo equality fn (in DraggableTable)
  // ignores callback identity. Stable refs also future-proof against the
  // equality fn being tightened to compare callbacks.
  const handleTableSelect = useCallback(
    (t: FloorPlanObject) => {
      if (isSelectionMode) onTableSelect?.(t);
      else toggleTableSelection(t.id);
    },
    [isSelectionMode, onTableSelect, toggleTableSelection],
  );
  const handleTableLongPress = useCallback(
    (t: FloorPlanObject) => {
      onTableLongPress?.(t);
    },
    [onTableLongPress],
  );

  // Create O(1) lookup map for tables
  const tablesById = useMemo(() => {
    return tables.reduce(
      (acc, table) => {
        acc[table.id] = table;
        return acc;
      },
      {} as Record<string, FloorPlanObject>,
    );
  }, [tables]);

  // Sort tables by z_index for correct layering (zones/backgrounds render behind tables)
  const sortedTables = useMemo(() => {
    return [...tables].sort((a, b) => (a.z_index ?? 0) - (b.z_index ?? 0));
  }, [tables]);

  // Stable geometry key — only changes when position/size/section assignment changes,
  // not when session status/order changes. Prevents sectionOverlays from recomputing
  // on every realtime table session update.
  const tableGeometryKey = useMemo(
    () =>
      tables
        .map(
          (t) =>
            `${t.id}:${t.x},${t.y},${t.width ?? ""},${t.height ?? ""},${
              t.section_id ?? ""
            }`,
        )
        .join("|"),
    [tables],
  );

  // Compute section overlay bounding boxes from tables grouped by section_id
  const sectionOverlays = useMemo(() => {
    if (!sectionsById || Object.keys(sectionsById).length === 0) return [];

    const sectionBounds: Record<
      string,
      { minX: number; minY: number; maxX: number; maxY: number }
    > = {};

    tables.forEach((table) => {
      if (!table.section_id) return;
      const shapeDef =
        TABLE_SHAPES[table.shape_id as keyof typeof TABLE_SHAPES];
      const w = table.width ?? shapeDef?.width ?? 100;
      const h = table.height ?? shapeDef?.height ?? 100;

      if (!sectionBounds[table.section_id]) {
        sectionBounds[table.section_id] = {
          minX: table.x,
          minY: table.y,
          maxX: table.x + w,
          maxY: table.y + h,
        };
      } else {
        const b = sectionBounds[table.section_id];
        b.minX = Math.min(b.minX, table.x);
        b.minY = Math.min(b.minY, table.y);
        b.maxX = Math.max(b.maxX, table.x + w);
        b.maxY = Math.max(b.maxY, table.y + h);
      }
    });

    const PADDING = 20;
    return Object.entries(sectionBounds)
      .filter(([sectionId]) => sectionsById[sectionId])
      .map(([sectionId, bounds]) => ({
        sectionId,
        section: sectionsById[sectionId],
        x: bounds.minX - PADDING,
        y: bounds.minY - PADDING,
        width: bounds.maxX - bounds.minX + PADDING * 2,
        height: bounds.maxY - bounds.minY + PADDING * 2,
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableGeometryKey, sectionsById]);

  const wallEdgeFlagsById = useMemo<Record<string, WallEdgeFlags>>(() => {
    const walls = tables.filter((table) => table.shape_id === "wall-section");
    if (walls.length === 0) return {};

    const next: Record<string, WallEdgeFlags> = {};
    for (const wall of walls) {
      next[wall.id] = getWallEdgeFlags(wall, walls);
    }
    return next;
  }, [tableGeometryKey, tables]);

  // Use the correct selection state:
  // - In selection mode: use global store (supports multi-select for merge)
  // - Otherwise: use global store or fall back to single selectedTableId prop
  const selectedTableIds = selectedTableId
    ? [selectedTableId]
    : globallySelectedTableIds;

  const activeLayout = useMemo(
    () => floorPlans.find((plan) => plan.id === layoutId) ?? null,
    [floorPlans, layoutId],
  );

  const worldDims = useMemo(() => {
    let contentWidth = activeLayout?.canvas_width || DEFAULT_CANVAS_WORLD_WIDTH;
    let contentHeight =
      activeLayout?.canvas_height || DEFAULT_CANVAS_WORLD_HEIGHT;

    for (const table of tables) {
      const shapeDef =
        TABLE_SHAPES[table.shape_id as keyof typeof TABLE_SHAPES];
      const tableWidth = table.width ?? shapeDef?.width ?? 100;
      const tableHeight = table.height ?? shapeDef?.height ?? 100;
      contentWidth = Math.max(contentWidth, table.x + tableWidth);
      contentHeight = Math.max(contentHeight, table.y + tableHeight);
    }

    return { width: contentWidth, height: contentHeight };
  }, [activeLayout, tables]);

  const objectMedian = useMemo(() => {
    const medianSourceTables = tables.filter((table) => {
      const shapeDef =
        TABLE_SHAPES[table.shape_id as keyof typeof TABLE_SHAPES];
      if (shapeDef?.type) return shapeDef.type === "table";
      return table.category === "table" || table.category === "booth";
    });

    if (medianSourceTables.length === 0) {
      return {
        hasObjects: false,
        x: worldDims.width / 2,
        y: worldDims.height / 2,
      };
    }

    const centerXs: number[] = [];
    const centerYs: number[] = [];

    for (const table of medianSourceTables) {
      const shapeDef =
        TABLE_SHAPES[table.shape_id as keyof typeof TABLE_SHAPES];
      const width = table.width ?? shapeDef?.width ?? 100;
      const height = table.height ?? shapeDef?.height ?? 100;
      centerXs.push(table.x + width / 2);
      centerYs.push(table.y + height / 2);
    }

    return {
      hasObjects: true,
      x: getMedian(centerXs),
      y: getMedian(centerYs),
    };
  }, [tables, worldDims.height, worldDims.width]);

  const gridPaths = useMemo(() => {
    let minor = "";
    let major = "";

    for (let x = GRID_MINOR; x < worldDims.width; x += GRID_MINOR) {
      minor += `M${x},0 L${x},${worldDims.height} `;
    }
    for (let y = GRID_MINOR; y < worldDims.height; y += GRID_MINOR) {
      minor += `M0,${y} L${worldDims.width},${y} `;
    }

    for (let x = 0; x <= worldDims.width; x += GRID_MAJOR) {
      major += `M${x},0 L${x},${worldDims.height} `;
    }
    for (let y = 0; y <= worldDims.height; y += GRID_MAJOR) {
      major += `M0,${y} L${worldDims.width},${y} `;
    }

    return { minor, major };
  }, [worldDims.height, worldDims.width]);

  // O(1) lookup Set for isSelected checks
  const selectedTableIdsSet = useMemo(
    () => new Set(selectedTableIds),
    [selectedTableIds],
  );

  const prioritizedTables = useMemo(() => {
    if (sortedTables.length < PROGRESSIVE_RENDER_THRESHOLD) return sortedTables;

    // Sort by z_index only — stable sort that doesn't change when session data
    // or selection changes. Selection scoring (+1000) previously caused the
    // sorted array to re-order on every seat/select, which cascaded through
    // visibleTables.slice() → windowedTables → tables appeared/disappeared.
    // Selection is purely an isSelected prop on DraggableTable, not a render
    // priority concern.
    return [...sortedTables].sort(
      (a, b) => (a.z_index ?? 0) - (b.z_index ?? 0),
    );
  }, [sortedTables]);

  const [visibleObjectCount, setVisibleObjectCount] = useState(() =>
    sortedTables.length >= PROGRESSIVE_RENDER_THRESHOLD
      ? Math.min(INITIAL_RENDER_BATCH, sortedTables.length)
      : sortedTables.length,
  );

  useEffect(() => {
    if (prioritizedTables.length < PROGRESSIVE_RENDER_THRESHOLD) {
      setVisibleObjectCount(prioritizedTables.length);
      return;
    }

    setVisibleObjectCount(
      Math.min(INITIAL_RENDER_BATCH, prioritizedTables.length),
    );

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let pumpCount = 0;
    const MAX_PUMPS =
      Math.ceil(prioritizedTables.length / PROGRESSIVE_RENDER_BATCH) + 2;

    const pump = () => {
      if (cancelled || pumpCount >= MAX_PUMPS) return;
      pumpCount++;
      timeoutId = setTimeout(() => {
        if (cancelled) return;
        setVisibleObjectCount((current) => {
          if (current >= prioritizedTables.length) return current;
          return Math.min(
            current + PROGRESSIVE_RENDER_BATCH,
            prioritizedTables.length,
          );
        });
        if (!cancelled) {
          pump();
        }
      }, PROGRESSIVE_RENDER_DELAY_MS);
    };

    pump();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [layoutId, prioritizedTables]);

  const visibleTables = useMemo(
    () => prioritizedTables.slice(0, visibleObjectCount),
    [prioritizedTables, visibleObjectCount],
  );

  const dimsKey = `floor_plan.container_dims.${layoutId}`;
  const [containerDims, setContainerDims] = useState(() => {
    const cached = storage.getString(dimsKey);
    if (cached) {
      try {
        const p = JSON.parse(cached);
        if (p.width > 0 && p.height > 0) return p;
      } catch {}
    }
    return { width: 0, height: 0 };
  });
  const [isLoading, setIsLoading] = useState(true);
  const viewLockedKey = `floor_plan.view_locked.${layoutId}`;
  const [, setViewLockedTick] = useState(0);
  const viewLocked = storage.getBoolean(viewLockedKey) ?? true;
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  // Stored initial center values for recentering
  const initialScaleRef = useRef(1);
  const initialTranslateXRef = useRef(0);
  const initialTranslateYRef = useRef(0);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const initialLoadDone = useRef(false);
  const lastCenterKey = useRef("");
  const cameraStateRef = useRef<PersistedCameraState | null>(null);

  const readPersistedCameraState = (
    key: string,
  ): PersistedCameraState | null => {
    const raw = storage.getString(key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as PersistedCameraState;
      if (
        Number.isFinite(parsed.scale) &&
        Number.isFinite(parsed.translateX) &&
        Number.isFinite(parsed.translateY)
      ) {
        return parsed;
      }
    } catch {
      return null;
    }
    return null;
  };

  useEffect(() => {
    if (!initialLoadDone.current) {
      setIsLoading(true);
      initialLoadDone.current = true;
    }
    if (containerDims.width > 0) {
      setIsLoading(false);
    }
  }, [containerDims.width, worldDims.height, worldDims.width]);

  // 2. Calculate and set initial scale and position once we have dimensions
  useEffect(() => {
    if (containerDims.width > 0 && worldDims.width > 0) {
      const centerKey = `${layoutId}:${containerDims.width}x${containerDims.height}:${worldDims.width}x${worldDims.height}:${objectMedian.x},${objectMedian.y}`;
      if (lastCenterKey.current === centerKey) {
        // Camera already positioned (re-render guard). Still mark ready so
        // the viewport effect can fire — the shared values were set on the
        // previous run and are still valid.
        setCameraReady(true);
        return;
      }

      const persistedKey = `floor_plan.view_state.${layoutId}`;
      const parsedCamera = readPersistedCameraState(persistedKey);
      const shouldRestoreLockedCamera =
        viewLocked &&
        parsedCamera &&
        Number.isFinite(parsedCamera.scale) &&
        Number.isFinite(parsedCamera.translateX) &&
        Number.isFinite(parsedCamera.translateY);

      if (shouldRestoreLockedCamera) {
        const restoredScale = clamp(parsedCamera.scale, 0.5, 3);
        const restoredTranslate = clampCanvasTranslation(
          parsedCamera.translateX,
          parsedCamera.translateY,
          restoredScale,
          containerDims.width,
          containerDims.height,
          worldDims.width,
          worldDims.height,
        );

        scale.value = restoredScale;
        savedScale.value = restoredScale;
        translateX.value = restoredTranslate.x;
        savedTranslateX.value = restoredTranslate.x;
        translateY.value = restoredTranslate.y;
        savedTranslateY.value = restoredTranslate.y;
        cameraStateRef.current = {
          scale: restoredScale,
          translateX: restoredTranslate.x,
          translateY: restoredTranslate.y,
        };
        lastCenterKey.current = centerKey;
        setIsLoading(false);
        setCameraReady(true);
        return;
      }

      const scaleX = containerDims.width / worldDims.width;
      const scaleY = containerDims.height / worldDims.height;
      const initialScale = clamp(
        Math.min(scaleX, scaleY) * INITIAL_ZOOM_MULTIPLIER,
        0.5,
        3,
      );

      const viewportCenterX = containerDims.width / 2;
      const viewportCenterY = containerDims.height / 2;
      const worldCenterX = worldDims.width / 2;
      const worldCenterY = worldDims.height / 2;
      const preferredCenterX = objectMedian.hasObjects
        ? objectMedian.x
        : worldCenterX;
      const preferredCenterY = objectMedian.hasObjects
        ? objectMedian.y
        : worldCenterY;

      const preferredUnclampedTranslateX =
        (viewportCenterX - preferredCenterX) * initialScale;
      const preferredUnclampedTranslateY =
        (viewportCenterY - preferredCenterY) * initialScale;
      const initialTranslate = clampCanvasTranslation(
        preferredUnclampedTranslateX,
        preferredUnclampedTranslateY,
        initialScale,
        containerDims.width,
        containerDims.height,
        worldDims.width,
        worldDims.height,
      );

      scale.value = initialScale;
      savedScale.value = initialScale;
      translateX.value = initialTranslate.x;
      savedTranslateX.value = initialTranslate.x;
      translateY.value = initialTranslate.y;
      savedTranslateY.value = initialTranslate.y;
      // Persist initial center for recentering
      initialScaleRef.current = initialScale;
      initialTranslateXRef.current = initialTranslate.x;
      initialTranslateYRef.current = initialTranslate.y;
      cameraStateRef.current = {
        scale: initialScale,
        translateX: initialTranslate.x,
        translateY: initialTranslate.y,
      };
      lastCenterKey.current = centerKey;

      setIsLoading(false);
      setCameraReady(true);
    } else if (containerDims.width > 0) {
      // Handle case with no tables
      setIsLoading(false);
    }
  }, [
    containerDims,
    layoutId,
    objectMedian,
    worldDims,
    scale,
    savedScale,
    savedTranslateX,
    savedTranslateY,
    translateX,
    translateY,
  ]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setContainerDims({ width, height });
    storage.set(dimsKey, JSON.stringify({ width, height }));
    setLayoutMeasured(true);
  };

  const panGesture = Gesture.Pan()
    .enabled(!viewLocked)
    .minDistance(10) // Require 10px movement to start pan
    .activeOffsetX([-10, 10])
    .activeOffsetY([-10, 10])
    .onUpdate((event) => {
      const next = clampCanvasTranslation(
        savedTranslateX.value + event.translationX,
        savedTranslateY.value + event.translationY,
        scale.value,
        containerDims.width,
        containerDims.height,
        worldDims.width,
        worldDims.height,
      );
      translateX.value = next.x;
      translateY.value = next.y;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const pinchGesture = Gesture.Pinch()
    .enabled(!viewLocked)
    .onUpdate((event) => {
      // Clamp scale between 0.5x and 3x
      const newScale = Math.max(
        0.5,
        Math.min(3, savedScale.value * event.scale),
      );
      const next = clampCanvasTranslation(
        translateX.value,
        translateY.value,
        newScale,
        containerDims.width,
        containerDims.height,
        worldDims.width,
        worldDims.height,
      );
      scale.value = newScale;
      translateX.value = next.x;
      translateY.value = next.y;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  // Use Simultaneous with minDistance to allow both gestures
  // Pan requires 10px movement, so pinch can work independently
  const combinedGesture = Gesture.Simultaneous(pinchGesture, panGesture);

  const canvasAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  // ── Viewport windowing ─────────────────────────────────────────────────
  // Only mount tables whose world-space bounding box intersects the visible
  // viewport (plus overscan). The viewport is recomputed:
  //   1. On first REAL layout event (not cached dims — those may be stale)
  //   2. On pan/pinch gesture end (via useAnimatedReaction on saved shared vals)
  //   3. On lock toggle / recenter
  //
  // CRITICAL: viewport starts as null, meaning ALL tables render initially.
  // We separate "camera ready" from "layout measured" because containerDims
  // is restored from MMKV cache with potentially stale values (e.g. 1200x800
  // cached from a phone, now running on a 1920x1080 tablet). The viewport
  // must NOT be computed from cached dims — only from the real onLayout event.
  const [viewport, setViewport] = useState<{
    left: number;
    top: number;
    right: number;
    bottom: number;
  } | null>(null);
  const [layoutMeasured, setLayoutMeasured] = useState(false);

  // Camera-ready flag: set true at the end of the camera-positioning effect.
  const [cameraReady, setCameraReady] = useState(false);

  // Shared value to sync containerDims for useAnimatedReaction (worklet-safe).
  const containerDimsSV = useSharedValue(containerDims);
  // Sync in useEffect (not during render) to avoid Reanimated warning:
  // "Reading from `value` during component render"
  useEffect(() => {
    containerDimsSV.value = containerDims;
  }, [containerDims, containerDimsSV]);

  // Debounced viewport setter: defers the expensive windowedTables recomputation
  // to a requestAnimationFrame callback, so the gesture-end frame completes
  // smoothly before React unmounts/mounts tables. Multiple rapid gesture ends
  // (e.g. flick gestures) are coalesced into a single update.
  const pendingViewport = useRef<{
    left: number;
    top: number;
    right: number;
    bottom: number;
  } | null>(null);
  const viewportRafId = useRef<number | null>(null);

  const flushViewport = useCallback(() => {
    viewportRafId.current = null;
    const next = pendingViewport.current;
    pendingViewport.current = null;
    if (next) {
      setViewport(next);
    }
  }, []);

  const debouncedSetViewport = useCallback(
    (rect: { left: number; top: number; right: number; bottom: number }) => {
      pendingViewport.current = rect;
      if (viewportRafId.current == null) {
        viewportRafId.current = requestAnimationFrame(flushViewport);
      }
    },
    [flushViewport],
  );

  // Shared value gate: prevents useAnimatedReaction from setting the viewport
  // before the initial camera-ready+layout-measured effect has run. On mount
  // the reaction fires with scale=1,tx=0 (wrong) which would filter tables.
  // We flip this to true inside recalculateViewportJS (called from the useEffect
  // when both cameraReady && layoutMeasured).
  const viewportInitialized = useSharedValue(false);

  // Recalculate viewport — used for both initial setup and lock toggle/recenter.
  const recalculateViewportJS = useCallback(() => {
    if (sortedTables.length < VIEWPORT_WINDOW_THRESHOLD) {
      setViewport(null);
      viewportInitialized.value = true;
      return;
    }
    const s = scale.value;
    if (s <= 0) return;
    const invScale = 1 / s;
    const dims = containerDimsSV.value;
    const worldLeft = (0 - translateX.value) * invScale;
    const worldTop = (0 - translateY.value) * invScale;
    const worldRight = (dims.width - translateX.value) * invScale;
    const worldBottom = (dims.height - translateY.value) * invScale;
    debouncedSetViewport({
      left: worldLeft - VIEWPORT_OVERSCAN_PX,
      top: worldTop - VIEWPORT_OVERSCAN_PX,
      right: worldRight + VIEWPORT_OVERSCAN_PX,
      bottom: worldBottom + VIEWPORT_OVERSCAN_PX,
    });
    viewportInitialized.value = true;
  }, [sortedTables.length, scale, translateX, debouncedSetViewport]);

  // useAnimatedReaction watches savedScale/savedTranslate — these only change
  // on gesture end (set in .onEnd). The reaction fires on the UI thread where
  // shared values are always current, then pushes the result to JS via runOnJS.
  // Gated by viewportInitialized shared value — stays false until the initial
  // useEffect (cameraReady + layoutMeasured) has set the correct viewport.
  useAnimatedReaction(
    () => ({
      s: savedScale.value,
      tx: savedTranslateX.value,
      ty: savedTranslateY.value,
      ready: viewportInitialized.value,
    }),
    (current) => {
      if (!current.ready || current.s <= 0) return;
      const invScale = 1 / current.s;
      const dims = containerDimsSV.value;
      const wl = (0 - current.tx) * invScale;
      const wt = (0 - current.ty) * invScale;
      const wr = (dims.width - current.tx) * invScale;
      const wb = (dims.height - current.ty) * invScale;
      runOnJS(debouncedSetViewport)({
        left: wl - VIEWPORT_OVERSCAN_PX,
        top: wt - VIEWPORT_OVERSCAN_PX,
        right: wr + VIEWPORT_OVERSCAN_PX,
        bottom: wb + VIEWPORT_OVERSCAN_PX,
      });
    },
  );

  // Initial viewport: fires once BOTH camera is ready AND real layout measured.
  useEffect(() => {
    if (!cameraReady || !layoutMeasured) return;
    if (sortedTables.length < VIEWPORT_WINDOW_THRESHOLD) {
      setViewport(null);
      return;
    }
    recalculateViewportJS();
  }, [cameraReady, layoutMeasured, sortedTables.length, recalculateViewportJS]);

  // Windowed tables — only mount tables intersecting the visible viewport +
  // overscan buffer. Tables outside this zone are NOT mounted at all, saving
  // the cost of their Zustand subscriptions, gesture handlers, and SVG trees.
  // With 1000px overscan, most gestures don't trigger mount/unmount — only
  // the few tables at the panning edge. This keeps initial mount fast (fewer
  // full components) while the progressive render fills visibleTables over time.
  const windowedTables = useMemo(() => {
    if (sortedTables.length < VIEWPORT_WINDOW_THRESHOLD || !viewport) {
      return visibleTables;
    }
    return visibleTables.filter((t) => {
      const shapeDef = TABLE_SHAPES[t.shape_id as keyof typeof TABLE_SHAPES];
      const w = t.width ?? shapeDef?.width ?? 100;
      const h = t.height ?? shapeDef?.height ?? 100;
      return (
        t.x + w >= viewport.left &&
        t.x <= viewport.right &&
        t.y + h >= viewport.top &&
        t.y <= viewport.bottom
      );
    });
  }, [visibleTables, viewport, sortedTables.length]);

  const windowedTableIds = useMemo(
    () => new Set(windowedTables.map((t) => t.id)),
    [windowedTables],
  );

  // ── Lock toggle ──
  const recenterCanvas = () => {
    const s = withSpring(initialScaleRef.current, {
      damping: 12,
      mass: 1,
      stiffness: 100,
    });
    const tx = withSpring(initialTranslateXRef.current, {
      damping: 12,
      mass: 1,
      stiffness: 100,
    });
    const ty = withSpring(initialTranslateYRef.current, {
      damping: 12,
      mass: 1,
      stiffness: 100,
    });

    scale.value = s;
    translateX.value = tx;
    translateY.value = ty;
    savedScale.value = initialScaleRef.current;
    savedTranslateX.value = initialTranslateXRef.current;
    savedTranslateY.value = initialTranslateYRef.current;
  };

  const persistCameraState = (state: PersistedCameraState) => {
    cameraStateRef.current = state;
    storage.set(`floor_plan.view_state.${layoutId}`, JSON.stringify(state));
  };

  const handleLockToggle = () => {
    if (viewLocked) {
      // Unlock: enable gestures, don't recenter
      storage.set(viewLockedKey, false);
      setViewLockedTick((tick) => tick + 1);
    } else {
      // Lock: freeze the current view where the user left it
      const currentCamera = {
        scale: scale.value,
        translateX: translateX.value,
        translateY: translateY.value,
      };
      savedScale.value = currentCamera.scale;
      savedTranslateX.value = currentCamera.translateX;
      savedTranslateY.value = currentCamera.translateY;
      persistCameraState(currentCamera);
      storage.set(viewLockedKey, true);
      setViewLockedTick((tick) => tick + 1);
    }
  };

  const handleLockLongPress = () => {
    // Long-press gives the explicit reset action the tooltip describes
    recenterCanvas();
    persistCameraState({
      scale: initialScaleRef.current,
      translateX: initialTranslateXRef.current,
      translateY: initialTranslateYRef.current,
    });
    setShowTooltip(true);
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    tooltipTimer.current = setTimeout(() => setShowTooltip(false), 2000);
  };

  // Cleanup tooltip timer on unmount
  useEffect(() => {
    return () => {
      if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    };
  }, []);

  // Cancel all in-flight canvas animations on unmount.
  // Keep the gesture shared values (scale/translate/saved*) cancellation
  // because they may have in-flight withSpring momentum.
  useEffect(() => {
    return () => {
      cancelAnimation(scale);
      cancelAnimation(savedScale);
      cancelAnimation(translateX);
      cancelAnimation(translateY);
      cancelAnimation(savedTranslateX);
      cancelAnimation(savedTranslateY);
      if (viewportRafId.current != null) {
        cancelAnimationFrame(viewportRafId.current);
        viewportRafId.current = null;
      }
    };
  }, []);

  const [skeletonVisible, setSkeletonVisible] = useState(true);
  useEffect(() => {
    if (!isLoading) {
      const id = setTimeout(() => setSkeletonVisible(false), 300);
      return () => clearTimeout(id);
    }
  }, [isLoading]);

  return (
    <View
      onLayout={onLayout}
      className={`flex-1 relative overflow-hidden ${className}`}
      style={{ backgroundColor: "transparent" }}
    >
      {/* Skeleton - shown only while loading, no Reanimated crossfade */}
      {skeletonVisible && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 30,
            opacity: isLoading ? 1 : 0,
          }}
          pointerEvents="none"
        >
          <TableLayoutSkeleton tableCount={8} showControls={false} />
        </View>
      )}

      {/* Gesture Detector wraps entire canvas - must be at top level to catch touches */}
      <GestureDetector gesture={combinedGesture}>
        {/* Main Content */}
        <Animated.View style={{ flex: 1 }}>
          <Animated.View
            style={[
              canvasAnimatedStyle,
              {
                backgroundColor: "transparent",
                flex: 1,
                position: "relative" as const,
              },
            ]}
          >
            {/* Grid overlay — only in edit mode */}
            {isEditMode && (
              <View
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: worldDims.width,
                  height: worldDims.height,
                }}
                pointerEvents="none"
              >
                <Svg width={worldDims.width} height={worldDims.height}>
                  <SvgRect
                    x={0}
                    y={0}
                    width={worldDims.width}
                    height={worldDims.height}
                    fill="none"
                    stroke={colors.border}
                    strokeWidth={2}
                    opacity={0.7}
                  />
                  <SvgPath
                    d={gridPaths.minor}
                    stroke={colors.border}
                    strokeWidth={0.5}
                    strokeLinecap="square"
                    opacity={0.5}
                    fill="none"
                  />
                  <SvgPath
                    d={gridPaths.major}
                    stroke={colors.border}
                    strokeWidth={1}
                    strokeLinecap="square"
                    opacity={0.9}
                    fill="none"
                  />
                </Svg>
              </View>
            )}

            {/* Section overlay wash + merge connection lines */}
            {(sectionOverlays.length > 0 || showConnections) && (
              <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
                {/* Section color wash overlays */}
                {sectionOverlays.map((overlay) => (
                  <React.Fragment key={`section-${overlay.sectionId}`}>
                    <SvgRect
                      x={overlay.x}
                      y={overlay.y}
                      width={overlay.width}
                      height={overlay.height}
                      rx={12}
                      fill={overlay.section.color + "20"}
                      stroke={overlay.section.color + "40"}
                      strokeWidth={1}
                    />
                    <SvgText
                      x={overlay.x + 8}
                      y={overlay.y + 16}
                      fill={overlay.section.color + "99"}
                      fontSize={12}
                      fontWeight="600"
                    >
                      {overlay.section.name}
                    </SvgText>
                  </React.Fragment>
                ))}
                {windowedTables.map((table) => {
                  const mergedTableIds = table.session?.merged_tables;
                  if (mergedTableIds && mergedTableIds.length > 0) {
                    // Compute primary table center using actual dimensions
                    const primaryShapeDef =
                      TABLE_SHAPES[table.shape_id as keyof typeof TABLE_SHAPES];
                    const primaryW =
                      table.width ?? primaryShapeDef?.width ?? 100;
                    const primaryH =
                      table.height ?? primaryShapeDef?.height ?? 100;
                    const primaryCenter = {
                      x: table.x + primaryW / 2,
                      y: table.y + primaryH / 2,
                    };

                    return mergedTableIds.map((mergedId) => {
                      // Only draw if this table ID is "less than" the other ID to avoid double drawing
                      if (table.id >= mergedId) return null;
                      if (!windowedTableIds.has(mergedId)) return null;

                      const mergedTable = tablesById[mergedId];
                      if (!mergedTable) return null;

                      // Compute merged table center using actual dimensions
                      const mergedShapeDef =
                        TABLE_SHAPES[
                          mergedTable.shape_id as keyof typeof TABLE_SHAPES
                        ];
                      const mergedW =
                        mergedTable.width ?? mergedShapeDef?.width ?? 100;
                      const mergedH =
                        mergedTable.height ?? mergedShapeDef?.height ?? 100;
                      const mergedCenter = {
                        x: mergedTable.x + mergedW / 2,
                        y: mergedTable.y + mergedH / 2,
                      };
                      return (
                        <React.Fragment key={`${table.id}-${mergedId}`}>
                          {/* Glow layer */}
                          <Line
                            x1={primaryCenter.x}
                            y1={primaryCenter.y}
                            x2={mergedCenter.x}
                            y2={mergedCenter.y}
                            stroke="#F59E0B"
                            strokeWidth="6"
                            strokeOpacity="0.15"
                          />
                          {/* Core line */}
                          <Line
                            x1={primaryCenter.x}
                            y1={primaryCenter.y}
                            x2={mergedCenter.x}
                            y2={mergedCenter.y}
                            stroke="#F59E0B"
                            strokeWidth="1.5"
                            strokeOpacity="0.7"
                            strokeDasharray="6, 5"
                          />
                        </React.Fragment>
                      );
                    });
                  }
                  return null;
                })}
              </Svg>
            )}
            {windowedTables.map((table, index) => (
              <DraggableTable
                key={table.id}
                table={table}
                layoutId={layoutId}
                isEditMode={isEditMode}
                isSelected={selectedTableIdsSet.has(table.id)}
                interactionMode={interactionMode}
                onSelect={handleTableSelect}
                onPress={handleTableSelect}
                canvasScale={scale}
                index={index}
                enableEntryAnimation={false}
                disableEntryAnimation={true}
                sectionColor={
                  table.section_id
                    ? sectionsById?.[table.section_id]?.color
                    : undefined
                }
                wallEdgeFlags={wallEdgeFlagsById[table.id]}
                disableLongPress={disableLongPress}
                onLongPress={
                  onTableLongPress ? handleTableLongPress : undefined
                }
              />
            ))}
          </Animated.View>
        </Animated.View>
      </GestureDetector>

      {/* Lock Toggle Top-Right (to the left of legend toggle) */}
      <View
        style={{
          position: "absolute",
          top: s(10),
          right: s(56),
          zIndex: 30,
          alignItems: "center",
        }}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          onPress={handleLockToggle}
          onLongPress={handleLockLongPress}
          delayLongPress={500}
          style={{
            width: s(32),
            height: s(32),
            borderRadius: s(8),
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: viewLocked ? colors.panel : colors.warning + "20",
            borderWidth: 1,
            borderColor: viewLocked ? colors.border : colors.warning + "50",
          }}
        >
          <View style={{ transform: [{ translateY: s(-1) }] }}>
            {viewLocked ? (
              <Lock size={s(14)} color={colors.label} />
            ) : (
              <LockOpen size={s(14)} color={colors.warning} />
            )}
          </View>
        </TouchableOpacity>

        {/* Tooltip for long-press */}
        {showTooltip && (
          <View
            style={{
              marginTop: s(8),
              minWidth: s(120),
              paddingHorizontal: s(10),
              paddingVertical: s(6),
              borderRadius: s(8),
              backgroundColor: colors.card + "F0",
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: "center",
            }}
            pointerEvents="none"
          >
            <Text
              style={{
                fontSize: s(11),
                fontWeight: "500",
                color: colors.label,
                textAlign: "center",
              }}
            >
              Reset to center
            </Text>
          </View>
        )}
      </View>

      {/* Zoom Buttons - fixed at bottom-right of canvas */}
      <View
        style={{
          position: "absolute",
          bottom: s(12),
          right: s(12),
          zIndex: 20,
          gap: s(4),
          pointerEvents: "box-none",
        }}
      >
        <TouchableOpacity
          onPress={() => {
            const newScale = Math.min(3, scale.value + 0.2);
            const next = clampCanvasTranslation(
              translateX.value,
              translateY.value,
              newScale,
              containerDims.width,
              containerDims.height,
              worldDims.width,
              worldDims.height,
            );
            scale.value = withSpring(newScale, {
              damping: 12,
              mass: 1,
              stiffness: 100,
            });
            translateX.value = withSpring(next.x, {
              damping: 12,
              mass: 1,
              stiffness: 100,
            });
            translateY.value = withSpring(next.y, {
              damping: 12,
              mass: 1,
              stiffness: 100,
            });
            savedScale.value = newScale;
            savedTranslateX.value = next.x;
            savedTranslateY.value = next.y;
            if (viewLocked) {
              persistCameraState({
                scale: newScale,
                translateX: next.x,
                translateY: next.y,
              });
            }
          }}
          style={{
            pointerEvents: "auto",
            width: s(36),
            height: s(36),
            borderRadius: s(8),
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.panel,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Plus color={colors.label} size={s(16)} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            const newScale = Math.max(0.5, scale.value - 0.2);
            const next = clampCanvasTranslation(
              translateX.value,
              translateY.value,
              newScale,
              containerDims.width,
              containerDims.height,
              worldDims.width,
              worldDims.height,
            );
            scale.value = withSpring(newScale, {
              damping: 12,
              mass: 1,
              stiffness: 100,
            });
            translateX.value = withSpring(next.x, {
              damping: 12,
              mass: 1,
              stiffness: 100,
            });
            translateY.value = withSpring(next.y, {
              damping: 12,
              mass: 1,
              stiffness: 100,
            });
            savedScale.value = newScale;
            savedTranslateX.value = next.x;
            savedTranslateY.value = next.y;
            if (viewLocked) {
              persistCameraState({
                scale: newScale,
                translateX: next.x,
                translateY: next.y,
              });
            }
          }}
          style={{
            pointerEvents: "auto",
            width: s(36),
            height: s(36),
            borderRadius: s(8),
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.panel,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Minus color={colors.label} size={s(16)} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default React.memo(TableLayoutView, (prev, next) => {
  // Skip re-render if only session data changed (DraggableTable reads sessions directly)
  if (prev.tables.length !== next.tables.length) return false;
  if (prev.layoutId !== next.layoutId) return false;
  if (prev.isEditMode !== next.isEditMode) return false;
  if (prev.interactionMode !== next.interactionMode) return false;
  if (prev.disableLongPress !== next.disableLongPress) return false;
  if (prev.showConnections !== next.showConnections) return false;
  if (prev.sectionsById !== next.sectionsById) return false;
  if (prev.onTableSelect !== next.onTableSelect) return false;
  if (prev.onTableLongPress !== next.onTableLongPress) return false;
  // Only check geometry (x, y, width, height, rotation, shape_id) — not session fields
  for (let i = 0; i < prev.tables.length; i++) {
    const p = prev.tables[i];
    const n = next.tables[i];
    if (
      p.id !== n.id ||
      p.x !== n.x ||
      p.y !== n.y ||
      p.width !== n.width ||
      p.height !== n.height ||
      p.rotation !== n.rotation ||
      p.shape_id !== n.shape_id ||
      p.section_id !== n.section_id ||
      p.name !== n.name ||
      p.z_index !== n.z_index
    )
      return false;
    // Merge connection lines depend on session.merged_tables
    const pm = p.session?.merged_tables;
    const nm = n.session?.merged_tables;
    if (pm?.length !== nm?.length) return false;
    if (pm && nm) {
      for (let j = 0; j < pm.length; j++) {
        if (pm[j] !== nm[j]) return false;
      }
    }
  }
  return true;
});
