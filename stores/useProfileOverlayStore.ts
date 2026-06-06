import { create } from 'zustand'

interface ProfileOverlayState {
  isOpen: boolean
  openProfile: () => void
  closeProfile: () => void
}

export const useProfileOverlayStore = create<ProfileOverlayState>(set => ({
  isOpen: false,
  openProfile: () => set({ isOpen: true }),
  closeProfile: () => set({ isOpen: false })
}))
