import { create } from 'zustand'

interface PendingTableOverlayState {
  pendingTableId: string | null
  setPendingTableId: (id: string) => void
  consume: () => string | null
}

export const usePendingTableOverlay = create<PendingTableOverlayState>()(
  (set, get) => ({
    pendingTableId: null,
    setPendingTableId: (id) => set({ pendingTableId: id }),
    consume: () => {
      const id = get().pendingTableId
      if (id) set({ pendingTableId: null })
      return id
    },
  })
)
