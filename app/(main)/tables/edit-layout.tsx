import { AddTableBottomSheet } from '@/components/tables/AddTableBottomSheet'
import DraggableTable from '@/components/tables/DraggableTable'
import PropertiesPanel from '@/components/tables/PropertiesPanel'
import QuickSetupPanel from '@/components/tables/QuickSetupPanel'
import {
  DragToAddProvider,
  useDragToAddContext
} from '@/contexts/DragToAddContext'
import { SHAPE_OPTIONS, TABLE_SHAPES } from '@/lib/table-shapes'
import { useFloorPlanStore } from '@/stores/useFloorPlanStore'
import BottomSheet from '@gorhom/bottom-sheet'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Maximize, Minus, Plus, Redo2, Undo2 } from 'lucide-react-native'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated'
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg'

// --- CONSTANTS ---
const SHAPE_SIZE = 100
const FINGER_Y_OFFSET = 0

// --- GridPattern Component ---
const GridPattern = () => (
  <Svg style={StyleSheet.absoluteFill} pointerEvents='none'>
    <Defs>
      <Pattern id='grid' width='40' height='40' patternUnits='userSpaceOnUse'>
        <Circle cx='1' cy='1' r='2' fill='#4a4a4a' />
      </Pattern>
    </Defs>
    <Rect width='100%' height='100%' fill='url(#grid)' />
  </Svg>
)

