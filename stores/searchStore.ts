import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types'
import { Keyboard } from 'react-native'
import { create } from 'zustand'

type SearchStore = {
  searchSheetRef: React.RefObject<BottomSheetMethods> | null
  setSearchSheetRef: (ref: React.RefObject<BottomSheetMethods>) => void
  openSearch: () => void
  closeSearch: () => void
}

export const useSearchStore = create<SearchStore>(set => ({
  searchSheetRef: null,
  setSearchSheetRef: ref => set({ searchSheetRef: ref }),
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
