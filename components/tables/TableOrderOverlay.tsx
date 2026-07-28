import TableOrderView, {
  type TableOrderViewHandle
} from '@/components/tables/TableOrderView'
import { colors } from '@/lib/theme'
import { usePendingTableOverlay } from '@/stores/usePendingTableOverlay'
import { useCallback, useEffect, useRef } from 'react'
import { BackHandler, StyleSheet, useWindowDimensions, View } from 'react-native'

/**
 * Renders TableOrderView as a full-screen overlay on top of the (always-mounted)
 * tables floor plan. This avoids the slow Slot/Stack screen swap entirely:
 *
 *  - Opening:  flip `openTableId` → overlay mounts on top, floor stays alive.
 *  - Closing:  flip it back to null → TableOrderView fully unmounts, releasing
 *              every view it created (no leak), while the floor — never having
 *              unmounted — is instantly visible underneath.
 *
 * `key={openTableId}` guarantees a fresh TableOrderView per table so no stale
 * session/order state bleeds between tables.
 */
export default function TableOrderOverlay ({
  availableHeight,
}: {
  availableHeight?: number
}) {
  const { height: windowHeight } = useWindowDimensions()
  const openTableId = usePendingTableOverlay(s => s.openTableId)
  const closeTable = usePendingTableOverlay(s => s.closeTable)
  const tableViewRef = useRef<TableOrderViewHandle>(null)
  const isClosingRef = useRef(false)

  // Reset the close guard whenever a new table opens.
  useEffect(() => {
    isClosingRef.current = false
  }, [openTableId])

  const handleClose = useCallback(() => {
    if (isClosingRef.current) return
    isClosingRef.current = true
    // Suppress side-effects in the unmounting view, then drop the overlay.
    tableViewRef.current?.prepareClose()
    closeTable()
  }, [closeTable])

  // Android hardware back closes the overlay instead of leaving the screen.
  useEffect(() => {
    if (!openTableId) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleClose()
      return true
    })
    return () => sub.remove()
  }, [openTableId, handleClose])

  if (!openTableId) return null

  return (
    <View
      style={[styles.overlay, { height: availableHeight || windowHeight }]}
      pointerEvents='auto'
    >
      <TableOrderView
        key={openTableId}
        ref={tableViewRef}
        tableId={openTableId}
        onClose={handleClose}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    // Width comes from left:0 + right:0 (the parent's cross-axis resolves fine).
    // HEIGHT is set inline from the measured parent height (availableHeight):
    // inset-only top/left/right/bottom:0 collapses to zero on Fabric (the bug
    // that shrank the modifier overlay to a corner), while full window height
    // overflows past the safe area / system bars (which cut off the Pay bar).
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.screen,
    zIndex: 50
  }
})
