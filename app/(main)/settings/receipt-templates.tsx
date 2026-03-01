import { Switch } from "@/components/ui/switch";
import { toastService } from "@/lib/toastService";
import { useReceiptTemplateStore } from "@/stores/useReceiptTemplateStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import {
  DEFAULT_RECEIPT_TEMPLATE,
  ReceiptTemplateConfig,
} from "@/types/receipt-template";
import {
  Barcode,
  Clock,
  QrCode,
  TriangleAlert,
} from "lucide-react-native";
import { colors } from "@/lib/theme";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// ============================================================================
// TYPES
// ============================================================================

type TabType = "receipt" | "kitchen";

// ============================================================================
// SMALL COMPONENTS
// ============================================================================

function SectionHeader({ title }: { title: string }) {
  return (
    <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-5 mb-2 px-1">
      {title}
    </Text>
  );
}

function ToggleRow({
  label,
  value,
  onToggle,
}: {
  label: string;
  value: boolean;
  onToggle: (val: boolean) => void;
}) {
  return (
    <View className="flex-row items-center justify-between py-3 px-3 bg-surface rounded-lg mb-2">
      <Text className="text-white text-sm flex-1 mr-3">{label}</Text>
      <Switch checked={value} onCheckedChange={onToggle} />
    </View>
  );
}

function TextRow({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}) {
  return (
    <View className="mb-2">
      <Text className="text-gray-400 text-xs mb-1 px-1">{label}</Text>
      <TextInput
        className="bg-surface text-white text-sm px-3 py-2.5 rounded-lg"
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? label}
        placeholderTextColor={colors.muted}
      />
    </View>
  );
}

// ============================================================================
// RECEIPT PAPER WRAPPER
// ============================================================================

function ReceiptPaper({ children }: { children: React.ReactNode }) {
  return (
    <View className="bg-white rounded-lg p-4 mx-2">
      <View className="px-1">{children}</View>
    </View>
  );
}

function DottedLine() {
  return <View className="border-t border-dashed border-gray-300 my-1.5" />;
}

function DoubleLine() {
  return <View className="border-t-2 border-gray-400 my-1.5" />;
}

// ============================================================================
// RECEIPT PREVIEW
// ============================================================================

function ReceiptPreview({
  config,
  storeName,
}: {
  config: ReceiptTemplateConfig;
  storeName: string;
}) {
  return (
    <ReceiptPaper>
      {/* Logo */}
      {config.showLogo && (
        <View className="items-center mb-2">
          <View className="w-10 h-10 bg-gray-300 rounded" />
        </View>
      )}

      {/* Header */}
      <Text className="text-black text-center font-bold text-sm">
        {storeName || "Sample Restaurant"}
      </Text>
      <Text className="text-zinc-500 text-center text-[10px]">
        123 Main St, City, ST 12345
      </Text>
      <Text className="text-zinc-500 text-center text-[10px]">
        (555) 123-4567
      </Text>
      {config.headerText ? (
        <Text className="text-black text-center text-[10px] mt-1">
          {config.headerText}
        </Text>
      ) : null}

      <DoubleLine />

      {/* Order info */}
      <View className="flex-row justify-between">
        <Text className="text-black text-xs">Order #1042</Text>
        <Text className="text-black text-xs">01/15/2026</Text>
      </View>
      {config.showOrderType && (
        <Text className="text-zinc-500 text-xs">Dine In - Table 5</Text>
      )}
      {config.showServerName && (
        <Text className="text-zinc-500 text-xs">Server: Sarah M.</Text>
      )}

      <DottedLine />

      {/* Items */}
      <View className="gap-1">
        <View className="flex-row justify-between">
          <Text className="text-black text-xs">1x Cheeseburger</Text>
          <Text className="text-black text-xs">$12.99</Text>
        </View>
        {config.showItemModifiers && (
          <Text className="text-zinc-500 text-[10px] ml-3">
            + Extra Cheese, No Onions
          </Text>
        )}

        <View className="flex-row justify-between">
          <Text className="text-black text-xs">1x Caesar Salad</Text>
          <Text className="text-black text-xs">$9.50</Text>
        </View>
        {config.showItemModifiers && (
          <Text className="text-zinc-500 text-[10px] ml-3">
            + Grilled Chicken
          </Text>
        )}

        <View className="flex-row justify-between">
          <Text className="text-black text-xs">2x Iced Tea</Text>
          <Text className="text-black text-xs">$5.98</Text>
        </View>
      </View>

      <DottedLine />

      {/* Totals */}
      <View className="flex-row justify-between">
        <Text className="text-black text-xs">Subtotal</Text>
        <Text className="text-black text-xs">$28.47</Text>
      </View>
      {config.showTaxBreakdown && (
        <View className="flex-row justify-between">
          <Text className="text-zinc-500 text-xs">Tax (8.25%)</Text>
          <Text className="text-zinc-500 text-xs">$2.35</Text>
        </View>
      )}

      <DoubleLine />

      <View className="flex-row justify-between">
        <Text className="text-black text-sm font-bold">Total</Text>
        <Text className="text-black text-sm font-bold">$30.82</Text>
      </View>

      {/* Tip line */}
      {config.showTipLine && (
        <>
          <DottedLine />
          <View className="flex-row justify-between">
            <Text className="text-black text-xs">Tip:</Text>
            <Text className="text-black text-xs">________</Text>
          </View>
          <View className="flex-row justify-between mt-1">
            <Text className="text-black text-xs font-bold">Total w/ Tip:</Text>
            <Text className="text-black text-xs font-bold">________</Text>
          </View>
        </>
      )}

      <DottedLine />

      {/* Payment */}
      <View className="flex-row justify-between">
        <Text className="text-black text-xs">Paid: Card</Text>
        <Text className="text-black text-xs">$30.82</Text>
      </View>
      <Text className="text-zinc-500 text-[10px]">
        Visa ending in 4242
      </Text>

      {/* Footer */}
      {config.footerText ? (
        <>
          <DottedLine />
          <Text className="text-black text-center text-[10px]">
            {config.footerText}
          </Text>
        </>
      ) : null}

      {/* Barcode / QR */}
      {(config.showBarcode || config.showQrCode) && (
        <View className="flex-row justify-center items-center gap-3 mt-3">
          {config.showBarcode && (
            <Barcode size={32} color="#a1a1aa" strokeWidth={1.5} />
          )}
          {config.showQrCode && (
            <QrCode size={32} color="#a1a1aa" strokeWidth={1.5} />
          )}
        </View>
      )}
    </ReceiptPaper>
  );
}

