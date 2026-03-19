// /components/tables/TableLayoutView.tsx

import { TABLE_SHAPES } from '@/lib/table-shapes'
import { colors } from '@/lib/theme'
import { useFloorPlanStore } from '@/stores/useFloorPlanStore'
import { FloorPlanObject, ServerSection } from '@/types/db-floor-plan-types'
import { Minus, Plus } from 'lucide-react-native'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  LayoutChangeEvent,
  StyleSheet,
  TouchableOpacity,
  View
} from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated'
import Svg, { Line, Rect as SvgRect, Text as SvgText } from 'react-native-svg'
import DraggableTable from './DraggableTable'
import TableLayoutSkeleton from './TableLayoutSkeleton'

interface TableLayoutViewProps {
  tables: FloorPlanObject[]
  layoutId: string
  isEditMode?: boolean
  showConnections?: boolean
  className?: string
  isSelectionMode?: boolean
  onTableSelect?: (table: FloorPlanObject) => void
  selectedTableId?: string // Added to handle selection state from parent
  activeOrderId?: string | null
  sectionsById?: Record<string, ServerSection>
  onTableLongPress?: (table: FloorPlanObject) => void
  disableLongPress?: boolean
  interactionMode?: 'normal' | 'selection' | 'merge'
}

const TableLayoutView: React.FC<TableLayoutViewProps> = ({
  tables,
  layoutId,
  isEditMode = false,
  showConnections = true,
  className = '',
  isSelectionMode = false,
  onTableSelect,
  selectedTableId, // Consuming the new prop
  activeOrderId,
  sectionsById,
  onTableLongPress,
  disableLongPress = false,
  interactionMode = 'normal'
}) => {
  const toggleTableSelection = useFloorPlanStore(s => s.toggleTableSelection)
  const globallySelectedTableIds = useFloorPlanStore(s => s.selectedTableIds)

  // Create O(1) lookup map for tables
  const tablesById = useMemo(() => {
    return tables.reduce((acc, table) => {
      acc[table.id] = table
      return acc
    }, {} as Record<string, FloorPlanObject>)
  }, [tables])

  // Sort tables by z_index for correct layering (zones/backgrounds render behind tables)
  const sortedTables = useMemo(() => {
    return [...tables].sort((a, b) => (a.z_index ?? 0) - (b.z_index ?? 0))
  }, [tables])

  // Stable geometry key — only changes when position/size/section assignment changes,
  // not when session status/order changes. Prevents sectionOverlays from recomputing
  // on every realtime table session update.
  const tableGeometryKey = useMemo(
    () =>
      tables
        .map(
          t =>
            `${t.id}:${t.x},${t.y},${t.width ?? ''},${t.height ?? ''},${
              t.section_id ?? ''
            }`
        )
        .join('|'),
    [tables]
  )

  // Compute section overlay bounding boxes from tables grouped by section_id
  const sectionOverlays = useMemo(() => {
    if (!sectionsById || Object.keys(sectionsById).length === 0) return []

    const sectionBounds: Record<
      string,
      { minX: number; minY: number; maxX: number; maxY: number }
    > = {}

    tables.forEach(table => {
      if (!table.section_id) return
      const shapeDef = TABLE_SHAPES[table.shape_id as keyof typeof TABLE_SHAPES]
      const w = table.width ?? shapeDef?.width ?? 100
      const h = table.height ?? shapeDef?.height ?? 100

      if (!sectionBounds[table.section_id]) {
        sectionBounds[table.section_id] = {
          minX: table.x,
          minY: table.y,
          maxX: table.x + w,
          maxY: table.y + h
        }
      } else {
        const b = sectionBounds[table.section_id]
        b.minX = Math.min(b.minX, table.x)
        b.minY = Math.min(b.minY, table.y)
        b.maxX = Math.max(b.maxX, table.x + w)
        b.maxY = Math.max(b.maxY, table.y + h)
      }
    })

    const PADDING = 20
    return Object.entries(sectionBounds)
      .filter(([sectionId]) => sectionsById[sectionId])
      .map(([sectionId, bounds]) => ({
        sectionId,
        section: sectionsById[sectionId],
        x: bounds.minX - PADDING,
        y: bounds.minY - PADDING,
        width: bounds.maxX - bounds.minX + PADDING * 2,
        height: bounds.maxY - bounds.minY + PADDING * 2
      }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableGeometryKey, sectionsById])

  // Use the correct selection state:
  // - In selection mode: use global store (supports multi-select for merge)
  // - Otherwise: use global store or fall back to single selectedTableId prop
  const selectedTableIds = selectedTableId
    ? [selectedTableId]
    : globallySelectedTableIds

  // O(1) lookup Set for isSelected checks
  const selectedTableIdsSet = useMemo(
    () => new Set(selectedTableIds),
    [selectedTableIds]
  )

  const [containerDims, setContainerDims] = useState({ width: 0, height: 0 })
  const [contentDims, setContentDims] = useState({ width: 0, height: 0 })

  const [isLoading, setIsLoading] = useState(true)

  const scale = useSharedValue(1)
  const savedScale = useSharedValue(1)
  const translateX = useSharedValue(0)
  const translateY = useSharedValue(0)
  const savedTranslateX = useSharedValue(0)
  const savedTranslateY = useSharedValue(0)
  const opacity = useSharedValue(0)

  const skeletonOpacity = useSharedValue(1)
  const contentOpacity = useSharedValue(0)

  // Position-only fingerprint: only recalc bounding box when tables move, not on session changes
  const positionFingerprint = useMemo(
    () =>
      tables.map(t => `${t.id}:${t.x}:${t.y}:${t.width}:${t.height}`).join('|'),
    [tables]
  )

  const initialLoadDone = useRef(false)

  useEffect(() => {
    if (!initialLoadDone.current) {
      setIsLoading(true)
      initialLoadDone.current = true
    }
    if (tables.length > 0) {
      let maxX = 0
      let maxY = 0
      tables.forEach(table => {
        // Use DB override → shape default → fallback
        const shapeDef =
          TABLE_SHAPES[table.shape_id as keyof typeof TABLE_SHAPES]
        const tableWidth = table.width ?? shapeDef?.width ?? 100
        const tableHeight = table.height ?? shapeDef?.height ?? 100
        if (table.x + tableWidth > maxX) {
          maxX = table.x + tableWidth
        }
        if (table.y + tableHeight > maxY) {
          maxY = table.y + tableHeight
        }
      })
      setContentDims({ width: maxX, height: maxY })
    } else {
      setContentDims({ width: 0, height: 0 })
      setIsLoading(false)
    }
  }, [positionFingerprint])

  // 2. Calculate and set initial scale and position once we have dimensions
  useEffect(() => {
    if (containerDims.width > 0 && contentDims.width > 0) {
      const scaleX = containerDims.width / contentDims.width
      const scaleY = containerDims.height / contentDims.height
      const initialScale = Math.min(scaleX, scaleY)

      const initialTranslateX =
        ((containerDims.width - contentDims.width) * initialScale) / 2
      const initialTranslateY =
        ((containerDims.height - contentDims.height) * initialScale) / 2

      scale.value = initialScale
      savedScale.value = initialScale
      translateX.value = initialTranslateX
      savedTranslateX.value = initialTranslateX
      translateY.value = initialTranslateY
      savedTranslateY.value = initialTranslateY

      setIsLoading(false)
      opacity.value = withTiming(1)
      // Crossfade: fade out skeleton, fade in content
      skeletonOpacity.value = withTiming(0, { duration: 200 })
      contentOpacity.value = withTiming(1, {
        duration: 300,
        easing: Easing.out(Easing.quad)
      })
    } else if (containerDims.width > 0) {
      // Handle case with no tables
      setIsLoading(false)
      opacity.value = withTiming(1)
      skeletonOpacity.value = withTiming(0, { duration: 200 })
      contentOpacity.value = withTiming(1, { duration: 300 })
    }
  }, [containerDims, contentDims])

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    setContainerDims({ width, height })
  }

  const panGesture = Gesture.Pan()
    .minDistance(10) // Require 10px movement to start pan
    .activeOffsetX([-10, 10])
    .activeOffsetY([-10, 10])
    .onUpdate(event => {
      translateX.value = savedTranslateX.value + event.translationX
      translateY.value = savedTranslateY.value + event.translationY
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value
      savedTranslateY.value = translateY.value
    })

  const pinchGesture = Gesture.Pinch()
    .onUpdate(event => {
      // Clamp scale between 0.5x and 3x
      const newScale = Math.max(
        0.5,
        Math.min(3, savedScale.value * event.scale)
      )
      scale.value = newScale
    })
    .onEnd(() => {
      savedScale.value = scale.value
    })

  // Use Simultaneous with minDistance to allow both gestures
  // Pan requires 10px movement, so pinch can work independently
  const combinedGesture = Gesture.Simultaneous(pinchGesture, panGesture)

  const canvasAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value }
    ]
  }))

  // Crossfade animated styles
  const skeletonAnimatedStyle = useAnimatedStyle(() => ({
    opacity: skeletonOpacity.value,
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: skeletonOpacity.value > 0 ? 30 : -1
  }))

  const contentAnimatedStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    flex: 1
  }))

  return (
    <View
      onLayout={onLayout}
      className={`flex-1 relative overflow-hidden ${className}`}
      style={{ backgroundColor: 'transparent' }}
    >
      {/* Skeleton Crossfade Layer */}
      <Animated.View style={skeletonAnimatedStyle}>
        <TableLayoutSkeleton tableCount={8} showControls={false} />
      </Animated.View>

      {/* Gesture Detector wraps entire canvas - must be at top level to catch touches */}
      <GestureDetector gesture={combinedGesture}>
        {/* Main Content with Crossfade */}
        <Animated.View style={contentAnimatedStyle}>
          <Animated.View
            style={[
              canvasAnimatedStyle,
              {
                backgroundColor: 'transparent',
                flex: 1,
                position: 'relative' as const
              }
            ]}
          >
            {/* Section overlay wash + merge connection lines */}
            {(sectionOverlays.length > 0 || showConnections) && (
              <Svg style={StyleSheet.absoluteFill} pointerEvents='none'>
                {/* Section color wash overlays */}
                {sectionOverlays.map(overlay => (
                  <React.Fragment key={`section-${overlay.sectionId}`}>
                    <SvgRect
                      x={overlay.x}
                      y={overlay.y}
                      width={overlay.width}
                      height={overlay.height}
                      rx={12}
                      fill={overlay.section.color + '20'}
                      stroke={overlay.section.color + '40'}
                      strokeWidth={1}
                    />
                    <SvgText
                      x={overlay.x + 8}
                      y={overlay.y + 16}
                      fill={overlay.section.color + '99'}
                      fontSize={12}
                      fontWeight='600'
                    >
                      {overlay.section.name}
                    </SvgText>
                  </React.Fragment>
                ))}
                {sortedTables.map(table => {
                  const mergedTableIds = table.session?.merged_tables
                  if (mergedTableIds && mergedTableIds.length > 0) {
                    // Compute primary table center using actual dimensions
                    const primaryShapeDef =
                      TABLE_SHAPES[table.shape_id as keyof typeof TABLE_SHAPES]
                    const primaryW =
                      table.width ?? primaryShapeDef?.width ?? 100
                    const primaryH =
                      table.height ?? primaryShapeDef?.height ?? 100
                    const primaryCenter = {
                      x: table.x + primaryW / 2,
                      y: table.y + primaryH / 2
                    }

                    return mergedTableIds.map(mergedId => {
                      // Only draw if this table ID is "less than" the other ID to avoid double drawing
                      if (table.id >= mergedId) return null

                      const mergedTable = tablesById[mergedId]
                      if (!mergedTable) return null

                      // Compute merged table center using actual dimensions
                      const mergedShapeDef =
                        TABLE_SHAPES[
                          mergedTable.shape_id as keyof typeof TABLE_SHAPES
                        ]
                      const mergedW =
                        mergedTable.width ?? mergedShapeDef?.width ?? 100
                      const mergedH =
                        mergedTable.height ?? mergedShapeDef?.height ?? 100
                      const mergedCenter = {
                        x: mergedTable.x + mergedW / 2,
                        y: mergedTable.y + mergedH / 2
                      }
                      return (
                        <React.Fragment key={`${table.id}-${mergedId}`}>
                          {/* Glow layer */}
                          <Line
                            x1={primaryCenter.x}
                            y1={primaryCenter.y}
                            x2={mergedCenter.x}
                            y2={mergedCenter.y}
                            stroke='#F59E0B'
                            strokeWidth='6'
                            strokeOpacity='0.15'
                          />
                          {/* Core line */}
                          <Line
                            x1={primaryCenter.x}
                            y1={primaryCenter.y}
                            x2={mergedCenter.x}
                            y2={mergedCenter.y}
                            stroke='#F59E0B'
                            strokeWidth='1.5'
                            strokeOpacity='0.7'
                            strokeDasharray='6, 5'
                          />
                        </React.Fragment>
                      )
                    })
                  }
                  return null
                })}
              </Svg>
            )}
            {sortedTables.map((table, index) => (
              <DraggableTable
                key={table.id}
                table={table}
                layoutId={layoutId}
                isEditMode={isEditMode}
                isSelected={selectedTableIdsSet.has(table.id)}
                interactionMode={interactionMode}
                onSelect={
                  isSelectionMode
                    ? () => onTableSelect && onTableSelect(table)
                    : () => toggleTableSelection(table.id)
                }
                onPress={
                  isSelectionMode
                    ? () => onTableSelect && onTableSelect(table)
                    : () => toggleTableSelection(table.id)
                }
                canvasScale={scale}
                index={index}
                sectionColor={
                  table.section_id
                    ? sectionsById?.[table.section_id]?.color
                    : undefined
                }
                disableLongPress={disableLongPress}
                onLongPress={
                  onTableLongPress ? () => onTableLongPress(table) : undefined
                }
              />
            ))}
          </Animated.View>
        </Animated.View>
      </GestureDetector>

      {/* Zoom Buttons - fixed at top-left of canvas */}
      <View
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          zIndex: 20,
          gap: 4,
          pointerEvents: 'box-none'
        }}
      >
        <TouchableOpacity
          onPress={() => {
            const newScale = Math.min(3, scale.value + 0.2)
            scale.value = withSpring(newScale, { damping: 12, mass: 1, stiffness: 100 })
            savedScale.value = newScale
          }}
          style={{
            pointerEvents: 'auto',
            width: 36,
            height: 36,
            borderRadius: 8,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.panel,
            borderWidth: 1,
            borderColor: colors.border
          }}
        >
          <Plus color={colors.label} size={16} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            const newScale = Math.max(0.5, scale.value - 0.2)
            scale.value = withSpring(newScale, { damping: 12, mass: 1, stiffness: 100 })
            savedScale.value = newScale
          }}
          style={{
            pointerEvents: 'auto',
            width: 36,
            height: 36,
            borderRadius: 8,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.panel,
            borderWidth: 1,
            borderColor: colors.border
          }}
        >
          <Minus color={colors.label} size={16} />
        </TouchableOpacity>
      </View>
    </View>
  )
}

export default React.memo(TableLayoutView)
