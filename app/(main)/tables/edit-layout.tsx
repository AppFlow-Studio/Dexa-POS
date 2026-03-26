import { AddTableBottomSheet } from '@/components/tables/AddTableBottomSheet'
import DraggableTable from '@/components/tables/DraggableTable'
import PropertiesPanel from '@/components/tables/PropertiesPanel'
import QuickSetupPanel from '@/components/tables/QuickSetupPanel'
import {
  DragToAddProvider,
  useDragToAddContext
} from '@/contexts/DragToAddContext'
import { colors } from '@/lib/theme'
import { SHAPE_OPTIONS, TABLE_SHAPES } from '@/lib/table-shapes'
import { useFloorPlanStore } from '@/stores/useFloorPlanStore'
import BottomSheet from '@gorhom/bottom-sheet'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Maximize2, Minus, Plus, Redo2, Undo2 } from 'lucide-react-native'
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
import Svg, { Defs, Line as SvgLine, Pattern, Rect } from 'react-native-svg'

const SHAPE_SIZE = 100
const FINGER_Y_OFFSET = 0

const GridPattern = () => (
  <Svg style={StyleSheet.absoluteFill} pointerEvents='none'>
    <Defs>
      <Pattern id='grid' width='20' height='20' patternUnits='userSpaceOnUse'>
        <SvgLine x1='20' y1='0' x2='20' y2='20' stroke={colors.border} strokeWidth='0.5' opacity='0.5' />
        <SvgLine x1='0' y1='20' x2='20' y2='20' stroke={colors.border} strokeWidth='0.5' opacity='0.5' />
      </Pattern>
      <Pattern id='grid-major' width='100' height='100' patternUnits='userSpaceOnUse'>
        <SvgLine x1='100' y1='0' x2='100' y2='100' stroke={colors.border} strokeWidth='1' opacity='0.9' />
        <SvgLine x1='0' y1='100' x2='100' y2='100' stroke={colors.border} strokeWidth='1' opacity='0.9' />
      </Pattern>
    </Defs>
    <Rect width='100%' height='100%' fill='url(#grid)' />
    <Rect width='100%' height='100%' fill='url(#grid-major)' />
  </Svg>
)

