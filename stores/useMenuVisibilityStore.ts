import { mmkvStorage } from '@/lib/storage'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

type MenuVisibilityState = {
  hiddenMenuIdsByLocation: Record<string, string[]>
  toggleHiddenMenu: (locationId: string, menuId: string) => void
  setHiddenMenuIds: (locationId: string, menuIds: string[]) => void
  clearHiddenMenus: (locationId: string) => void
}

export const useMenuVisibilityStore = create<MenuVisibilityState>()(
  persist(
    set => ({
      hiddenMenuIdsByLocation: {},
      toggleHiddenMenu: (locationId, menuId) =>
        set(state => {
          const current = state.hiddenMenuIdsByLocation[locationId] || []
          const next = current.includes(menuId)
            ? current.filter(id => id !== menuId)
            : [...current, menuId]
          return {
            hiddenMenuIdsByLocation: {
              ...state.hiddenMenuIdsByLocation,
              [locationId]: next
            }
          }
        }),
      setHiddenMenuIds: (locationId, menuIds) =>
        set(state => ({
          hiddenMenuIdsByLocation: {
            ...state.hiddenMenuIdsByLocation,
            [locationId]: menuIds
          }
        })),
      clearHiddenMenus: locationId =>
        set(state => {
          const { [locationId]: _removed, ...rest } = state.hiddenMenuIdsByLocation
          return { hiddenMenuIdsByLocation: rest }
        })
    }),
    {
      name: 'menu-visibility-store',
      storage: createJSONStorage(() => mmkvStorage),
      partialize: state => ({
        hiddenMenuIdsByLocation: state.hiddenMenuIdsByLocation
      })
    }
  )
)
