import { createLazyPersistStorage } from "@/lib/storage";
import { getOrderStoreSupabaseClient } from "@/stores/useOrderStore";
import {
    DEFAULT_RECEIPT_TEMPLATE,
    ReceiptTemplateConfig,
    receiptTemplateConfigToRow,
    receiptTemplateRowToConfig,
} from "@/types/receipt-template";
import * as FileSystem from "expo-file-system";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ReceiptTemplateStoreState {
  templates: ReceiptTemplateConfig[];
  lastFetchedAt: number | null;
  isSaving: boolean;
  cachedLogoBase64: string | null;
  cachedLogoUrl: string | null; // track which URL was cached

  fetchTemplates: (locationId: string) => Promise<void>;
  getReceiptTemplate: (locationId: string) => ReceiptTemplateConfig;
  getKitchenTemplate: (locationId: string) => ReceiptTemplateConfig;
  getNoSaleTemplate: (locationId: string) => ReceiptTemplateConfig;
  getVoidOrderTemplate: (locationId: string) => ReceiptTemplateConfig;
  getTimeSheetTemplate: (locationId: string) => ReceiptTemplateConfig;
  updateTemplate: (
    templateId: string,
    updates: Partial<ReceiptTemplateConfig>,
  ) => void;
  saveTemplate: (
    template: ReceiptTemplateConfig,
    merchantId: string,
    locationId: string,
  ) => Promise<{ success: boolean; error?: string }>;
  cacheLogoBase64: (logoUrl: string) => Promise<void>;
}

export const useReceiptTemplateStore = create<ReceiptTemplateStoreState>()(
  persist(
    (set, get) => ({
      templates: [],
      lastFetchedAt: null,
      isSaving: false,
      cachedLogoBase64: null,
      cachedLogoUrl: null,

      fetchTemplates: async (locationId: string) => {
        const supabase = getOrderStoreSupabaseClient();
        if (!supabase) {
          console.warn("[ReceiptTemplateStore] No Supabase client available");
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
          console.error("[ReceiptTemplateStore] Error fetching templates:", e);
        }
      },

      getReceiptTemplate: (locationId: string) => {
        const match = get().templates.find(
          (t) => t.locationId === locationId && t.templateType === "receipt",
        );
        return (
          match ?? { ...DEFAULT_RECEIPT_TEMPLATE, templateType: "receipt" }
        );
      },

      getKitchenTemplate: (locationId: string) => {
        const match = get().templates.find(
          (t) => t.locationId === locationId && t.templateType === "kitchen",
        );
        return (
          match ?? { ...DEFAULT_RECEIPT_TEMPLATE, templateType: "kitchen" }
        );
      },

      getNoSaleTemplate: (locationId: string) => {
        const match = get().templates.find(
          (t) => t.locationId === locationId && t.templateType === "no_sale",
        );
        return (
          match ?? { ...DEFAULT_RECEIPT_TEMPLATE, templateType: "no_sale" }
        );
      },

      getVoidOrderTemplate: (locationId: string) => {
        const match = get().templates.find(
          (t) => t.locationId === locationId && t.templateType === "void_order",
        );
        return (
          match ?? { ...DEFAULT_RECEIPT_TEMPLATE, templateType: "void_order" }
        );
      },

      getTimeSheetTemplate: (locationId: string) => {
        const match = get().templates.find(
          (t) => t.locationId === locationId && t.templateType === "time_sheet",
        );
        return (
          match ?? { ...DEFAULT_RECEIPT_TEMPLATE, templateType: "time_sheet" }
        );
      },

      updateTemplate: (
        templateId: string,
        updates: Partial<ReceiptTemplateConfig>,
      ) => {
        const { templates } = get();
        set({
          templates: templates.map((t) =>
            t.id === templateId ? { ...t, ...updates } : t,
          ),
        });
      },

      saveTemplate: async (
        template: ReceiptTemplateConfig,
        merchantId: string,
        locationId: string,
      ) => {
        const supabase = getOrderStoreSupabaseClient();
        if (!supabase) {
          return { success: false, error: "No Supabase client available" };
        }

        set({ isSaving: true });

        try {
          const configToSave: ReceiptTemplateConfig = {
            ...template,
            merchantId,
            locationId,
          };
          const row = receiptTemplateConfigToRow(configToSave);

          const { data, error } = await supabase
            .from("receipt_templates")
            .upsert(row, { onConflict: "id" })
            .select()
            .single();

          if (error) {
            console.error("[ReceiptTemplateStore] Save failed:", error);
            set({ isSaving: false });
            return { success: false, error: error.message };
          }

          if (data) {
            const saved = receiptTemplateRowToConfig(data);
            const { templates } = get();
            const idx = templates.findIndex(
              (t) =>
                t.templateType === saved.templateType &&
                t.locationId === saved.locationId,
            );
            if (idx >= 0) {
              const updated = [...templates];
              updated[idx] = saved;
              set({ templates: updated, isSaving: false });
            } else {
              set({
                templates: [...templates, saved],
                isSaving: false,
              });
            }
          } else {
            set({ isSaving: false });
          }

          return { success: true };
        } catch (e: any) {
          console.error("[ReceiptTemplateStore] Save error:", e);
          set({ isSaving: false });
          return { success: false, error: e?.message ?? "Unknown error" };
        }
      },

      cacheLogoBase64: async (logoUrl: string) => {
        // Skip if already cached for this URL
        if (get().cachedLogoUrl === logoUrl && get().cachedLogoBase64) {
          return;
        }

        try {
          const tempPath = `${FileSystem.cacheDirectory}receipt-logo-cache.png`;
          const download = await FileSystem.downloadAsync(logoUrl, tempPath);

          if (download.status === 200) {
            const base64 = await FileSystem.readAsStringAsync(tempPath, {
              encoding: FileSystem.EncodingType.Base64,
            });
            set({ cachedLogoBase64: base64, cachedLogoUrl: logoUrl });
            console.log("[ReceiptTemplateStore] Logo cached successfully");
          } else {
            console.warn(
              "[ReceiptTemplateStore] Logo download failed:",
              download.status,
            );
          }
        } catch (e) {
          console.error("[ReceiptTemplateStore] Logo caching error:", e);
        }
      },
    }),
    {
      name: "receipt-template-store-storage",
      storage: createLazyPersistStorage(),
      version: 1,
      migrate: (persistedState) => persistedState as any,
      partialize: (state) => ({
        templates: state.templates,
        lastFetchedAt: state.lastFetchedAt,
        cachedLogoBase64: state.cachedLogoBase64,
        cachedLogoUrl: state.cachedLogoUrl,
      }),
    },
  ),
);
