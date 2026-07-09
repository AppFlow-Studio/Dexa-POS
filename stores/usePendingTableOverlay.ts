import { markStart } from '@/lib/perf'
import { create } from 'zustand'

interface PendingTableOverlayState {
  /** When set, the TableOrderOverlay renders TableOrderView for this table
   *  on top of the tables screen (which stays mounted underneath). */
  openTableId: string | null
  /** Open the order overlay for a table. */
  openTable: (id: string) => void
  /** Close the overlay — unmounts TableOrderView, releasing all its views. */
  closeTable: () => void

  // --- Legacy waitlist-seating handoff (kept for backward compat) ---
  pendingTableId: string | null
  setPendingTableId: (id: string) => void
  consume: () => string | null
}

export const usePendingTableOverlay = create<PendingTableOverlayState>()(
  (set, get) => ({
    openTableId: null,
    openTable: id => {
      // Perf T0: open → TableOrderView interactive (ended at renderStage 1;
      // TTL-cancelled automatically if the view never mounts).
      markStart('pos.table_open', { table_id: id })
      set({ openTableId: id })
    },
    closeTable: () => set({ openTableId: null }),

    pendingTableId: null,
    setPendingTableId: id => set({ pendingTableId: id }),
    consume: () => {
      const id = get().pendingTableId
      if (id) set({ pendingTableId: null })
      return id
    },
  })
)
