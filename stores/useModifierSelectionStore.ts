import { ModifierCategory } from '@/lib/types'
import { create } from 'zustand'

/**
 * Per-session modifier SELECTION state for the (single, permanently-mounted)
 * ModifierScreen.
 *
 * Why this is its own store: selections used to live in ModifierScreen's
 * useImmerReducer, at the top of the component — so every option tap
 * re-rendered the entire 2,400-line tree (header, tabs, grid, quantity,
 * notes, footer). With selections here, an option cell subscribes to exactly
 * its own value and a tap re-renders only the affected cells plus the small
 * Done-button total. The big tree renders once per open, not once per tap.
 *
 * The toggle semantics below are a 1:1 port of the old reducer's
 * TOGGLE_MODIFIER / TOGGLE_NO_MODIFIER cases (single vs multi select,
 * maxSelections cap, and the tri-state true/'no'/false long-press behavior).
 *
 * This store is session-scoped: `init()` is called by ModifierScreen's
 * session effect on every open with the precomputed initial selections.
 */

export interface ModifierSelection {
  [categoryId: string]: {
    [optionId: string]: boolean | 'no'
  }
}

interface ModifierSelectionState {
  selections: ModifierSelection
  selectionCounts: Record<string, number>

  init: (selections: ModifierSelection) => void
  toggle: (
    categoryId: string,
    optionId: string,
    category: ModifierCategory
  ) => void
  toggleNo: (
    categoryId: string,
    optionId: string,
    category: ModifierCategory
  ) => void
}

const computeSelectionCounts = (
  selections: ModifierSelection
): Record<string, number> => {
  const counts: Record<string, number> = {}
  for (const catId in selections) {
    let count = 0
    const catSelections = selections[catId]
    for (const key in catSelections) {
      if (catSelections[key] === true || catSelections[key] === 'no') count++
    }
    counts[catId] = count
  }
  return counts
}

export const useModifierSelectionStore = create<ModifierSelectionState>(
  (set, get) => ({
    selections: {},
    selectionCounts: {},

    init: selections =>
      set({
        selections,
        selectionCounts: computeSelectionCounts(selections)
      }),

    toggle: (categoryId, optionId, category) => {
      const { selections, selectionCounts } = get()
      const catSelections = selections[categoryId] ?? {}
      const currentCount = selectionCounts[categoryId] ?? 0
      const currentVal = catSelections[optionId]

      let nextCat: { [optionId: string]: boolean | 'no' }
      let nextCount: number

      if (currentVal === 'no') {
        // Tapping a "NO" modifier deselects it entirely
        nextCat = { ...catSelections, [optionId]: false }
        nextCount = currentCount - 1
      } else if (category.selectionType === 'single') {
        const wasSelected = !!currentVal
        nextCat = {}
        for (const key of Object.keys(catSelections)) nextCat[key] = false
        nextCat[optionId] = !wasSelected
        nextCount = wasSelected ? 0 : 1
      } else {
        const isCurrentlySelected = currentVal
        if (
          !isCurrentlySelected &&
          category.maxSelections &&
          currentCount >= category.maxSelections
        ) {
          return
        }
        nextCat = { ...catSelections, [optionId]: !isCurrentlySelected }
        nextCount = isCurrentlySelected ? currentCount - 1 : currentCount + 1
      }

      set({
        selections: { ...selections, [categoryId]: nextCat },
        selectionCounts: { ...selectionCounts, [categoryId]: nextCount }
      })
    },

    toggleNo: (categoryId, optionId, category) => {
      const { selections, selectionCounts } = get()
      const catSelections = selections[categoryId] ?? {}
      const currentCount = selectionCounts[categoryId] ?? 0
      const currentVal = catSelections[optionId]

      let nextCat: { [optionId: string]: boolean | 'no' }
      let nextCount: number

      if (currentVal === 'no') {
        // Already NO → deselect
        nextCat = { ...catSelections, [optionId]: false }
        nextCount = currentCount - 1
      } else if (category.selectionType === 'single') {
        // Clear other selections first
        nextCat = {}
        for (const key of Object.keys(catSelections)) nextCat[key] = false
        nextCat[optionId] = 'no'
        nextCount = 1
      } else {
        const wasSelected = currentVal === true
        if (
          !wasSelected &&
          category.maxSelections &&
          currentCount >= category.maxSelections
        ) {
          return
        }
        nextCat = { ...catSelections, [optionId]: 'no' }
        nextCount = wasSelected ? currentCount : currentCount + 1
      }

      set({
        selections: { ...selections, [categoryId]: nextCat },
        selectionCounts: { ...selectionCounts, [categoryId]: nextCount }
      })
    }
  })
)

/** Read the current selections without subscribing (for save/validation). */
export const getModifierSelections = () =>
  useModifierSelectionStore.getState().selections

/** Read the current per-category counts without subscribing. */
export const getModifierSelectionCounts = () =>
  useModifierSelectionStore.getState().selectionCounts
