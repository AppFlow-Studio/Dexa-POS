import { AddTableBottomSheet } from "@/components/tables/AddTableBottomSheet";
import DraggableTable from "@/components/tables/DraggableTable";
import PropertiesPanel from "@/components/tables/PropertiesPanel";
import QuickSetupPanel from "@/components/tables/QuickSetupPanel";
import {
  DragToAddProvider,
  useDragToAddContext,
} from "@/contexts/DragToAddContext";
import { SHAPE_OPTIONS, TABLE_SHAPES } from "@/lib/table-shapes";
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import BottomSheet from "@gorhom/bottom-sheet";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Maximize2, Minus, Plus, Redo2, Undo2 } from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, Pattern, Rect, Line as SvgLine } from "react-native-svg";

const SHAPE_SIZE = 100;
const FINGER_Y_OFFSET = 0;
const DEFAULT_CANVAS_WORLD_WIDTH = 2400;
const DEFAULT_CANVAS_WORLD_HEIGHT = 1600;
const MIN_CANVAS_DIMENSION = 600;
const MAX_CANVAS_DIMENSION = 6000;

// Shape size lookup for ghost rendering — plain object, accessible in worklets.
const SHAPE_SIZES: Record<string, { w: number; h: number }> =
  Object.fromEntries(
    Object.entries(TABLE_SHAPES).map(([id, shape]) => [
      id,
      { w: (shape as any).width || 80, h: (shape as any).height || 80 },
    ]),
  );

const clamp = (value: number, min: number, max: number) => {
  "worklet";
  return Math.min(Math.max(value, min), max);
};

