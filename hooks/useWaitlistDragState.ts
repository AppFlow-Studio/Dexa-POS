import { useRef } from 'react'
import { SharedValue, makeMutable } from 'react-native-reanimated'

export interface DragCardState {
  translateY: SharedValue<number>
  isDragging: SharedValue<boolean>
}

/**
 * Manages per-card shared values for drag-to-reorder.
 * Uses makeMutable (not useSharedValue) so it can safely be called
 * inside a loop without violating React hook rules.
 */
export function useWaitlistDragState(count: number): DragCardState[] {
  const slotsRef = useRef<DragCardState[]>([])

  // Grow array as needed (never shrink to keep references stable)
  while (slotsRef.current.length < count) {
    slotsRef.current.push({
      translateY: makeMutable(0),
      isDragging: makeMutable(false)
    })
  }

  // Return the ref array directly (stable reference) — callers use index access,
  // so returning the same array that may have extra slots beyond `count` is safe.
  return slotsRef.current
}
