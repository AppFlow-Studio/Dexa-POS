import { TABLE_SHAPES } from '@/lib/table-shapes'
import { colors } from '@/lib/theme'
import { useColorScheme } from '@/lib/useColorScheme'
import { WallEdgeFlags } from '@/lib/wallCornerSnap'
import { FloorPlanObject } from '@/types/db-floor-plan-types'
import React from 'react'
import { View } from 'react-native'

/**
 * View-mode renderer for NON-table floor-plan objects: walls, doors, pillars,
 * plants, zones, text labels, kitchen pass — every `type: 'static-object'` shape.
 *
 * **Zero store subscriptions. Zero timers. Zero effects.** These objects carry no
 * live data (no session, order, reservation, server, or duration), so they must
 * not subscribe to any store. This is deliberate and load-bearing:
 *
 * Walls are the highest-count object on a typical canvas. When the previous
 * implementation routed them through the shared table-card data hook, each wall
 * opened ~6 store subscriptions (session ×2, order, reservation, merged-names,
 * totals) that all resolved to null for a non-table. Those listener edges live in
 * long-lived Zustand stores and pin the component — and therefore its native SVG
 * view tree — whenever an unmount fails to run (e.g. an interrupted screen
 * transition). That retained the entire structure subtree and was why native heap
 * only dropped after deleting walls.
 *
 * By rendering structures from static props alone, there is nothing for any store
 * to hold a reference to, so the subtree is collectible the moment it unmounts —
 * both when leaving the canvas (navigating out of /tables) and when the canvas
 * itself swaps layouts or toggles edit mode.
 */
const ReadonlyStructure: React.FC<{
  table: FloorPlanObject
  isSelected: boolean
  onSelect: (table: FloorPlanObject) => void
  wallEdgeFlags?: WallEdgeFlags
}> = ({ table, isSelected, wallEdgeFlags }) => {
  const { isDarkColorScheme } = useColorScheme()

  const shapeDef =
    TABLE_SHAPES[table.shape_id as keyof typeof TABLE_SHAPES] ||
    TABLE_SHAPES['square-4']
  const ShapeComponent = shapeDef?.component

  const width = table.width ?? shapeDef?.width ?? 100
  const height = table.height ?? shapeDef?.height ?? 100

  const isWall = table.shape_id === 'wall-section'
  const resolvedWallEdgeFlags: WallEdgeFlags = wallEdgeFlags ?? {
    hideTop: false,
    hideRight: false,
    hideBottom: false,
    hideLeft: false
  }

  return (
    <View
      pointerEvents='none'
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        transform: [
          { translateX: table.x },
          { translateY: table.y },
          { rotate: `${table.rotation || 0}deg` }
        ]
      }}
    >
      <View style={{ width, height }}>
        {ShapeComponent ? (
          <ShapeComponent
            darkMode={isDarkColorScheme}
            color={colors.label}
            {...(table.shape_id === 'label-text' && { label: table.name })}
            {...(isWall && resolvedWallEdgeFlags)}
            width={width}
            height={height}
          />
        ) : (
          <View
            style={{
              width,
              height,
              backgroundColor: colors.label,
              borderRadius: 16
            }}
          />
        )}

        {/* Selection border — absolutely positioned so it never affects layout */}
        {isSelected && (
          <View
            pointerEvents='none'
            style={{
              position: 'absolute',
              top: -3,
              left: -3,
              right: -3,
              bottom: -3,
              borderWidth: 2,
              borderColor: colors.info,
              borderRadius: 18
            }}
          />
        )}
      </View>
    </View>
  )
}

export default React.memo(ReadonlyStructure, (prev, next) => {
  return (
    prev.table.x === next.table.x &&
    prev.table.y === next.table.y &&
    prev.table.rotation === next.table.rotation &&
    prev.table.width === next.table.width &&
    prev.table.height === next.table.height &&
    prev.table.name === next.table.name &&
    prev.table.shape_id === next.table.shape_id &&
    prev.isSelected === next.isSelected &&
    prev.wallEdgeFlags?.hideTop === next.wallEdgeFlags?.hideTop &&
    prev.wallEdgeFlags?.hideRight === next.wallEdgeFlags?.hideRight &&
    prev.wallEdgeFlags?.hideBottom === next.wallEdgeFlags?.hideBottom &&
    prev.wallEdgeFlags?.hideLeft === next.wallEdgeFlags?.hideLeft
  )
})