const LayoutEditorScreenContent = () => {
  const router = useRouter()
  const { layoutId } = useLocalSearchParams<{ layoutId: string }>()

  const {
    floorPlans,
    tables: storeTables,
    selectedTableIds,
    toggleTableSelection,
    clearSelection,
    addTable,
    undo,
    redo,
    past,
    future,
    setActiveFloorPlan
  } = useFloorPlanStore()

  const activeLayout = useMemo(
    () => floorPlans.find(l => l.id === layoutId),
    [floorPlans, layoutId]
  )

  const tables = storeTables

  useEffect(() => {
    if (
      layoutId &&
      layoutId !== useFloorPlanStore.getState().activeFloorPlanId
    ) {
      setActiveFloorPlan(layoutId)
    }
    return () => clearSelection()
  }, [layoutId])

  const [isQuickSetupOpen, setQuickSetupOpen] = useState(tables.length === 0)
  const [canvasSize, setCanvasSize] = useState({ width: 1024, height: 768 })
  const [canvasOrigin, setCanvasOrigin] = useState({ x: 0, y: 0 })
  const canvasRef = useRef<View>(null)
  const scale = useSharedValue(1)
  const savedScale = useSharedValue(1)
  const translateX = useSharedValue(0)
  const translateY = useSharedValue(0)
  const savedTranslateX = useSharedValue(0)
  const savedTranslateY = useSharedValue(0)

  const { draggedShapeId, dragPosition, isDraggingNewObject, dropPending } =
    useDragToAddContext()

  const panGesture = Gesture.Pan()
    .minPointers(2)
    .onUpdate(e => {
      translateX.value = savedTranslateX.value + e.translationX / scale.value
      translateY.value = savedTranslateY.value + e.translationY / scale.value
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value
      savedTranslateY.value = translateY.value
    })

  const pinchGesture = Gesture.Pinch()
    .onUpdate(e => {
      scale.value = savedScale.value * e.scale
    })
    .onEnd(() => {
      savedScale.value = scale.value
    })

  const canvasInteractionGesture = Gesture.Simultaneous(
    pinchGesture,
    panGesture
  )

  const canvasAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value }
    ]
  }))

  const ghostShapeAnimatedStyle = useAnimatedStyle(() => {
    return {
      position: 'absolute',
      width: SHAPE_SIZE,
      height: SHAPE_SIZE,
      left: dragPosition.value.x - SHAPE_SIZE / 2,
      top: dragPosition.value.y - SHAPE_SIZE / 2 - FINGER_Y_OFFSET,
      opacity: isDraggingNewObject.value ? 0.8 : 0,
      zIndex: 99999,
      elevation: 99999,
      pointerEvents: 'none'
    }
  })

  const handleZoom = (direction: 'in' | 'out') => {
    const newScale = direction === 'in' ? scale.value * 1.2 : scale.value / 1.2
    scale.value = withTiming(newScale)
    savedScale.value = newScale
  }

  const recenterCanvas = () => {
    scale.value = withTiming(1)
    translateX.value = withTiming(0)
    translateY.value = withTiming(0)
    savedScale.value = 1
    savedTranslateX.value = 0
    savedTranslateY.value = 0
  }

  const handleAddMultipleTables = (
    items: { shapeId: keyof typeof TABLE_SHAPES; quantity: number }[]
  ) => {
    items.forEach(async item => {
      for (let i = 0; i < item.quantity; i++) {
        await addTable({
          shape_id: item.shapeId as string
        })
      }
    })
    setQuickSetupOpen(false)
  }

  const selectedTable = useMemo(() => {
    if (selectedTableIds.length !== 1) return null
    return tables.find(t => t.id === selectedTableIds[0]) || null
  }, [selectedTableIds, tables])

  const addTableSheetRef = useRef<BottomSheet>(null)
  const handleOpenAddTableSheet = () => {
    addTableSheetRef.current?.expand()
  }

  const resetDragToAddState = () => {
    draggedShapeId.value = null
    isDraggingNewObject.value = false
    dropPending.value = false
  }

  const updateCanvasMeasurements = () => {
    canvasRef.current?.measureInWindow((x, y, width, height) => {
      setCanvasOrigin({ x, y })
      setCanvasSize({ width, height })
    })
  }

  const performDrop = async (
    shapeId: string,
    absX: number,
    absY: number,
    currentScale: number,
    currentTranslateX: number,
    currentTranslateY: number
  ) => {
    if (!shapeId || !layoutId) {
      resetDragToAddState()
      return
    }

    const shapeDef = TABLE_SHAPES[shapeId as keyof typeof TABLE_SHAPES]
    if (!shapeDef) {
      resetDragToAddState()
      return
    }
    const actualWidth = shapeDef.width || 80
    const actualHeight = shapeDef.height || 80

    const vW = canvasSize.width
    const vH = canvasSize.height

    const localX = absX - canvasOrigin.x
    const localY = absY - canvasOrigin.y - FINGER_Y_OFFSET

    const centerX = vW / 2
    const centerY = vH / 2

    const canvasCenterX =
      (localX - centerX) / currentScale - currentTranslateX + centerX
    const canvasCenterY =
      (localY - centerY) / currentScale - currentTranslateY + centerY

    const unclampedX = canvasCenterX - actualWidth / 2
    const unclampedY = canvasCenterY - actualHeight / 2
    const finalX = Math.max(0, Math.min(vW - actualWidth, unclampedX))
    const finalY = Math.max(0, Math.min(vH - actualHeight, unclampedY))

    let defaultName = ''
    if (shapeDef.category === 'table') {
      const existingTableNumbers = tables
        .filter(t => t.name.startsWith('T-'))
        .map(t => {
          const num = parseInt(t.name.split('-')[1], 10)
          return isNaN(num) ? 0 : num
        })
      const highestTableNumber =
        existingTableNumbers.length > 0 ? Math.max(...existingTableNumbers) : 0
      defaultName = `T-${highestTableNumber + 1}`
    } else {
      const baseName = shapeDef.label
      const existingObjectsWithBaseName = tables.filter(t =>
        t.name.startsWith(baseName)
      )
      if (existingObjectsWithBaseName.length === 0) {
        defaultName = baseName
      } else {
        defaultName = `${baseName} ${existingObjectsWithBaseName.length + 1}`
      }
    }

    try {
      await addTable({
        name: defaultName,
        shape_id: shapeId,
        x: finalX,
        y: finalY
      })
    } catch (error) {
      console.error('[edit-layout] Failed to add dropped object', error)
    } finally {
      resetDragToAddState()
    }
  }

  const handleCanvasInteraction = () => {
    if (dropPending.value && draggedShapeId.value) {
      performDrop(
        draggedShapeId.value,
        dragPosition.value.x,
        dragPosition.value.y,
        scale.value,
        translateX.value,
        translateY.value
      )
    }
  }

  // Watch for drop events and process them
  useAnimatedReaction(
    () => dropPending.value,
    (isPending, wasPending) => {
      if (isPending && !wasPending && draggedShapeId.value) {
        // Inline the drop logic to avoid reference issues
        runOnJS(performDrop)(
          draggedShapeId.value,
          dragPosition.value.x,
          dragPosition.value.y,
          scale.value,
          translateX.value,
          translateY.value
        )
      }
    },
    []
  )

  if (!activeLayout) {
    return (
      <View className='flex-1 bg-screen items-center justify-center'>
        <Text className='text-xl text-white'>Loading Floor Plan...</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          className='mt-4 p-3 bg-blue-600 rounded-lg'
        >
          <Text className='text-white text-base'>Go Back</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const hasHistory = past.length > 0
  const hasFuture = future.length > 0

  return (
    <View className='flex-1 bg-screen'>
      <View className='bg-panel p-4 flex-row justify-between items-center z-10'>
        <View className='flex-row items-center gap-2'>
          <Text className='text-2xl font-bold text-white'>
            Testing / {activeLayout.name}
          </Text>

          {hasHistory && (
            <View className='flex-row gap-1 ml-4 bg-[#424242] rounded-lg p-1'>
              <TouchableOpacity
                onPress={undo}
                className='p-2 rounded'
                disabled={!hasHistory}
                style={{ opacity: hasHistory ? 1 : 0.3 }}
              >
                <Undo2 size={20} color='white' />
              </TouchableOpacity>
              <View className='w-[1px] bg-gray-500 my-1' />
              <TouchableOpacity
                onPress={redo}
                className='p-2 rounded'
                disabled={!hasFuture}
                style={{ opacity: hasFuture ? 1 : 0.3 }}
              >
                <Redo2 size={20} color='white' />
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View className='flex-row gap-3'>
          <TouchableOpacity
            onPress={handleOpenAddTableSheet}
            className='py-3 px-5 rounded-lg flex-row items-center bg-blue-500'
          >
            <Plus size={20} color='white' className='mr-1' />
            <Text className='text-lg font-bold text-white'>Add Table</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              router.back()
            }}
            className='py-3 px-5 rounded-lg flex-row items-center bg-gray-600'
          >
            <Text className='text-lg font-bold text-white'>Save & Exit</Text>
          </TouchableOpacity>
        </View>
      </View>

      <GestureDetector gesture={canvasInteractionGesture}>
        <View
          ref={canvasRef}
          className='flex-1 relative overflow-hidden z-0'
          onLayout={() => updateCanvasMeasurements()}
        >
          <GridPattern />
          <Animated.View style={canvasAnimatedStyle} className='w-full h-full'>
            {tables.map(table => (
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

          <View className='absolute top-4 left-4 flex-col gap-y-2 z-20'>
            <TouchableOpacity
              onPress={() => handleZoom('in')}
              className='p-3 bg-panel border border-gray-600 rounded-lg'
            >
              <Plus color='#94A3B8' size={24} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleZoom('out')}
              className='p-3 bg-panel border border-gray-600 rounded-lg'
            >
              <Minus color='#94A3B8' size={24} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={recenterCanvas}
              className='p-3 bg-panel border border-gray-600 rounded-lg'
            >
              <Maximize color='#94A3B8' size={24} />
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

      <Animated.View style={ghostShapeAnimatedStyle} pointerEvents='none'>
        {SHAPE_OPTIONS.map(option => {
          const ShapeComp = option.component
          return (
            <GhostShapeWrapper
              key={option.id}
              id={option.id}
              currentId={draggedShapeId}
            >
              <ShapeComp
                color='#94A3B8'
                height={SHAPE_SIZE}
                width={SHAPE_SIZE}
              />
            </GhostShapeWrapper>
          )
        })}
      </Animated.View>
    </View>
  )
}

const GhostShapeWrapper = ({
  id,
  currentId,
  children
}: {
  id: string
  currentId: any
  children: React.ReactNode
}) => {
  const style = useAnimatedStyle(() => {
    return { display: currentId.value === id ? 'flex' : 'none' }
  })
  return <Animated.View style={style}>{children}</Animated.View>
}

const LayoutEditorScreen = () => (
  <DragToAddProvider>
    <LayoutEditorScreenContent />
  </DragToAddProvider>
)

export default LayoutEditorScreen
