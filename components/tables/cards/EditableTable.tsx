import {
    FREE_PLACEMENT_SHAPE_IDS,
    RIGHT_ANGLE_ROTATION_SHAPE_IDS,
    TABLE_SHAPES,
    WALL_CORNER_SNAP_SHAPE_IDS,
} from "@/lib/table-shapes";
import { findWallCornerSnap } from "@/lib/wallCornerSnap";
import { useFloorPlanEditorStore } from "@/stores/useFloorPlanEditorStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import React, { useCallback, useEffect } from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
    cancelAnimation,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
} from "react-native-reanimated";
import TableCardContent, { PulsingBorder } from "./TableCardContent";
import { DraggableTableProps } from "./types";
import { useTableCardData } from "./useTableCardData";

/**
 * Edit-mode card. Owns all the drag / rotate / wall-resize shared values and
 * gestures. Only mounted on the floor-plan editor screen, so its heavier
 * Reanimated footprint is paid only when actually editing the layout.
 */
const EditableTable: React.FC<
  DraggableTableProps & {
    isTableType: boolean;
    isWall: boolean;
    shapeDef: (typeof TABLE_SHAPES)[keyof typeof TABLE_SHAPES] | undefined;
  }
> = ({
  table,
  isTableType,
  isWall,
  shapeDef,
  isSelected,
  canvasScale,
  onSelect,
  wallEdgeFlags,
  sectionColor,
}) => {
  const DRAG_HOLD_MS = 220;
  const updateTablePosition = useFloorPlanStore((s) => s.updateTablePosition);
  const updateTableGeometry = useFloorPlanStore((s) => s.updateTableGeometry);
  const saveSnapshot = useFloorPlanStore((s) => s.saveSnapshot);
  const isLocked = useFloorPlanEditorStore((s) =>
    s.lockedObjectIds.includes(table.id),
  );

  const data = useTableCardData(
    table,
    isTableType,
    isWall,
    wallEdgeFlags,
    shapeDef,
  );
  const { effectiveWidth, effectiveHeight, newAttention } = data;

  const snapsToWallCorners = WALL_CORNER_SNAP_SHAPE_IDS.has(table.shape_id);
  const hasFreePlacement = FREE_PLACEMENT_SHAPE_IDS.has(table.shape_id);

  const wallResizeWidth = useSharedValue(table.width ?? shapeDef?.width ?? 100);
  const wallResizeHeight = useSharedValue(
    table.height ?? shapeDef?.height ?? 100,
  );
  const wallResizeStartWidth = useSharedValue(
    table.width ?? shapeDef?.width ?? 100,
  );
  const wallResizeStartX = useSharedValue(table.x);
  const wallResizeStartY = useSharedValue(table.y);

  useEffect(() => {
    wallResizeWidth.value = table.width ?? shapeDef?.width ?? 100;
    wallResizeHeight.value = table.height ?? shapeDef?.height ?? 100;
    wallResizeStartWidth.value = table.width ?? shapeDef?.width ?? 100;
    wallResizeStartX.value = table.x;
    wallResizeStartY.value = table.y;
  }, [
    table.width,
    table.height,
    table.x,
    table.y,
    shapeDef?.width,
    shapeDef?.height,
    wallResizeWidth,
    wallResizeHeight,
    wallResizeStartWidth,
    wallResizeStartX,
    wallResizeStartY,
  ]);

  const editWidth = isWall ? wallResizeWidth.value : effectiveWidth;
  const editHeight = isWall ? wallResizeHeight.value : effectiveHeight;

  const translateX = useSharedValue(table.x);
  const translateY = useSharedValue(table.y);
  const rotation = useSharedValue(table.rotation);
  const dragContext = useSharedValue({ x: 0, y: 0 });
  const rotateContext = useSharedValue(0);
  const isDragging = useSharedValue(false);

  // --- SYNC WITH UNDO/REDO ---
  useEffect(() => {
    translateX.value = table.x;
    translateY.value = table.y;
    rotation.value = table.rotation || 0;
  }, [table.x, table.y, table.rotation]);

  // Cancel any in-flight momentum on the camera-relative shared values on unmount.
  useEffect(() => {
    return () => {
      cancelAnimation(translateX);
      cancelAnimation(translateY);
      cancelAnimation(rotation);
      cancelAnimation(wallResizeWidth);
      cancelAnimation(wallResizeHeight);
    };
  }, []);

  const GRID_SIZE = 5;
  const MIN_WALL_LENGTH = 40;

  const projectResizeDelta = useCallback(
    (translationX: number, translationY: number) => {
      "worklet";
      const angle = (rotation.value * Math.PI) / 180;
      return (
        (translationX * Math.cos(angle) + translationY * Math.sin(angle)) /
        canvasScale.value
      );
    },
    [canvasScale, rotation],
  );

  const getAnchoredResizePosition = useCallback(
    (nextWidth: number, anchor: "start" | "end") => {
      "worklet";
      const delta = nextWidth - wallResizeStartWidth.value;
      const angle = (rotation.value * Math.PI) / 180;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      if (anchor === "start") {
        return {
          x: wallResizeStartX.value + (delta * (cos - 1)) / 2,
          y: wallResizeStartY.value + (delta * sin) / 2,
        };
      }

      return {
        x: wallResizeStartX.value - (delta * (1 + cos)) / 2,
        y: wallResizeStartY.value - (delta * sin) / 2,
      };
    },
    [rotation, wallResizeStartWidth, wallResizeStartX, wallResizeStartY],
  );

  // Called on JS thread at drag end: resolve final snapped position and persist.
  const finalizeDrop = useCallback(
    (rawX: number, rawY: number, rot: number) => {
      let finalX: number;
      let finalY: number;

      if (hasFreePlacement) {
        finalX = rawX;
        finalY = rawY;
      } else if (snapsToWallCorners) {
        const snap = findWallCornerSnap(
          rawX,
          rawY,
          editWidth,
          editHeight,
          rot,
          table.shape_id,
          table.id,
        );
        finalX = snap ? snap.x : Math.round(rawX / GRID_SIZE) * GRID_SIZE;
        finalY = snap ? snap.y : Math.round(rawY / GRID_SIZE) * GRID_SIZE;
      } else {
        finalX = Math.round(rawX / GRID_SIZE) * GRID_SIZE;
        finalY = Math.round(rawY / GRID_SIZE) * GRID_SIZE;
      }

      translateX.value = finalX;
      translateY.value = finalY;
      updateTablePosition(table.id, finalX, finalY, rot);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasFreePlacement, snapsToWallCorners, editWidth, editHeight, table.id],
  );

  const dragGesture = Gesture.Pan()
    .enabled(!isLocked)
    .activateAfterLongPress(DRAG_HOLD_MS)
    .minDistance(12)
    .activeOffsetX([-12, 12])
    .activeOffsetY([-12, 12])
    .onStart(() => {
      runOnJS(saveSnapshot)();
      dragContext.value = { x: translateX.value, y: translateY.value };
      isDragging.value = true;
    })
    .onUpdate((event) => {
      translateX.value =
        dragContext.value.x + event.translationX / canvasScale.value;
      translateY.value =
        dragContext.value.y + event.translationY / canvasScale.value;
    })
    .onEnd(() => {
      isDragging.value = false;
      runOnJS(finalizeDrop)(translateX.value, translateY.value, rotation.value);
    })
    .onFinalize(() => {
      isDragging.value = false;
    });

  const wallResizeRightGesture = Gesture.Pan()
    .enabled(isSelected && isWall && !isLocked)
    .onStart(() => {
      runOnJS(saveSnapshot)();
      wallResizeStartWidth.value = wallResizeWidth.value;
      wallResizeStartX.value = translateX.value;
      wallResizeStartY.value = translateY.value;
    })
    .onUpdate((event) => {
      const projectedDelta = projectResizeDelta(
        event.translationX,
        event.translationY,
      );
      const nextWidth = Math.max(
        MIN_WALL_LENGTH,
        wallResizeStartWidth.value + projectedDelta,
      );
      const anchoredPosition = getAnchoredResizePosition(nextWidth, "start");
      wallResizeWidth.value = nextWidth;
      translateX.value = anchoredPosition.x;
      translateY.value = anchoredPosition.y;
    })
    .onEnd((event) => {
      const projectedDelta = projectResizeDelta(
        event.translationX,
        event.translationY,
      );
      const nextWidth = Math.max(
        MIN_WALL_LENGTH,
        wallResizeStartWidth.value + projectedDelta,
      );
      const committedWidth = Math.round(nextWidth);
      const anchoredPosition = getAnchoredResizePosition(
        committedWidth,
        "start",
      );
      wallResizeWidth.value = committedWidth;
      translateX.value = anchoredPosition.x;
      translateY.value = anchoredPosition.y;
      runOnJS(updateTableGeometry)(table.id, {
        x: anchoredPosition.x,
        y: anchoredPosition.y,
        width: committedWidth,
        height: wallResizeHeight.value,
        rotation: rotation.value,
      });
    });

  const wallResizeLeftGesture = Gesture.Pan()
    .enabled(isSelected && isWall && !isLocked)
    .onStart(() => {
      runOnJS(saveSnapshot)();
      wallResizeStartWidth.value = wallResizeWidth.value;
      wallResizeStartX.value = translateX.value;
      wallResizeStartY.value = translateY.value;
    })
    .onUpdate((event) => {
      const projectedDelta = projectResizeDelta(
        event.translationX,
        event.translationY,
      );
      const nextWidth = Math.max(
        MIN_WALL_LENGTH,
        wallResizeStartWidth.value - projectedDelta,
      );
      const anchoredPosition = getAnchoredResizePosition(nextWidth, "end");
      wallResizeWidth.value = nextWidth;
      translateX.value = anchoredPosition.x;
      translateY.value = anchoredPosition.y;
    })
    .onEnd((event) => {
      const projectedDelta = projectResizeDelta(
        event.translationX,
        event.translationY,
      );
      const nextWidth = Math.max(
        MIN_WALL_LENGTH,
        wallResizeStartWidth.value - projectedDelta,
      );
      const committedWidth = Math.round(nextWidth);
      const anchoredPosition = getAnchoredResizePosition(committedWidth, "end");

      wallResizeWidth.value = committedWidth;
      translateX.value = anchoredPosition.x;
      translateY.value = anchoredPosition.y;
      runOnJS(updateTableGeometry)(table.id, {
        x: anchoredPosition.x,
        y: anchoredPosition.y,
        width: committedWidth,
        height: wallResizeHeight.value,
        rotation: rotation.value,
      });
    });

  // Rotation gesture: disabled in favor of UI buttons in PropertiesPanel
  const rotateGesture = Gesture.Rotation()
    .enabled(false)
    .onStart(() => {
      runOnJS(saveSnapshot)();
      rotateContext.value = rotation.value;
    })
    .onUpdate((event) => {
      rotation.value = rotateContext.value + event.rotation;
    })
    .onEnd(() => {
      const snappedRotation = RIGHT_ANGLE_ROTATION_SHAPE_IDS.has(table.shape_id)
        ? Math.round(rotation.value / 90) * 90
        : Math.round(rotation.value / 45) * 45;
      rotation.value = snappedRotation;
      runOnJS(updateTablePosition)(
        table.id,
        translateX.value,
        translateY.value,
        snappedRotation,
      );
    });

  const handleSelect = useCallback(() => onSelect(table), [onSelect, table]);

  const tapGesture = Gesture.Tap().onEnd(() => {
    runOnJS(handleSelect)();
  });

  const composedGesture = Gesture.Simultaneous(
    dragGesture,
    rotateGesture,
    tapGesture,
  );

  const animatedStyle = useAnimatedStyle(() => ({
    position: "absolute",
    top: 0,
    left: 0,
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotation.value}deg` },
    ],
    opacity: 1,
  }));

  const sizeAnimatedStyle = useAnimatedStyle(() => ({
    width: isWall ? wallResizeWidth.value : effectiveWidth,
    height: isWall ? wallResizeHeight.value : effectiveHeight,
  }));

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View style={animatedStyle}>
        <Animated.View style={sizeAnimatedStyle}>
          <TableCardContent
            table={table}
            data={data}
            isTableType={isTableType}
            isWall={isWall}
            isSelected={isSelected}
            isDragging={isDragging}
            isEditMode
            isLocked={isLocked}
            sectionColor={sectionColor}
            wallResizeLeftGesture={wallResizeLeftGesture}
            wallResizeRightGesture={wallResizeRightGesture}
          />
        </Animated.View>
        <PulsingBorder
          active={newAttention}
          width={effectiveWidth}
          height={effectiveHeight}
        />
      </Animated.View>
    </GestureDetector>
  );
};

export default EditableTable;
