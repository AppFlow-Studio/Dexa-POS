import { AddTableBottomSheet } from "@/components/tables/AddTableBottomSheet";
import DraggableTable from "@/components/tables/DraggableTable";
import PropertiesPanel from "@/components/tables/PropertiesPanel";
import QuickSetupPanel from "@/components/tables/QuickSetupPanel";
import {
  DragToAddProvider,
  useDragToAddContext,
} from "@/contexts/DragToAddContext";
import { SHAPE_OPTIONS, TABLE_SHAPES } from "@/lib/table-shapes";
import { getTablePositionSV } from "@/lib/tablePositionRegistry";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import BottomSheet from "@gorhom/bottom-sheet";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinkIcon, Maximize, Minus, Plus, X } from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, Line, Pattern, Rect } from "react-native-svg";

// --- CONSTANTS ---
const SHAPE_SIZE = 100;
const FINGER_Y_OFFSET = 80;

// --- GridPattern Component ---
const GridPattern = () => (
  <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
    <Defs>
      <Pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <Circle cx="1" cy="1" r="2" fill="#4a4a4a" />
      </Pattern>
    </Defs>
    <Rect width="100%" height="100%" fill="url(#grid)" />
  </Svg>
);

const AnimatedSvgLine = (Animated as any).createAnimatedComponent(Line);
const ConnectorLine = ({ fromId, toId }: { fromId: string; toId: string }) => {
  const from = getTablePositionSV(fromId);
  const to = getTablePositionSV(toId);
  const animatedProps = useAnimatedProps(() => ({
    x1: (from?.x.value ?? 0) + 50,
    y1: (from?.y.value ?? 0) + 50,
    x2: (to?.x.value ?? 0) + 50,
    y2: (to?.y.value ?? 0) + 50,
  }));
  return (
    <AnimatedSvgLine
      animatedProps={animatedProps as any}
      stroke="#F59E0B"
      strokeWidth="3"
      strokeDasharray="6, 3"
    />
  );
};

