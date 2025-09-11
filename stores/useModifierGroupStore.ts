import { MOCK_MODIFIER_GROUPS } from "@/lib/mockData";
import { ModifierGroup, ModifierOption } from "@/lib/types";
import { create } from "zustand";

interface ModifierGroupState {
  modifierGroups: ModifierGroup[];
  createGroup: (group: Omit<ModifierGroup, "id" | "options">) => void;
  updateGroup: (groupId: string, updates: Partial<ModifierGroup>) => void;
  deleteGroup: (groupId: string) => void;
  addOptionToGroup: (
    groupId: string,
    option: Omit<ModifierOption, "id">
  ) => void;
  updateOptionInGroup: (
    groupId: string,
    optionId: string,
    updates: Partial<ModifierOption>
  ) => void;
  deleteOptionFromGroup: (groupId: string, optionId: string) => void;
}

export const useModifierGroupStore = create<ModifierGroupState>((set) => ({
  modifierGroups: MOCK_MODIFIER_GROUPS,

  createGroup: (groupData) =>
    set((state) => ({
      modifierGroups: [
        ...state.modifierGroups,
        { ...groupData, id: `mg_${Date.now()}`, options: [] },
      ],
    })),

  updateGroup: (groupId, updates) =>
    set((state) => ({
      modifierGroups: state.modifierGroups.map((group) =>
        group.id === groupId ? { ...group, ...updates } : group
      ),
    })),

  deleteGroup: (groupId) =>
    set((state) => ({
      modifierGroups: state.modifierGroups.filter(
        (group) => group.id !== groupId
      ),
    })),

  addOptionToGroup: (groupId, optionData) =>
    set((state) => ({
      modifierGroups: state.modifierGroups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              options: [
                ...group.options,
                { ...optionData, id: `opt_${Date.now()}` },
              ],
            }
          : group
      ),
    })),

  updateOptionInGroup: (groupId, optionId, updates) =>
    set((state) => ({
      modifierGroups: state.modifierGroups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              options: group.options.map((opt) =>
                opt.id === optionId ? { ...opt, ...updates } : opt
              ),
            }
          : group
      ),
    })),

  deleteOptionFromGroup: (groupId, optionId) =>
    set((state) => ({
      modifierGroups: state.modifierGroups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              options: group.options.filter((opt) => opt.id !== optionId),
            }
          : group
      ),
    })),
}));
