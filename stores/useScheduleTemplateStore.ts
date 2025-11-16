import { ScheduleTemplate } from "@/lib/types";
import uuid from "react-native-uuid"; // Updated import
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ScheduleTemplateState {
  templates: ScheduleTemplate[];
  activeTemplateIds: string[];
  actions: {
    addTemplate: (templateData: Omit<ScheduleTemplate, "id">) => void;
    updateTemplate: (
      templateId: string,
      updatedData: Partial<Omit<ScheduleTemplate, "id">>
    ) => void;
    deleteTemplate: (templateId: string) => void;
    duplicateTemplate: (templateId: string) => void;
    setActiveTemplateIds: (templateIds: string[]) => void;
  };
}

export const useScheduleTemplateStore = create<ScheduleTemplateState>()(
  persist(
    (set, get) => ({
      templates: [],
      activeTemplateIds: [],
      actions: {
        addTemplate: (templateData) =>
          set((state) => ({
            templates: [
              ...state.templates,
              { id: uuid.v4() as string, ...templateData }, // Updated usage
            ],
          })),
        updateTemplate: (templateId, updatedData) =>
          set((state) => ({
            templates: state.templates.map((template) =>
              template.id === templateId
                ? { ...template, ...updatedData }
                : template
            ),
          })),
        deleteTemplate: (templateId) =>
          set((state) => ({
            templates: state.templates.filter(
              (template) => template.id !== templateId
            ),
            activeTemplateIds: state.activeTemplateIds.filter(
              (id) => id !== templateId
            ),
          })),
        duplicateTemplate: (templateId) => {
          const templateToDuplicate = get().templates.find(
            (template) => template.id === templateId
          );
          if (templateToDuplicate) {
            const newTemplate: ScheduleTemplate = {
              ...templateToDuplicate,
              id: uuid.v4() as string, // Updated usage
              name: `${templateToDuplicate.name} (Copy)`,
              shifts: templateToDuplicate.shifts.map((shift) => ({
                ...shift,
                tempId: uuid.v4() as string, // Updated usage
              })),
            };
            set((state) => ({
              templates: [...state.templates, newTemplate],
            }));
          }
        },
        setActiveTemplateIds: (templateIds) =>
          set(() => ({
            activeTemplateIds: templateIds,
          })),
      },
    }),
    {
      name: "schedule-template-storage", // unique name
      partialize: (state) => ({
        templates: state.templates,
        activeTemplateIds: state.activeTemplateIds,
      }),
    }
  )
);

// Export actions for easier consumption
export const {
  addTemplate,
  updateTemplate,
  deleteTemplate,
  duplicateTemplate,
  setActiveTemplateIds,
} = useScheduleTemplateStore.getState().actions;
