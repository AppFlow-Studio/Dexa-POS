import { mmkvStorage } from "@/lib/storage";
import {
  DEFAULT_RECEIPT_TEMPLATE,
  ReceiptTemplateConfig,
  receiptTemplateRowToConfig,
} from "@/types/receipt-template";
import { getOrderStoreSupabaseClient } from "@/stores/useOrderStore";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface ReceiptTemplateStoreState {
  templates: ReceiptTemplateConfig[];
  lastFetchedAt: number | null;

  fetchTemplates: (locationId: string) => Promise<void>;
  getReceiptTemplate: (locationId: string) => ReceiptTemplateConfig;
  getKitchenTemplate: (locationId: string) => ReceiptTemplateConfig;
}

export const useReceiptTemplateStore = create<ReceiptTemplateStoreState>()(
  persist(
    (set, get) => ({
      templates: [],
      lastFetchedAt: null,

      fetchTemplates: async (locationId: string) => {
        const supabase = getOrderStoreSupabaseClient();
        if (!supabase) {
          console.warn(
            "[ReceiptTemplateStore] No Supabase client available",
          );
          return;
        }

        try {
          const { data, error } = await supabase
            .from("receipt_templates")
            .select("*")
            .eq("location_id", locationId)
            .eq("is_active", true);

          if (error) {
            console.error(
              "[ReceiptTemplateStore] Failed to fetch templates:",
              error,
            );
            return;
          }

          if (data) {
            const configs = data.map(receiptTemplateRowToConfig);
            set({ templates: configs, lastFetchedAt: Date.now() });
          }
        } catch (e) {
          console.error(
            "[ReceiptTemplateStore] Error fetching templates:",
            e,
          );
        }
      },

      getReceiptTemplate: (locationId: string) => {
        const match = get().templates.find(
          (t) =>
            t.locationId === locationId && t.templateType === "receipt",
        );
        return match ?? { ...DEFAULT_RECEIPT_TEMPLATE, templateType: "receipt" };
      },

      getKitchenTemplate: (locationId: string) => {
        const match = get().templates.find(
          (t) =>
            t.locationId === locationId &&
            t.templateType === "kitchen_ticket",
        );
        return match ?? { ...DEFAULT_RECEIPT_TEMPLATE, templateType: "kitchen_ticket" };
      },
    }),
    {
      name: "receipt-template-store-storage",
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({
        templates: state.templates,
        lastFetchedAt: state.lastFetchedAt,
      }),
    },
  ),
);