const LayoutEditorScreenContent = () => {
  const router = useRouter();
  const { layoutId } = useLocalSearchParams<{ layoutId: string }>();
  const {
    layouts,
    selectedTableIds,
    toggleTableSelection,
    mergeTables,
    unmergeTables,
    clearSelection,
    addTable,
    addMultipleTables,
  } = useFloorPlanStore();
  const { consolidateOrdersForTables } = useOrderStore();

  const activeLayout = useMemo(
    () => layouts.find((l) => l.id === layoutId),
    [layouts, layoutId]
  );
  const tables = activeLayout?.tables || [];

  const originalSnapshotRef = useRef<any | null>(null);
  const hasSavedRef = useRef(false);

  // UPDATED: Store width and height as well
  const canvasOffset = useRef({ x: 0, y: 0, width: 0, height: 0 });

  useEffect(() => {
    if (activeLayout && !originalSnapshotRef.current) {
      originalSnapshotRef.current = {
        id: activeLayout.id,
        name: activeLayout.name,
        tables: activeLayout.tables.map((t) => ({ ...t })),
      };
    }
    return () => {
      if (!hasSavedRef.current && originalSnapshotRef.current) {
        const snap = originalSnapshotRef.current;
        useFloorPlanStore.setState((state) => ({
          layouts: state.layouts.map((l) =>
            l.id === snap.id
              ? { ...l, tables: snap.tables.map((t: any) => ({ ...t })) }
              : l
          ),
        }));
      }
    };
  }, [activeLayout?.id]);

  const [isQuickSetupOpen, setQuickSetupOpen] = useState(tables.length === 0);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const { draggedShapeId, dragPosition, isDraggingNewObject, dropPending } =
    useDragToAddContext();

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      // Divide by scale so panning feels consistent at any zoom level
      translateX.value = savedTranslateX.value + e.translationX / scale.value;
      translateY.value = savedTranslateY.value + e.translationY / scale.value;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = savedScale.value * e.scale;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });

  const canvasInteractionGesture = Gesture.Simultaneous(
    pinchGesture,
    panGesture
  );

  const canvasAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value }, // Scale originates from CENTER by default
    ],
  }));

  const ghostShapeAnimatedStyle = useAnimatedStyle(() => {
    return {
      position: "absolute",
      width: SHAPE_SIZE,
      height: SHAPE_SIZE,
      left: dragPosition.value.x - SHAPE_SIZE / 2,
      top: dragPosition.value.y - SHAPE_SIZE / 2 - FINGER_Y_OFFSET,
      opacity: isDraggingNewObject.value ? 0.8 : 0,
      zIndex: 99999,
      elevation: 99999,
      pointerEvents: "none",
    };
  });

  const handleZoom = (direction: "in" | "out") => {
    const newScale = direction === "in" ? scale.value * 1.2 : scale.value / 1.2;
    scale.value = withTiming(newScale);
    savedScale.value = newScale;
  };

  const recenterCanvas = () => {
    scale.value = withTiming(1);
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedScale.value = 1;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  };

  useEffect(() => {
    clearSelection();
    return () => clearSelection();
  }, [layoutId]);

  const handleMerge = () => {
    const selectedTableNames = selectedTableIds
      .map((id) => tables.find((t) => t.id === id)?.name || "")
      .filter(Boolean);
    const newOrderId = consolidateOrdersForTables(
      selectedTableIds,
      selectedTableNames
    );
    mergeTables(selectedTableIds, newOrderId);
  };

  const handleUnmerge = () => {
    if (selectedTableIds.length === 1) {
      unmergeTables(selectedTableIds[0]);
    }
  };

  const handleAddMultipleTables = (
    items: { shapeId: keyof typeof TABLE_SHAPES; quantity: number }[]
  ) => {
    if (layoutId) {
      addMultipleTables(layoutId, items);
      setQuickSetupOpen(false);
    }
  };

  const selectedTable = useMemo(() => {
    if (selectedTableIds.length !== 1) return null;
    return tables.find((t) => t.id === selectedTableIds[0]) || null;
  }, [selectedTableIds, tables]);

  const canUnmerge =
    selectedTableIds.length === 1 &&
    (selectedTable?.isPrimary || selectedTable?.mergedWith?.length);
  const canMerge =
    selectedTableIds.length >= 2 &&
    !tables
      .filter((t) => selectedTableIds.includes(t.id))
      .some((t) => t.type === "static-object");

  const addTableSheetRef = useRef<BottomSheet>(null);
  const handleOpenAddTableSheet = () => {
    addTableSheetRef.current?.expand();
  };

  // --- UPDATED DROP LOGIC ---
  const performDrop = (
    shapeId: string,
    absX: number,
    absY: number,
    currentScale: number,
    currentTranslateX: number,
    currentTranslateY: number
  ) => {
    if (!shapeId || !layoutId) return;

    // 1. Get Shape Info
    const shapeDef = TABLE_SHAPES[shapeId as keyof typeof TABLE_SHAPES];
    if (!shapeDef) return;
    const actualWidth = shapeDef.width || 80;
    const actualHeight = shapeDef.height || 80;

    // 2. Get Canvas Dimensions and Center
    const { x: offX, y: offY, width: vW, height: vH } = canvasOffset.current;

    // Safety check if layout hasn't run yet
    if (vW === 0 || vH === 0) return;

    // 3. Calculate Visual Coordinates (Screen Space relative to Canvas View)
    //    (Center of the ghost shape)
    const ghostCenterX = absX;
    const ghostCenterY = absY - FINGER_Y_OFFSET;

    //    (Coordinates inside the Canvas View, ignoring scale/translate for a moment)
    const localX = ghostCenterX - offX;
    const localY = ghostCenterY - offY;

    // 4. Apply Inverse Transform Matrix
    //    Because Transform is: [Translate, Scale] AND Scale is from Center:
    //    Formula: CanvasPos = ((LocalPos - Center) / Scale) - Translate + Center

    const centerX = vW / 2;
    const centerY = vH / 2;

    const canvasCenterX =
      (localX - centerX) / currentScale - currentTranslateX + centerX;
    const canvasCenterY =
      (localY - centerY) / currentScale - currentTranslateY + centerY;

    // 5. Offset for Top-Left of the new table
    const finalX = canvasCenterX - actualWidth / 2;
    const finalY = canvasCenterY - actualHeight / 2;

    // 6. Name Generation (Same as before)
    let defaultName = "";
    if (shapeDef.type === "table") {
      const existingTableNumbers = tables
        .filter((t) => t.name.startsWith("T-"))
        .map((t) => {
          const num = parseInt(t.name.split("-")[1], 10);
          return isNaN(num) ? 0 : num;
        });
      const highestTableNumber =
        existingTableNumbers.length > 0 ? Math.max(...existingTableNumbers) : 0;
      defaultName = `T-${highestTableNumber + 1}`;
    } else {
      const baseName = shapeDef.label;
      const existingObjectsWithBaseName = tables.filter((t) =>
        t.name.startsWith(baseName)
      );
      if (existingObjectsWithBaseName.length === 0) {
        defaultName = baseName;
      } else {
        defaultName = `${baseName} ${existingObjectsWithBaseName.length + 1}`;
      }
    }

    addTable(layoutId, {
      name: defaultName,
      shapeId: shapeId as keyof typeof TABLE_SHAPES,
      x: finalX,
      y: finalY,
    });

    draggedShapeId.value = null;
    isDraggingNewObject.value = false;
    dropPending.value = false;
  };

  useAnimatedReaction(
    () => dropPending.value,
    (isPending, prevIsPending) => {
      if (isPending && !prevIsPending && draggedShapeId.value) {
        runOnJS(performDrop)(
          draggedShapeId.value,
          dragPosition.value.x,
          dragPosition.value.y,
          scale.value,
          translateX.value,
          translateY.value
        );
      }
    },
    [layoutId, tables.length]
  );

  if (!activeLayout) {
    return (
      <View className="flex-1 bg-[#212121] items-center justify-center">
        <Text className="text-xl text-white">Loading...</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          className="mt-4 p-3 bg-blue-600 rounded-lg"
        >
          <Text className="text-white text-base">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#212121]">
      {/* Header */}
      <View className="bg-[#303030] p-4 flex-row justify-between items-center z-10">
        <Text className="text-2xl font-bold text-white">
          {activeLayout.name}
        </Text>
        <View className="flex-row gap-3">
          {canMerge && (
            <TouchableOpacity
              onPress={handleMerge}
              className="py-3 px-5 rounded-lg flex-row items-center bg-green-500"
            >
              <LinkIcon size={20} color="white" className="mr-2" />
              <Text className="text-lg font-bold text-white">Merge</Text>
            </TouchableOpacity>
          )}
          {canUnmerge && (
            <TouchableOpacity
              onPress={handleUnmerge}
              className="py-3 px-5 rounded-lg flex-row items-center bg-yellow-500"
            >
              <X size={20} color="white" className="mr-2" />
              <Text className="text-lg font-bold text-white">Unmerge</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={handleOpenAddTableSheet}
            className="py-3 px-5 rounded-lg flex-row items-center bg-blue-500 text-white"
          >
            <Plus size={20} color="white" className="mr-1" />
            <Text className="text-lg font-bold text-white">Add Table</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              hasSavedRef.current = true;
              router.back();
            }}
            className="py-3 px-5 rounded-lg flex-row items-center bg-gray-600"
          >
            <Text className="text-lg font-bold text-white">Save & Exit</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Canvas */}
      <GestureDetector gesture={canvasInteractionGesture}>
        <View
          className="flex-1 relative overflow-hidden z-0"
          // UPDATED: Capture Width and Height here
          onLayout={(event) => {
            canvasOffset.current = {
              x: event.nativeEvent.layout.x,
              y: event.nativeEvent.layout.y,
              width: event.nativeEvent.layout.width,
              height: event.nativeEvent.layout.height,
            };
          }}
        >
          <GridPattern />
          <Animated.View style={canvasAnimatedStyle} className="w-full h-full">
            <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
              {(() => {
                const connectors: React.ReactNode[] = [];
                const idToTable = new Map(
                  tables.map((t) => [t.id, t] as const)
                );
                const seenPairs = new Set<string>();
                for (const t of tables) {
                  if (!t.mergedWith || t.mergedWith.length === 0) continue;
                  const primary = t.isPrimary
                    ? t
                    : tables.find(
                        (x) => x.isPrimary && x.mergedWith?.includes(t.id)
                      );
                  const primaryId = primary?.id ?? t.id;
                  const group = new Set<string>([
                    primaryId,
                    ...(primary?.mergedWith || []),
                  ]);
                  const ids = Array.from(group);
                  for (let i = 0; i < ids.length; i++) {
                    for (let j = i + 1; j < ids.length; j++) {
                      const a = ids[i];
                      const b = ids[j];
                      if (!idToTable.has(a) || !idToTable.has(b)) continue;
                      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
                      if (seenPairs.has(key)) continue;
                      seenPairs.add(key);
                      connectors.push(
                        <ConnectorLine key={key} fromId={a} toId={b} />
                      );
                    }
                  }
                }
                return connectors;
              })()}
            </Svg>
            {tables.map((table) => (
              <DraggableTable
                key={table.id}
                table={table}
                layoutId={activeLayout.id}
                isEditMode={true}
                isSelected={selectedTableIds.includes(table.id)}
                onSelect={() => toggleTableSelection(table.id)}
                onPress={() => toggleTableSelection(table.id)}
                canvasScale={scale}
              />
            ))}
          </Animated.View>

          <View className="absolute top-4 left-4 flex-col gap-y-2 z-20">
            <TouchableOpacity
              onPress={() => handleZoom("in")}
              className="p-3 bg-[#303030] border border-gray-600 rounded-lg"
            >
              <Plus color="#9CA3AF" size={24} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleZoom("out")}
              className="p-3 bg-[#303030] border border-gray-600 rounded-lg"
            >
              <Minus color="#9CA3AF" size={24} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={recenterCanvas}
              className="p-3 bg-[#303030] border border-gray-600 rounded-lg"
            >
              <Maximize color="#9CA3AF" size={24} />
            </TouchableOpacity>
          </View>
        </View>
      </GestureDetector>

      <QuickSetupPanel
        isOpen={isQuickSetupOpen}
        onClose={() => setQuickSetupOpen(false)}
        onAddMultiple={handleAddMultipleTables}
      />

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
                color="#9CA3AF"
                height={SHAPE_SIZE}
                width={SHAPE_SIZE}
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
  const style = useAnimatedStyle(() => {
    return { display: currentId.value === id ? "flex" : "none" };
  });
  return <Animated.View style={style}>{children}</Animated.View>;
};

const LayoutEditorScreen = () => (
  <DragToAddProvider>
    <LayoutEditorScreenContent />
  </DragToAddProvider>
);

export default LayoutEditorScreen;