// ============================================================================
// KITCHEN PREVIEW
// ============================================================================

function KitchenPreview({
  config,
}: {
  config: ReceiptTemplateConfig;
  storeName: string;
}) {
  const itemTextClass = config.largeItemText
    ? "text-black text-lg font-bold"
    : "text-black text-sm font-bold";
  const modTextClass = config.showModsLarge
    ? "text-zinc-500 text-sm font-semibold ml-3"
    : "text-zinc-500 text-[10px] ml-3";

  return (
    <ReceiptPaper>
      {/* Order header */}
      <Text className="text-black text-center font-bold text-lg">
        ORDER #1042
      </Text>
      {config.showOrderType && (
        <Text className="text-black text-center font-semibold text-xs">
          DINE IN - Table 5
        </Text>
      )}
      {config.showServerName && (
        <Text className="text-zinc-500 text-center text-xs">
          Server: Sarah M.
        </Text>
      )}
      <Text className="text-zinc-500 text-center text-[10px]">
        01/15/2026 12:34 PM
      </Text>

      {/* Ready by time */}
      {config.showReadyByTime && (
        <View className="flex-row items-center justify-center gap-1 mt-1">
          <Clock size={12} color="#000" />
          <Text className="text-black text-sm font-bold">
            Ready by: 12:49 PM
          </Text>
        </View>
      )}

      <DoubleLine />

      {/* Station grouping */}
      {config.groupByStation && (
        <View className="bg-gray-200 -mx-5 px-5 py-0.5 mb-2">
          <Text className="text-center font-bold text-xs uppercase tracking-wider text-black">
            GRILL STATION
          </Text>
        </View>
      )}

      {/* Items */}
      <View className="gap-2">
        {/* Item 1: Cheeseburger */}
        <View>
          <Text className={itemTextClass}>1x Cheeseburger</Text>
          {config.showItemModifiers && (
            <View>
              <Text className={modTextClass}>+ Extra Cheese</Text>
              <Text className={modTextClass}>- No Onions</Text>
            </View>
          )}
          {config.showAllergyAlert && (
            <View className="flex-row items-center gap-1 ml-3 mt-0.5">
              <TriangleAlert size={12} color="#dc2626" />
              <Text className="text-red-600 font-bold text-[10px]">
                ALLERGY: Dairy
              </Text>
            </View>
          )}
        </View>

        {config.groupByStation && (
          <>
            <DottedLine />
            <View className="bg-gray-200 -mx-5 px-5 py-0.5 mb-2">
              <Text className="text-center font-bold text-xs uppercase tracking-wider text-black">
                SALAD STATION
              </Text>
            </View>
          </>
        )}

        {/* Item 2: Caesar Salad */}
        <View>
          <Text className={itemTextClass}>1x Caesar Salad</Text>
          {config.showItemModifiers && (
            <Text className={modTextClass}>+ Grilled Chicken</Text>
          )}
        </View>
      </View>

      <DoubleLine />

      <Text className="text-zinc-500 text-center text-[10px]">
        2 items total
      </Text>
    </ReceiptPaper>
  );
}