const LayoutEditorScreenContent = () => {
  const router = useRouter()
  const { layoutId: layoutIdParam } = useLocalSearchParams<{ layoutId?: string | string[] }>()
  const layoutId = Array.isArray(layoutIdParam) ? layoutIdParam[0] : layoutIdParam

  const { floorPlans, tables: storeTables, selectedTableIds, selectMultipleTables, clearSelection, addTable, undo, redo, past, future, setActiveFloorPlan, activeFloorPlanId } = useFloorPlanStore()

  // In edit mode: tapping an object selects only that object (single-select).
  // Tapping the already-selected object deselects it.
  const handleEditModeSelect = (tableId: string) => {
    if (selectedTableIds.length === 1 && selectedTableIds[0] === tableId) {
      clearSelection()
    } else {
      selectMultipleTables([tableId])
    }
  }

  const activeLayout = useMemo(() => floorPlans.find(l => l.id === layoutId), [floorPlans, layoutId])
  const tables = storeTables

  useEffect(() => {
    if (layoutId && layoutId !== useFloorPlanStore.getState().activeFloorPlanId) {
      setActiveFloorPlan(layoutId)
    }
    return () => clearSelection()
  }, [layoutId, setActiveFloorPlan, clearSelection])

  const [isQuickSetupOpen, setQuickSetupOpen] = useState(tables.length === 0)
  const [canvasOrigin, setCanvasOrigin] = useState({ x: 0, y: 0 })
  const canvasRef = useRef<View>(null)
  const scale = useSharedValue(1)
  const savedScale = useSharedValue(1)
  const translateX = useSharedValue(0)
  const translateY = useSharedValue(0)
  const savedTranslateX = useSharedValue(0)
  const savedTranslateY = useSharedValue(0)

  const { draggedShapeId, dragPosition, isDraggingNewObject, dropPending } = useDragToAddContext()

  const panGesture = Gesture.Pan()
    .minDistance(8)
    .activeOffsetX([-8, 8])
    .activeOffsetY([-8, 8])
    .onUpdate(e => {
      translateX.value = savedTranslateX.value + e.translationX / scale.value
      translateY.value = savedTranslateY.value + e.translationY / scale.value
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value
      savedTranslateY.value = translateY.value
    })

  const pinchGesture = Gesture.Pinch()
    .onUpdate(e => { scale.value = Math.max(0.5, Math.min(3, savedScale.value * e.scale)) })
    .onEnd(() => { savedScale.value = scale.value })

  const canvasInteractionGesture = Gesture.Simultaneous(pinchGesture, panGesture)

  const canvasAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: scale.value }]
  }))

  const ghostShapeAnimatedStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    width: SHAPE_SIZE,
    height: SHAPE_SIZE,
    left: dragPosition.value.x - SHAPE_SIZE / 2,
    top: dragPosition.value.y - SHAPE_SIZE / 2 - FINGER_Y_OFFSET,
    opacity: isDraggingNewObject.value ? 0.8 : 0,
    zIndex: 99999,
    elevation: 99999,
    pointerEvents: 'none'
  }))

  const handleZoom = (direction: 'in' | 'out') => {
    const clamped = Math.max(0.5, Math.min(3, direction === 'in' ? scale.value * 1.2 : scale.value / 1.2))
    scale.value = withTiming(clamped)
    savedScale.value = clamped
  }

  const recenterCanvas = () => {
    scale.value = withTiming(1)
    translateX.value = withTiming(0)
    translateY.value = withTiming(0)
    savedScale.value = 1
    savedTranslateX.value = 0
    savedTranslateY.value = 0
  }

  const handleAddMultipleTables = (items: { shapeId: keyof typeof TABLE_SHAPES; quantity: number }[]) => {
    const additions = items.flatMap(item => Array.from({ length: item.quantity }, () => addTable({ shape_id: item.shapeId as string })))
    Promise.all(additions).catch(() => {})
    setQuickSetupOpen(false)
  }

  const selectedTable = useMemo(() => {
    if (selectedTableIds.length !== 1) return null
    return tables.find(t => t.id === selectedTableIds[0]) || null
  }, [selectedTableIds, tables])

  const addTableSheetRef = useRef<BottomSheet>(null)

  const resetDragToAddState = () => {
    draggedShapeId.value = null
    isDraggingNewObject.value = false
    dropPending.value = false
  }

  const getCanvasMeasurements = () =>
    new Promise<{ x: number; y: number; width: number; height: number }>(resolve => {
      canvasRef.current?.measureInWindow((x, y, width, height) => resolve({ x, y, width, height }))
    })

  const performDrop = async (shapeId: string, absX: number, absY: number, currentScale: number, currentTranslateX: number, currentTranslateY: number) => {
    if (!shapeId || !layoutId) { resetDragToAddState(); return }
    if (activeFloorPlanId !== layoutId) {
      try { await setActiveFloorPlan(layoutId) } catch { resetDragToAddState(); return }
    }
    const shapeDef = TABLE_SHAPES[shapeId as keyof typeof TABLE_SHAPES]
    if (!shapeDef) { resetDragToAddState(); return }

    const measured = await getCanvasMeasurements()
    const originX = measured.width > 0 ? measured.x : canvasOrigin.x
    const originY = measured.height > 0 ? measured.y : canvasOrigin.y
    const localX = absX - originX
    const localY = absY - originY - FINGER_Y_OFFSET
    const finalX = localX / currentScale - currentTranslateX - (shapeDef.width || 80) / 2
    const finalY = localY / currentScale - currentTranslateY - (shapeDef.height || 80) / 2

    let defaultName = ''
    if (shapeDef.category === 'table') {
      const nums = tables.filter(t => t.name.startsWith('T-')).map(t => parseInt(t.name.split('-')[1], 10)).filter(n => !isNaN(n))
      defaultName = `T-${nums.length > 0 ? Math.max(...nums) + 1 : 1}`
    } else {
      const base = shapeDef.label
      const existing = tables.filter(t => t.name.startsWith(base))
      defaultName = existing.length === 0 ? base : `${base} ${existing.length + 1}`
    }

    try {
      await addTable({ name: defaultName, shape_id: shapeId, x: finalX, y: finalY })
      addTableSheetRef.current?.close()
    } catch (e) { console.error('[edit-layout] drop failed', e) }
    finally { resetDragToAddState() }
  }

  useAnimatedReaction(
    () => dropPending.value,
    (isPending, wasPending) => {
      if (isPending && !wasPending && draggedShapeId.value) {
        runOnJS(performDrop)(draggedShapeId.value, dragPosition.value.x, dragPosition.value.y, scale.value, translateX.value, translateY.value)
      }
    },
    []
  )

  const hasHistory = past.length > 0
  const hasFuture = future.length > 0

  if (!activeLayout) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.screen, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.label, fontSize: 14 }}>Loading floor plan…</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.label, fontSize: 13 }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen }}>
      {/* ── Top Bar ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border, zIndex: 10 }}>
        {/* Left: title */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View>
            <Text style={{ color: colors.heading, fontSize: 14, fontWeight: '700' }}>{activeLayout.name}</Text>
            <Text style={{ color: colors.muted, fontSize: 10, marginTop: 1 }}>{tables.length} object{tables.length !== 1 ? 's' : ''} on canvas</Text>
          </View>

          {/* Undo / Redo */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 8, backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
            <TouchableOpacity onPress={undo} disabled={!hasHistory} style={{ padding: 8, opacity: hasHistory ? 1 : 0.3 }}>
              <Undo2 size={15} color={colors.label} />
            </TouchableOpacity>
            <View style={{ width: 1, height: 20, backgroundColor: colors.border }} />
            <TouchableOpacity onPress={redo} disabled={!hasFuture} style={{ padding: 8, opacity: hasFuture ? 1 : 0.3 }}>
              <Redo2 size={15} color={colors.label} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Right: Add + Save */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            onPress={() => addTableSheetRef.current?.expand()}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.teal + '20', borderWidth: 1, borderColor: colors.teal + '60' }}
          >
            <Plus size={14} color={colors.teal} />
            <Text style={{ color: colors.teal, fontWeight: '700', fontSize: 13 }}>Add Object</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border }}
          >
            <Text style={{ color: colors.label, fontWeight: '600', fontSize: 13 }}>Save & Exit</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Canvas ── */}
      <GestureDetector gesture={canvasInteractionGesture}>
        <View
          ref={canvasRef}
          style={{ flex: 1, position: 'relative', overflow: 'hidden', backgroundColor: colors.screen }}
          onLayout={() => canvasRef.current?.measureInWindow((x, y) => { setCanvasOrigin({ x, y }) })}
        >
          <Animated.View style={[StyleSheet.absoluteFillObject, canvasAnimatedStyle]} pointerEvents='none'>
            <GridPattern />
          </Animated.View>

          <Animated.View style={[StyleSheet.absoluteFillObject, canvasAnimatedStyle]} pointerEvents='box-none'>
            {tables.map(table => (
              <DraggableTable
                key={table.id}
                table={table}
                layoutId={activeLayout.id}
                isEditMode={true}
                isSelected={selectedTableIds.includes(table.id)}
                onSelect={() => handleEditModeSelect(table.id)}
                onPress={() => handleEditModeSelect(table.id)}
                canvasScale={scale}
                interactionMode='normal'
              />
            ))}
          </Animated.View>

          {/* ── Zoom Controls ── */}
          <View style={{ position: 'absolute', bottom: 14, right: 14, gap: 6, zIndex: 20 }}>
            {[
              { icon: <Plus size={15} color={colors.label} />, onPress: () => handleZoom('in') },
              { icon: <Minus size={15} color={colors.label} />, onPress: () => handleZoom('out') },
              { icon: <Maximize2 size={15} color={colors.label} />, onPress: recenterCanvas },
            ].map((btn, i) => (
              <TouchableOpacity
                key={i}
                onPress={btn.onPress}
                style={{ width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}
              >
                {btn.icon}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </GestureDetector>

      <QuickSetupPanel isOpen={isQuickSetupOpen} onClose={() => setQuickSetupOpen(false)} onAddMultiple={handleAddMultipleTables} />

      {selectedTable && layoutId && <PropertiesPanel table={selectedTable} layoutId={layoutId} />}

      <AddTableBottomSheet bottomSheetRef={addTableSheetRef as React.RefObject<BottomSheet>} onClose={() => addTableSheetRef.current?.close()} />

      <Animated.View style={ghostShapeAnimatedStyle} pointerEvents='none'>
        {SHAPE_OPTIONS.map(option => {
          const ShapeComp = option.component
          return (
            <GhostShapeWrapper key={option.id} id={option.id} currentId={draggedShapeId}>
              <ShapeComp color={colors.teal} height={SHAPE_SIZE} width={SHAPE_SIZE} />
            </GhostShapeWrapper>
          )
        })}
      </Animated.View>
    </View>
  )
}

const GhostShapeWrapper = ({ id, currentId, children }: { id: string; currentId: any; children: React.ReactNode }) => {
  const style = useAnimatedStyle(() => ({ display: currentId.value === id ? 'flex' : 'none' }))
  return <Animated.View style={style}>{children}</Animated.View>
}

const LayoutEditorScreen = () => (
  <DragToAddProvider>
    <LayoutEditorScreenContent />
  </DragToAddProvider>
)

export default LayoutEditorScreen
