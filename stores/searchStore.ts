import { BottomSheetMethods } from '@/components/ui/bottomSheet'
import { Keyboard } from 'react-native'
import { create } from 'zustand'

type SearchStore = {
  searchSheetRef: React.RefObject<BottomSheetMethods> | null
  setSearchSheetRef: (ref: React.RefObject<BottomSheetMethods>) => void
  clearSearchSheetRef: (ref: React.RefObject<BottomSheetMethods>) => void
  openSearch: () => void
  closeSearch: () => void
}

export const useSearchStore = create<SearchStore>((set, get) => ({
  searchSheetRef: null,
  setSearchSheetRef: ref => set({ searchSheetRef: ref }),
  // Only clear if the stored ref is still the one this owner registered, so a
  // stale owner unmounting after a newer owner mounted doesn't wipe the live ref.
  clearSearchSheetRef: ref => {
    if (get().searchSheetRef === ref) set({ searchSheetRef: null })
  },
  openSearch: () => {
    const { searchSheetRef } = useSearchStore.getState()
    searchSheetRef?.current?.expand()
  },
  closeSearch: () => {
    Keyboard.dismiss()
    const { searchSheetRef } = useSearchStore.getState()
    searchSheetRef?.current?.close()
  }
}))