// ============================================================================
// MAIN SCREEN
// ============================================================================

const ReceiptTemplatesScreen = () => {
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const organizationLogoUrl = useStoreSettingsStore(
    (s) => s.organizationLogoUrl,
  );
  const storeName = selectedStore?.name ?? "My Store";
  const locationId = selectedStore?.id ?? "";
  const merchantId = selectedStore?.merchant_id ?? "";

  const templates = useReceiptTemplateStore((s) => s.templates);
  const isSaving = useReceiptTemplateStore((s) => s.isSaving);
  const saveTemplate = useReceiptTemplateStore((s) => s.saveTemplate);
  const cacheLogoBase64 = useReceiptTemplateStore((s) => s.cacheLogoBase64);

  const [activeTab, setActiveTab] = useState<TabType>("receipt");

  // Get the stored template for the active tab
  const storedTemplate = useMemo(() => {
    const match = templates.find(
      (t) => t.locationId === locationId && t.templateType === activeTab,
    );
    return match ?? { ...DEFAULT_RECEIPT_TEMPLATE, templateType: activeTab };
  }, [templates, locationId, activeTab]);

  // Local draft
  const [localConfig, setLocalConfig] =
    useState<ReceiptTemplateConfig>(storedTemplate);

  // Reset local config when tab changes or stored template changes
  useEffect(() => {
    setLocalConfig(storedTemplate);
  }, [storedTemplate]);

  // Cache logo on mount if available
  useEffect(() => {
    if (organizationLogoUrl) {
      cacheLogoBase64(organizationLogoUrl);
    }
  }, [organizationLogoUrl, cacheLogoBase64]);

  const hasChanges = useMemo(() => {
    return JSON.stringify(localConfig) !== JSON.stringify(storedTemplate);
  }, [localConfig, storedTemplate]);

  const updateField = useCallback(
    <K extends keyof ReceiptTemplateConfig>(
      key: K,
      value: ReceiptTemplateConfig[K],
    ) => {
      setLocalConfig((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!locationId || !merchantId) {
      toastService.show({
        title: "Error",
        message: "No store selected",
        type: "error",
      });
      return;
    }

    const result = await saveTemplate(localConfig, merchantId, locationId);
    if (result.success) {
      toastService.show({
        title: "Saved",
        message: "Receipt template saved successfully",
        type: "success",
      });
    } else {
      toastService.show({
        title: "Error",
        message: result.error ?? "Failed to save template",
        type: "error",
      });
    }
  }, [localConfig, merchantId, locationId, saveTemplate]);

  return (
    <View className="flex-1 bg-panel">
      {/* Tab Bar */}
      <View className="flex-row px-4 pt-4 pb-2">
        <TouchableOpacity
          onPress={() => setActiveTab("receipt")}
          className={`px-5 py-2.5 rounded-lg mr-2 ${
            activeTab === "receipt" ? "bg-blue-600" : "bg-surface"
          }`}
        >
          <Text
            className={`text-sm font-medium ${
              activeTab === "receipt" ? "text-white" : "text-gray-400"
            }`}
          >
            Sale Receipt
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab("kitchen")}
          className={`px-5 py-2.5 rounded-lg ${
            activeTab === "kitchen" ? "bg-blue-600" : "bg-surface"
          }`}
        >
          <Text
            className={`text-sm font-medium ${
              activeTab === "kitchen" ? "text-white" : "text-gray-400"
            }`}
          >
            Kitchen Ticket
          </Text>
        </TouchableOpacity>
      </View>

      {/* Main Content: Preview + Settings side by side */}
      <View className="flex-1 flex-row px-4 pb-4 gap-4">
        {/* Preview Panel */}
        <View className="flex-[4] bg-card rounded-xl p-4">
          <Text className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3 px-1">
            Preview
          </Text>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 20 }}
          >
            {activeTab === "receipt" ? (
              <ReceiptPreview config={localConfig} storeName={storeName} />
            ) : (
              <KitchenPreview config={localConfig} storeName={storeName} />
            )}
          </ScrollView>
        </View>

        {/* Settings Panel */}
        <View className="flex-[6] bg-card rounded-xl p-4">
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 20 }}
          >
            {activeTab === "receipt" ? (
              <ReceiptSettings config={localConfig} updateField={updateField} />
            ) : (
              <KitchenSettings config={localConfig} updateField={updateField} />
            )}
          </ScrollView>

          {/* Save Button */}
          <View className="pt-3 border-t border-gray-700">
            <TouchableOpacity
              onPress={handleSave}
              disabled={!hasChanges || isSaving}
              className={`py-3 rounded-lg items-center ${
                hasChanges && !isSaving ? "bg-blue-600" : "bg-gray-600"
              }`}
            >
              {isSaving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text className="text-white font-semibold text-sm">
                  {hasChanges ? "Save Changes" : "No Changes"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
};

// ============================================================================
// RECEIPT SETTINGS
// ============================================================================

function ReceiptSettings({
  config,
  updateField,
}: {
  config: ReceiptTemplateConfig;
  updateField: <K extends keyof ReceiptTemplateConfig>(
    key: K,
    value: ReceiptTemplateConfig[K],
  ) => void;
}) {
  return (
    <>
      <SectionHeader title="Branding" />
      <ToggleRow
        label="Show Logo"
        value={config.showLogo}
        onToggle={(v) => updateField("showLogo", v)}
      />
      <TextRow
        label="Header Text"
        value={config.headerText ?? ""}
        onChangeText={(v) => updateField("headerText", v || null)}
        placeholder="Welcome message..."
      />
      <TextRow
        label="Footer Text"
        value={config.footerText ?? ""}
        onChangeText={(v) => updateField("footerText", v || null)}
        placeholder="Thank you message..."
      />

      <SectionHeader title="Content" />
      <ToggleRow
        label="Show Item Modifiers"
        value={config.showItemModifiers}
        onToggle={(v) => updateField("showItemModifiers", v)}
      />
      <ToggleRow
        label="Show Tax Breakdown"
        value={config.showTaxBreakdown}
        onToggle={(v) => updateField("showTaxBreakdown", v)}
      />
      <ToggleRow
        label="Show Tip Line"
        value={config.showTipLine}
        onToggle={(v) => updateField("showTipLine", v)}
      />
      <ToggleRow
        label="Show Server Name"
        value={config.showServerName}
        onToggle={(v) => updateField("showServerName", v)}
      />
      <ToggleRow
        label="Show Order Type"
        value={config.showOrderType}
        onToggle={(v) => updateField("showOrderType", v)}
      />

      <SectionHeader title="Extras" />
      <ToggleRow
        label="Show Barcode"
        value={config.showBarcode}
        onToggle={(v) => updateField("showBarcode", v)}
      />
      <ToggleRow
        label="Show QR Code"
        value={config.showQrCode}
        onToggle={(v) => updateField("showQrCode", v)}
      />
    </>
  );
}

// ============================================================================
// KITCHEN SETTINGS
// ============================================================================

function KitchenSettings({
  config,
  updateField,
}: {
  config: ReceiptTemplateConfig;
  updateField: <K extends keyof ReceiptTemplateConfig>(
    key: K,
    value: ReceiptTemplateConfig[K],
  ) => void;
}) {
  return (
    <>
      <SectionHeader title="Content" />
      <ToggleRow
        label="Show Item Modifiers"
        value={config.showItemModifiers}
        onToggle={(v) => updateField("showItemModifiers", v)}
      />
      <ToggleRow
        label="Show Server Name"
        value={config.showServerName}
        onToggle={(v) => updateField("showServerName", v)}
      />
      <ToggleRow
        label="Show Order Type"
        value={config.showOrderType}
        onToggle={(v) => updateField("showOrderType", v)}
      />

      <SectionHeader title="Kitchen" />
      <ToggleRow
        label="Large Item Text"
        value={config.largeItemText}
        onToggle={(v) => updateField("largeItemText", v)}
      />
      <ToggleRow
        label="Large Modifier Text"
        value={config.showModsLarge}
        onToggle={(v) => updateField("showModsLarge", v)}
      />
      <ToggleRow
        label="Group by Station"
        value={config.groupByStation}
        onToggle={(v) => updateField("groupByStation", v)}
      />
      <ToggleRow
        label="Show Allergy Alerts"
        value={config.showAllergyAlert}
        onToggle={(v) => updateField("showAllergyAlert", v)}
      />
      <ToggleRow
        label="Show Ready-By Time"
        value={config.showReadyByTime}
        onToggle={(v) => updateField("showReadyByTime", v)}
      />
    </>
  );
}

export default ReceiptTemplatesScreen;
