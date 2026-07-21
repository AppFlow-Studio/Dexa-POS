import { createMMKV } from 'react-native-mmkv'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

const editorStorage = createMMKV({
  id: 'dexa-pos-floor-plan-editor'
})

const mmkvStorage = {
  getItem: (name: string) => editorStorage.getString(name) ?? null,
  setItem: (name: string, value: string) => editorStorage.set(name, value),
  removeItem: (name: string) => editorStorage.delete(name)
}

type FloorPlanEditorState = {
  lockedObjectIds: string[]
  toggleObjectLock: (objectId: string) => void
  setObjectLocked: (objectId: string, locked: boolean) => void
  isObjectLocked: (objectId: string) => boolean
}

export const useFloorPlanEditorStore = create<FloorPlanEditorState>()(
  persist(
    (set, get) => ({
      lockedObjectIds: [],
      toggleObjectLock: objectId =>
        set(state => ({
          lockedObjectIds: state.lockedObjectIds.includes(objectId)
            ? state.lockedObjectIds.filter(id => id !== objectId)
            : [...state.lockedObjectIds, objectId]
        })),
      setObjectLocked: (objectId, locked) =>
        set(state => ({
          lockedObjectIds: locked
            ? state.lockedObjectIds.includes(objectId)
              ? state.lockedObjectIds
              : [...state.lockedObjectIds, objectId]
            : state.lockedObjectIds.filter(id => id !== objectId)
        })),
      isObjectLocked: objectId => get().lockedObjectIds.includes(objectId)
    }),
    {
      name: 'floor-plan-editor-store',
      storage: createJSONStorage(() => mmkvStorage),
      partialize: state => ({
        lockedObjectIds: state.lockedObjectIds
      })
    }
  )
)