const getNextAvailableTableNumber = (names: string[]) => {
  const used = new Set(
    names
      .map((name) => {
        const trimmed = name.trim();
        if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
        const prefixedMatch = /^T-(\d+)$/.exec(trimmed);
        return prefixedMatch ? parseInt(prefixedMatch[1], 10) : NaN;
      })
      .filter((n) => Number.isInteger(n) && n > 0),
  );

  let next = 1;
  while (used.has(next)) next += 1;
  return next;
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

const GridPattern = () => (
  <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
    <Defs>
      <Pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
        <SvgLine
          x1="20"
          y1="0"
          x2="20"
          y2="20"
          stroke={colors.border}
          strokeWidth="0.5"
          opacity="0.5"
        />
        <SvgLine
          x1="0"
          y1="20"
          x2="20"
          y2="20"
          stroke={colors.border}
          strokeWidth="0.5"
          opacity="0.5"
        />
      </Pattern>
      <Pattern
        id="grid-major"
        width="100"
        height="100"
        patternUnits="userSpaceOnUse"
      >
        <SvgLine
          x1="100"
          y1="0"
          x2="100"
          y2="100"
          stroke={colors.border}
          strokeWidth="1"
          opacity="0.9"
        />
        <SvgLine
          x1="0"
          y1="100"
          x2="100"
          y2="100"
          stroke={colors.border}
          strokeWidth="1"
          opacity="0.9"
        />
      </Pattern>
    </Defs>
    <Rect width="100%" height="100%" fill="url(#grid)" />
    <Rect width="100%" height="100%" fill="url(#grid-major)" />
  </Svg>
);

const LayoutEditorScreenContent = () => {
  const router = useRouter();
  const { layoutId: layoutIdParam } = useLocalSearchParams<{
    layoutId?: string | string[];
  }>();
  const layoutId = Array.isArray(layoutIdParam)
    ? layoutIdParam[0]
    : layoutIdParam;

  const {
    floorPlans,
    tables: storeTables,
    selectedTableIds,
    selectMultipleTables,
    clearSelection,
    addTable,
    undo,
    redo,
    past,
    future,
    setActiveFloorPlan,
    activeFloorPlanId,
    updateFloorPlan,
    isLoading,
    loadingFloorPlanId,
  } = useFloorPlanStore();

  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);

  // In edit mode: tapping an object selects only that object (single-select).
  // Tapping the already-selected object deselects it.
  const handleEditModeSelect = (tableId: string) => {
    if (selectedTableIds.length === 1 && selectedTableIds[0] === tableId) {
      clearSelection();
    } else {
      selectMultipleTables([tableId]);
    }
  };

  const activeLayout = useMemo(
    () => floorPlans.find((l) => l.id === layoutId),
    [floorPlans, layoutId],
  );
  const tables = storeTables;
  const tablesRef = useRef(tables);
  const isOpeningLayout =
    !!layoutId &&
    isLoading &&
    (activeFloorPlanId !== layoutId || !tables.length);

  useEffect(() => {
    tablesRef.current = tables;
  }, [tables]);

  useEffect(() => {
    if (
      layoutId &&
      layoutId !== useFloorPlanStore.getState().activeFloorPlanId
    ) {
      setActiveFloorPlan(layoutId);
    }
    return () => clearSelection();
  }, [layoutId, setActiveFloorPlan, clearSelection]);

  const [isQuickSetupOpen, setQuickSetupOpen] = useState(tables.length === 0);
  const [isCanvasSizeModalOpen, setCanvasSizeModalOpen] = useState(false);
  const [canvasWidthInput, setCanvasWidthInput] = useState("");
  const [canvasHeightInput, setCanvasHeightInput] = useState("");
  const canvasRef = useRef<View>(null);
  const outerViewRef = useRef<View>(null);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  // Canvas screen bounds — updated via onLayout, read on UI thread for instant drop calc.
  const canvasOriginXSV = useSharedValue(0);
  const canvasOriginYSV = useSharedValue(0);
  const canvasWidthSV = useSharedValue(0);
  const canvasHeightSV = useSharedValue(0);
  const canvasWorldWidthSV = useSharedValue(DEFAULT_CANVAS_WORLD_WIDTH);
  const canvasWorldHeightSV = useSharedValue(DEFAULT_CANVAS_WORLD_HEIGHT);
  // Outer view screen offset — needed to correctly position the ghost inside the outer View.
  const outerOffsetX = useSharedValue(0);
  const outerOffsetY = useSharedValue(0);

  useEffect(() => {
    const rawWidth = activeLayout?.canvas_width;
    const rawHeight = activeLayout?.canvas_height;
    console.log("[edit-layout] activeLayout canvas dimensions:", {
      rawWidth,
      rawHeight,
      activeLayoutId: activeLayout?.id,
      layoutId,
    });
    const nextWidth = rawWidth ?? DEFAULT_CANVAS_WORLD_WIDTH;
    const nextHeight = rawHeight ?? DEFAULT_CANVAS_WORLD_HEIGHT;
    canvasWorldWidthSV.value = nextWidth;
    canvasWorldHeightSV.value = nextHeight;
    setCanvasWidthInput(String(nextWidth));
    setCanvasHeightInput(String(nextHeight));
  }, [activeLayout, canvasWorldHeightSV, canvasWorldWidthSV]);

  const { draggedShapeId, dragPosition, isDraggingNewObject, dropPending } =
    useDragToAddContext();
  const panGesture = Gesture.Pan()
    .minDistance(8)
    .activeOffsetX([-8, 8])
    .activeOffsetY([-8, 8])
    .onUpdate((e) => {
      const next = clampCanvasTranslation(
        savedTranslateX.value + e.translationX,
        savedTranslateY.value + e.translationY,
        scale.value,
        canvasWidthSV.value,
        canvasHeightSV.value,
        canvasWorldWidthSV.value,
        canvasWorldHeightSV.value,
      );
      translateX.value = next.x;
      translateY.value = next.y;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      const nextScale = Math.max(0.5, Math.min(3, savedScale.value * e.scale));
      const next = clampCanvasTranslation(
        translateX.value,
        translateY.value,
        nextScale,
        canvasWidthSV.value,
        canvasHeightSV.value,
        canvasWorldWidthSV.value,
        canvasWorldHeightSV.value,
      );
      scale.value = nextScale;
      translateX.value = next.x;
      translateY.value = next.y;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const canvasTapGesture = Gesture.Tap().onEnd(() => {
    runOnJS(clearSelection)();
  });

  const canvasInteractionGesture = Gesture.Simultaneous(
    pinchGesture,
    panGesture,
    canvasTapGesture,
  );

  const canvasAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const ghostShapeAnimatedStyle = useAnimatedStyle(() => {
    const shapeId = draggedShapeId.value as string | null;
    const dims = shapeId
      ? (SHAPE_SIZES[shapeId] ?? { w: SHAPE_SIZE, h: SHAPE_SIZE })
      : { w: SHAPE_SIZE, h: SHAPE_SIZE };
    const w = dims.w;
    const h = dims.h;
    return {
      position: "absolute",
      width: w,
      height: h,
      // Subtract outerView offset: absoluteX/Y are window coords, but left/top are relative to outerView.
      left: dragPosition.value.x - outerOffsetX.value - w / 2,
      top: dragPosition.value.y - outerOffsetY.value - h / 2,
      // Match canvas zoom: preview should represent on-canvas rendered size.
      transform: [{ scale: scale.value }],
      opacity: isDraggingNewObject.value ? 0.8 : 0,
      zIndex: 99999,
      elevation: 99999,
      pointerEvents: "none",
    };
  });

  const handleZoom = (direction: "in" | "out") => {
    const clamped = Math.max(
      0.5,
      Math.min(3, direction === "in" ? scale.value * 1.2 : scale.value / 1.2),
    );
    const next = clampCanvasTranslation(
      translateX.value,
      translateY.value,
      clamped,
      canvasWidthSV.value,
      canvasHeightSV.value,
      canvasWorldWidthSV.value,
      canvasWorldHeightSV.value,
    );
    scale.value = withTiming(clamped);
    translateX.value = withTiming(next.x);
    translateY.value = withTiming(next.y);
    savedScale.value = clamped;
    savedTranslateX.value = next.x;
    savedTranslateY.value = next.y;
  };

  const recenterCanvas = () => {
    scale.value = withTiming(1);
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedScale.value = 1;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  };

  const handleSaveCanvasSize = async () => {
    if (!activeLayout) return;

    const nextWidth = clamp(
      parseInt(canvasWidthInput, 10) || activeLayout.canvas_width,
      MIN_CANVAS_DIMENSION,
      MAX_CANVAS_DIMENSION,
    );
    const nextHeight = clamp(
      parseInt(canvasHeightInput, 10) || activeLayout.canvas_height,
      MIN_CANVAS_DIMENSION,
      MAX_CANVAS_DIMENSION,
    );

    try {
      await updateFloorPlan(activeLayout.id, {
        canvas_width: nextWidth,
        canvas_height: nextHeight,
      });
      canvasWorldWidthSV.value = nextWidth;
      canvasWorldHeightSV.value = nextHeight;

      const next = clampCanvasTranslation(
        translateX.value,
        translateY.value,
        scale.value,
        canvasWidthSV.value,
        canvasHeightSV.value,
        nextWidth,
        nextHeight,
      );
      translateX.value = withTiming(next.x);
      translateY.value = withTiming(next.y);
      savedTranslateX.value = next.x;
      savedTranslateY.value = next.y;
      setCanvasWidthInput(String(nextWidth));
      setCanvasHeightInput(String(nextHeight));
      setCanvasSizeModalOpen(false);
    } catch (e) {
      console.error("[edit-layout] save canvas size failed", e);
    }
  };

  const handleAddMultipleTables = (
    items: { shapeId: keyof typeof TABLE_SHAPES; quantity: number }[],
  ) => {
    const canvasW = activeLayout?.canvas_width ?? DEFAULT_CANVAS_WORLD_WIDTH;
    const canvasH = activeLayout?.canvas_height ?? DEFAULT_CANVAS_WORLD_HEIGHT;

    // Compute a column count that fits within the canvas with padding
    const PADDING = 40;
    const CELL_W = 140;
    const CELL_H = 140;
    const COLS = Math.max(1, Math.floor((canvasW - PADDING) / CELL_W));
    const ORIGIN_X = PADDING;
    const ORIGIN_Y = PADDING;

    // Flatten to a list of shapeIds in order
    const allShapes = items.flatMap((item) =>
      Array.from({ length: item.quantity }, () => item.shapeId),
    );

    const reservedNames = new Set(tables.map((table) => table.name.trim()));

    const additions = allShapes.map((shapeId, index) => {
      const col = index % COLS;
      const row = Math.floor(index / COLS);
      // Clamp x,y to the canvas so that no table spills outside even if
      // more are added than fit one screenful.
      const rawX = ORIGIN_X + col * CELL_W;
      const rawY = ORIGIN_Y + row * CELL_H;
      const shapeDef = TABLE_SHAPES[shapeId as keyof typeof TABLE_SHAPES];
      const w = shapeDef?.width ?? 80;
      const h = shapeDef?.height ?? 80;
      const clampedX = Math.max(0, Math.min(rawX, canvasW - w));
      const clampedY = Math.max(0, Math.min(rawY, canvasH - h));
      const nextName = String(
        getNextAvailableTableNumber(Array.from(reservedNames)),
      );
      reservedNames.add(nextName);
      return addTable({
        name: nextName,
        shape_id: shapeId as string,
        x: clampedX,
        y: clampedY,
      });
    });

    Promise.all(additions).catch(() => {});
    setQuickSetupOpen(false);
  };

  const selectedTable = useMemo(() => {
    if (selectedTableIds.length !== 1) return null;
    return tables.find((t) => t.id === selectedTableIds[0]) || null;
  }, [selectedTableIds, tables]);

  const addTableSheetRef = useRef<BottomSheet>(null);

  const resetDragToAddState = () => {
    draggedShapeId.value = null;
    isDraggingNewObject.value = false;
    dropPending.value = false;
  };

  const performDrop = async (
    shapeId: string,
    canvasCenterX: number,
    canvasCenterY: number,
  ) => {
    if (!shapeId || !layoutId) {
      resetDragToAddState();
      return;
    }
    if (activeFloorPlanId !== layoutId) {
      try {
        await setActiveFloorPlan(layoutId);
      } catch {
        resetDragToAddState();
        return;
      }
    }
    const shapeDef = TABLE_SHAPES[shapeId as keyof typeof TABLE_SHAPES];
    if (!shapeDef) {
      resetDragToAddState();
      return;
    }

    // canvasCenterX/Y are the canvas-space center of the drop, computed on the UI thread.
    const shapeW = shapeDef.width || 80;
    const shapeH = shapeDef.height || 80;
    const canvasW = activeLayout?.canvas_width ?? DEFAULT_CANVAS_WORLD_WIDTH;
    const canvasH = activeLayout?.canvas_height ?? DEFAULT_CANVAS_WORLD_HEIGHT;
    const finalX = Math.max(
      0,
      Math.min(canvasCenterX - shapeW / 2, canvasW - shapeW),
    );
    const finalY = Math.max(
      0,
      Math.min(canvasCenterY - shapeH / 2, canvasH - shapeH),
    );

    let defaultName = "";
    if (shapeDef.category === "table") {
      defaultName = String(
        getNextAvailableTableNumber(tablesRef.current.map((t) => t.name)),
      );
    } else {
      const base = shapeDef.label;
      const existing = tablesRef.current.filter((t) => t.name.startsWith(base));
      defaultName =
        existing.length === 0 ? base : `${base} ${existing.length + 1}`;
    }

    // Hide the ghost immediately — don't wait for the network call
    isDraggingNewObject.value = false;
    try {
      await addTable({
        name: defaultName,
        shape_id: shapeId,
        x: finalX,
        y: finalY,
      });
      addTableSheetRef.current?.close();
    } catch (e) {
      console.error("[edit-layout] drop failed", e);
    } finally {
      resetDragToAddState();
    }
  };

  useAnimatedReaction(
    () => dropPending.value,
    (isPending, wasPending) => {
      if (isPending && !wasPending && draggedShapeId.value) {
        // Compute canvas-space coords on the UI thread — same frame as the drop, no async.
        const absX = dragPosition.value.x;
        const absY = dragPosition.value.y;
        const s = scale.value;
        const tx = translateX.value;
        const ty = translateY.value;
        const ox = canvasOriginXSV.value;
        const oy = canvasOriginYSV.value;
        const W = canvasWidthSV.value;
        const H = canvasHeightSV.value;
        const localX = absX - ox;
        const localY = absY - oy;
        // Invert: [translateX(tx), translateY(ty), scale(s)] around canvas center (W/2, H/2)
        // screen_x = originX + tx + s*(canvas_x - W/2) + W/2
        // canvas_x = (localX - tx - W/2) / s + W/2
        const cx =
          W > 0 ? (localX - tx - W / 2) / s + W / 2 : (localX - tx) / s;
        const cy =
          H > 0 ? (localY - ty - H / 2) / s + H / 2 : (localY - ty) / s;
        runOnJS(performDrop)(draggedShapeId.value, cx, cy);
      }
    },
    [],
  );

  const hasHistory = past.length > 0;
  const hasFuture = future.length > 0;

  return (
    <View
      ref={outerViewRef}
      style={{ flex: 1, backgroundColor: colors.screen }}
      onLayout={() =>
        outerViewRef.current?.measureInWindow((x, y) => {
          outerOffsetX.value = x;
          outerOffsetY.value = y;
        })
      }
    >
      {/* ── Loading Overlay ── */}
      {isOpeningLayout && (
        <View
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            zIndex: 20,
            backgroundColor: colors.screen + "D9",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View
            style={{
              minWidth: s(200),
              paddingHorizontal: s(20),
              paddingVertical: s(18),
              borderRadius: s(16),
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: "center",
            }}
          >
            <ActivityIndicator
              size="large"
              color={colors.teal}
              style={{ marginBottom: s(10) }}
            />
            <Text
              style={{
                color: colors.heading,
                fontSize: s(15),
                fontWeight: "700",
              }}
            >
              Opening layout...
            </Text>
            <Text
              style={{
                color: colors.muted,
                fontSize: s(12),
                textAlign: "center",
                marginTop: s(4),
              }}
            >
              Loading walls, tables, and sections
            </Text>
          </View>
        </View>
      )}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: s(14),
          paddingVertical: s(10),
          backgroundColor: colors.card,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          zIndex: 10,
        }}
      >
        {/* Left: title */}
        <View
          style={{ flexDirection: "row", alignItems: "center", gap: s(10) }}
        >
          <View>
            <Text
              style={{
                color: colors.heading,
                fontSize: s(14),
                fontWeight: "700",
              }}
            >
              {activeLayout?.name ?? "Loading…"}
            </Text>
            <Text
              style={{ color: colors.muted, fontSize: s(10), marginTop: s(1) }}
            >
              {tables.length} object{tables.length !== 1 ? "s" : ""} on canvas
            </Text>
          </View>

          {/* Undo / Redo */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginLeft: s(8),
              backgroundColor: colors.screen,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: s(8),
              overflow: "hidden",
            }}
          >
            <TouchableOpacity
              onPress={undo}
              disabled={!hasHistory}
              style={{ padding: s(8), opacity: hasHistory ? 1 : 0.3 }}
            >
              <Undo2 size={s(15)} color={colors.label} />
            </TouchableOpacity>
            <View
              style={{
                width: 1,
                height: s(20),
                backgroundColor: colors.border,
              }}
            />
            <TouchableOpacity
              onPress={redo}
              disabled={!hasFuture}
              style={{ padding: s(8), opacity: hasFuture ? 1 : 0.3 }}
            >
              <Redo2 size={s(15)} color={colors.label} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Right: Add + Save */}
        <View style={{ flexDirection: "row", gap: s(8) }}>
          <TouchableOpacity
            onPress={() => setCanvasSizeModalOpen(true)}
            style={{
              paddingHorizontal: s(14),
              paddingVertical: s(8),
              borderRadius: s(8),
              backgroundColor: colors.screen,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text
              style={{
                color: colors.label,
                fontWeight: "600",
                fontSize: s(13),
              }}
            >
              Canvas
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => addTableSheetRef.current?.expand()}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: s(6),
              paddingHorizontal: s(14),
              paddingVertical: s(8),
              borderRadius: s(8),
              backgroundColor: colors.teal + "20",
              borderWidth: 1,
              borderColor: colors.teal + "60",
            }}
          >
            <Plus size={s(14)} color={colors.teal} />
            <Text
              style={{ color: colors.teal, fontWeight: "700", fontSize: s(13) }}
            >
              Add Object
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              paddingHorizontal: s(14),
              paddingVertical: s(8),
              borderRadius: s(8),
              backgroundColor: colors.screen,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text
              style={{
                color: colors.label,
                fontWeight: "600",
                fontSize: s(13),
              }}
            >
              Save & Exit
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Canvas ── */}
      {isOpeningLayout ? (
        <View style={{ flex: 1, backgroundColor: colors.screen }} />
      ) : (
        <GestureDetector gesture={canvasInteractionGesture}>
          <View
            ref={canvasRef}
            style={{
              flex: 1,
              position: "relative",
              overflow: "hidden",
              backgroundColor: colors.screen,
            }}
            onLayout={() =>
              canvasRef.current?.measureInWindow((x, y, w, h) => {
                canvasOriginXSV.value = x;
                canvasOriginYSV.value = y;
                canvasWidthSV.value = w;
                canvasHeightSV.value = h;
              })
            }
          >
            <Animated.View
              style={[StyleSheet.absoluteFillObject, canvasAnimatedStyle]}
              pointerEvents="none"
            >
              <GridPattern />
            </Animated.View>

            <Animated.View
              style={[StyleSheet.absoluteFillObject, canvasAnimatedStyle]}
              pointerEvents="box-none"
            >
              {tables.map((table) => (
                <DraggableTable
                  key={table.id}
                  table={table}
                  layoutId={activeLayout?.id ?? layoutId ?? ""}
                  isEditMode={true}
                  isSelected={selectedTableIds.includes(table.id)}
                  onSelect={() => handleEditModeSelect(table.id)}
                  onPress={() => handleEditModeSelect(table.id)}
                  canvasScale={scale}
                  interactionMode="normal"
                />
              ))}
            </Animated.View>

            {/* ── Zoom Controls ── */}
            <View
              style={{
                position: "absolute",
                bottom: s(14),
                right: s(14),
                gap: s(6),
                zIndex: 20,
              }}
            >
              {[
                {
                  icon: <Plus size={s(15)} color={colors.label} />,
                  onPress: () => handleZoom("in"),
                },
                {
                  icon: <Minus size={s(15)} color={colors.label} />,
                  onPress: () => handleZoom("out"),
                },
                {
                  icon: <Maximize2 size={s(15)} color={colors.label} />,
                  onPress: recenterCanvas,
                },
              ].map((btn, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={btn.onPress}
                  style={{
                    width: s(36),
                    height: s(36),
                    borderRadius: s(8),
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: colors.card,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  {btn.icon}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </GestureDetector>
      )}

      <QuickSetupPanel
        isOpen={isQuickSetupOpen}
        onClose={() => setQuickSetupOpen(false)}
        onAddMultiple={handleAddMultipleTables}
      />

      <Modal
        visible={isCanvasSizeModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCanvasSizeModalOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.6)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <View
              style={{
                width: s(360),
                backgroundColor: colors.card,
                borderRadius: s(16),
                borderWidth: 1,
                borderColor: colors.border,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  paddingHorizontal: s(18),
                  paddingVertical: s(14),
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              >
                <Text
                  style={{
                    color: colors.heading,
                    fontSize: s(14),
                    fontWeight: "700",
                  }}
                >
                  Canvas Size
                </Text>
                <Text
                  style={{
                    color: colors.muted,
                    fontSize: s(11),
                    marginTop: s(3),
                  }}
                >
                  Set the stored floor plan workspace size.
                </Text>
              </View>

              <View style={{ padding: s(16), gap: s(12) }}>
                <View>
                  <Text
                    style={{
                      color: colors.muted,
                      fontSize: s(10),
                      marginBottom: s(6),
                    }}
                  >
                    Width
                  </Text>
                  <TextInput
                    value={canvasWidthInput}
                    onChangeText={setCanvasWidthInput}
                    keyboardType="number-pad"
                    maxLength={4}
                    style={{
                      backgroundColor: colors.screen,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: s(8),
                      paddingHorizontal: s(10),
                      paddingVertical: s(10),
                      color: colors.heading,
                      fontSize: s(13),
                    }}
                  />
                </View>

                <View>
                  <Text
                    style={{
                      color: colors.muted,
                      fontSize: s(10),
                      marginBottom: s(6),
                    }}
                  >
                    Height
                  </Text>
                  <TextInput
                    value={canvasHeightInput}
                    onChangeText={setCanvasHeightInput}
                    keyboardType="number-pad"
                    maxLength={4}
                    style={{
                      backgroundColor: colors.screen,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: s(8),
                      paddingHorizontal: s(10),
                      paddingVertical: s(10),
                      color: colors.heading,
                      fontSize: s(13),
                    }}
                  />
                </View>

                <Text style={{ color: colors.muted, fontSize: s(11) }}>
                  Min {MIN_CANVAS_DIMENSION}, max {MAX_CANVAS_DIMENSION}.
                </Text>
              </View>

              <View
                style={{
                  flexDirection: "row",
                  gap: s(8),
                  padding: s(14),
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                }}
              >
                <TouchableOpacity
                  onPress={() => setCanvasSizeModalOpen(false)}
                  style={{
                    flex: 1,
                    paddingVertical: s(10),
                    borderRadius: s(9),
                    alignItems: "center",
                    backgroundColor: colors.screen,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Text
                    style={{
                      color: colors.label,
                      fontWeight: "600",
                      fontSize: s(13),
                    }}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSaveCanvasSize}
                  style={{
                    flex: 1,
                    paddingVertical: s(10),
                    borderRadius: s(9),
                    alignItems: "center",
                    backgroundColor: colors.teal + "20",
                    borderWidth: 1,
                    borderColor: colors.teal + "60",
                  }}
                >
                  <Text
                    style={{
                      color: colors.teal,
                      fontWeight: "700",
                      fontSize: s(13),
                    }}
                  >
                    Save
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {selectedTable && layoutId && (
        <PropertiesPanel table={selectedTable} layoutId={layoutId} />
      )}

      <AddTableBottomSheet
        bottomSheetRef={addTableSheetRef as React.RefObject<BottomSheet>}
        onClose={() => addTableSheetRef.current?.close()}
      />

      <Animated.View style={ghostShapeAnimatedStyle} pointerEvents="none">
        {SHAPE_OPTIONS.map((option) => {
          const ShapeComp = option.component;
          return (
            <GhostShapeWrapper
              key={option.id}
              id={option.id}
              currentId={draggedShapeId}
            >
              <ShapeComp
                color={colors.teal}
                height={SHAPE_SIZES[option.id]?.h ?? SHAPE_SIZE}
                width={SHAPE_SIZES[option.id]?.w ?? SHAPE_SIZE}
              />
            </GhostShapeWrapper>
          );
        })}
      </Animated.View>
    </View>
  );
};

const GhostShapeWrapper = ({
  id,
  currentId,
  children,
}: {
  id: string;
  currentId: any;
  children: React.ReactNode;
}) => {
  const style = useAnimatedStyle(() => ({
    display: currentId.value === id ? "flex" : "none",
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
};

const LayoutEditorScreen = () => (
  <DragToAddProvider>
    <LayoutEditorScreenContent />
  </DragToAddProvider>
);

export default LayoutEditorScreen;
