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
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  GripVertical,
  Layers,
  Printer,
  QrCode,
  TriangleAlert,
  X,
} from "lucide-react-native";
import { colors } from "@/lib/theme";
import { TestPrintModal } from "@/components/settings/TestPrintModal";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from "react-native-draggable-flatlist";

// ============================================================================
// TYPES
// ============================================================================

type TabType = "receipt" | "kitchen";

export type ReceiptSectionId =
  | "logo"
  | "storeInfo"
  | "orderInfo"
  | "items"
  | "totals"
  | "tipLine"
  | "payment"
  | "footer"
  | "barcode";

export interface ReceiptSection {
  id: ReceiptSectionId;
  label: string;
}

const DEFAULT_RECEIPT_SECTION_ORDER: ReceiptSectionId[] = [
  "logo",
  "storeInfo",
  "orderInfo",
  "items",
  "totals",
  "tipLine",
  "payment",
  "footer",
  "barcode",
];

const RECEIPT_SECTION_LABELS: Record<ReceiptSectionId, string> = {
  logo: "Logo",
  storeInfo: "Store Info",
  orderInfo: "Order Info",
  items: "Items",
  totals: "Totals",
  tipLine: "Tip Line",
  payment: "Payment",
  footer: "Footer",
  barcode: "Barcode / QR",
};

// ============================================================================
// PRESET TEMPLATES
// ============================================================================

interface PresetDefinition {
  id: string;
  label: string;
  description: string;
  overrides: Partial<ReceiptTemplateConfig>;
}

const RECEIPT_PRESETS: PresetDefinition[] = [
  {
    id: "minimal",
    label: "Minimal",
    description: "Clean and simple — just the essentials.",
    overrides: {
      showLogo: false,
      showBarcode: false,
      showQrCode: false,
      showTipLine: false,
      showTaxBreakdown: false,
      showItemModifiers: false,
      showServerName: false,
      headerText: null,
      footerText: null,
    },
  },
  {
    id: "standard",
    label: "Standard",
    description: "Balanced layout suitable for most restaurants.",
    overrides: {
      showLogo: true,
      showBarcode: false,
      showQrCode: false,
      showTipLine: true,
      showTaxBreakdown: true,
      showItemModifiers: true,
      showServerName: true,
      showOrderType: true,
    },
  },
  {
    id: "full",
    label: "Full Detail",
    description: "Everything visible — max information for customers.",
    overrides: {
      showLogo: true,
      showBarcode: true,
      showQrCode: true,
      showTipLine: true,
      showTaxBreakdown: true,
      showItemModifiers: true,
      showServerName: true,
      showOrderType: true,
    },
  },
  {
    id: "retail",
    label: "Retail / Quick Service",
    description: "No tip line, no server — fast and focused.",
    overrides: {
      showLogo: true,
      showBarcode: true,
      showQrCode: false,
      showTipLine: false,
      showTaxBreakdown: true,
      showItemModifiers: false,
      showServerName: false,
      showOrderType: false,
    },
  },
];

const KITCHEN_PRESETS: PresetDefinition[] = [
  {
    id: "compact",
    label: "Compact",
    description: "Item names only — no mods, no extras. Fast reads.",
    overrides: {
      largeItemText: false,
      showModsLarge: false,
      showItemModifiers: false,
      showServerName: false,
      showOrderType: false,
      groupByStation: false,
      groupBySeat: false,
      showAllergyAlert: true,
      showReadyByTime: false,
    },
  },
  {
    id: "standard_kitchen",
    label: "Standard Kitchen",
    description: "Balanced — mods on, station grouping, allergy alerts.",
    overrides: {
      largeItemText: false,
      showModsLarge: false,
      showItemModifiers: true,
      showServerName: true,
      showOrderType: true,
      groupByStation: true,
      groupBySeat: false,
      showAllergyAlert: true,
      showReadyByTime: false,
    },
  },
  {
    id: "large_text",
    label: "Large Text",
    description: "Big bold items and mods — ideal for noisy, fast-paced kitchens.",
    overrides: {
      largeItemText: true,
      showModsLarge: true,
      showItemModifiers: true,
      showServerName: false,
      showOrderType: true,
      groupByStation: true,
      groupBySeat: false,
      showAllergyAlert: true,
      showReadyByTime: true,
    },
  },
  {
    id: "fine_dining",
    label: "Fine Dining",
    description: "Seat-by-seat view — perfect for plated service.",
    overrides: {
      largeItemText: false,
      showModsLarge: false,
      showItemModifiers: true,
      showServerName: true,
      showOrderType: false,
      groupByStation: false,
      groupBySeat: true,
      showAllergyAlert: true,
      showReadyByTime: true,
    },
  },
];

// ============================================================================
// SMALL COMPONENTS
// ============================================================================

function CollapsibleSection({
  title,
  subtitle,
  defaultOpen = true,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View className="mb-2">
      <TouchableOpacity
        onPress={() => setOpen((v) => !v)}
        className="flex-row items-center justify-between py-2.5 px-1 mt-3"
      >
        <View className="flex-1">
          <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {title}
          </Text>
          {subtitle && !open ? (
            <Text className="text-gray-600 text-xs mt-0.5">{subtitle}</Text>
          ) : null}
        </View>
        {open
          ? <ChevronDown size={14} color={colors.muted} />
          : <ChevronRight size={14} color={colors.muted} />}
      </TouchableOpacity>
      {open && <View>{children}</View>}
    </View>
  );
}

function ToggleRow({
  label,
  subtitle,
  value,
  onToggle,
}: {
  label: string;
  subtitle?: string;
  value: boolean;
  onToggle: (val: boolean) => void;
}) {
  return (
    <TouchableOpacity
      onPress={() => onToggle(!value)}
      className={`flex-row items-center justify-between py-3 px-3 rounded-lg mb-1.5 border ${
        value ? "bg-blue-600/10 border-blue-500/30" : "bg-surface border-gray-700"
      }`}
    >
      <View className="flex-1 mr-3">
        <Text className="text-white text-sm">{label}</Text>
        {subtitle ? <Text className="text-gray-500 text-xs mt-0.5">{subtitle}</Text> : null}
      </View>
      <Switch checked={value} onCheckedChange={onToggle} />
    </TouchableOpacity>
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
        className="bg-surface text-white text-sm px-3 py-2.5 rounded-lg border border-gray-700"
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? label}
        placeholderTextColor={colors.muted}
      />
    </View>
  );
}

// ============================================================================
// PRESET PICKER MODAL
// ============================================================================

function PresetPickerModal({
  visible,
  presets,
  onApply,
  onClose,
}: {
  visible: boolean;
  presets: PresetDefinition[];
  onApply: (overrides: Partial<ReceiptTemplateConfig>) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        className="flex-1 bg-black/60 items-center justify-center px-8"
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity activeOpacity={1} className="w-full bg-panel rounded-2xl border border-gray-700 overflow-hidden">
          {/* Header */}
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-700">
            <View className="flex-row items-center gap-2">
              <Layers size={16} color={colors.info} />
              <Text className="text-white font-bold text-base">Choose a Preset</Text>
            </View>
            <TouchableOpacity onPress={onClose} className="p-1">
              <X size={18} color={colors.muted} />
            </TouchableOpacity>
          </View>
          {/* Presets */}
          <View className="p-4 gap-2">
            {presets.map((preset) => (
              <TouchableOpacity
                key={preset.id}
                onPress={() => { onApply(preset.overrides); onClose(); }}
                className="flex-row items-center bg-surface rounded-xl border border-gray-700 px-4 py-3"
              >
                <View className="flex-1">
                  <Text className="text-white font-semibold text-sm">{preset.label}</Text>
                  <Text className="text-gray-500 text-xs mt-0.5">{preset.description}</Text>
                </View>
                <ChevronRight size={16} color={colors.info} />
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ============================================================================
// COPY FROM LOCATION MODAL
// ============================================================================

function CopyFromLocationModal({
  visible,
  currentLocationId,
  templateType,
  onApply,
  onClose,
}: {
  visible: boolean;
  currentLocationId: string;
  templateType: string;
  onApply: (config: ReceiptTemplateConfig) => void;
  onClose: () => void;
}) {
  const templates = useReceiptTemplateStore((s) => s.templates);

  // Find templates from other locations that match the template type
  const otherTemplates = templates.filter(
    (t) => t.locationId !== currentLocationId && t.templateType === templateType,
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        className="flex-1 bg-black/60 items-center justify-center px-8"
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity activeOpacity={1} className="w-full bg-panel rounded-2xl border border-gray-700 overflow-hidden">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-700">
            <View className="flex-row items-center gap-2">
              <Copy size={16} color={colors.info} />
              <Text className="text-white font-bold text-base">Copy from Location</Text>
            </View>
            <TouchableOpacity onPress={onClose} className="p-1">
              <X size={18} color={colors.muted} />
            </TouchableOpacity>
          </View>
          <View className="p-4 gap-2">
            {otherTemplates.length === 0 ? (
              <View className="py-6 items-center">
                <Text className="text-gray-500 text-sm text-center">
                  No templates from other locations found.
                </Text>
                <Text className="text-gray-600 text-xs text-center mt-1">
                  Templates are saved per location when you hit Save.
                </Text>
              </View>
            ) : (
              otherTemplates.map((tmpl) => (
                <TouchableOpacity
                  key={tmpl.id}
                  onPress={() => { onApply(tmpl); onClose(); }}
                  className="flex-row items-center bg-surface rounded-xl border border-gray-700 px-4 py-3"
                >
                  <View className="flex-1">
                    <Text className="text-white font-semibold text-sm">
                      {tmpl.templateName || tmpl.locationId || "Unknown location"}
                    </Text>
                    <Text className="text-gray-500 text-xs mt-0.5 capitalize">
                      {tmpl.templateType} template
                    </Text>
                  </View>
                  <Check size={16} color={colors.success} />
                </TouchableOpacity>
              ))
            )}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
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
// RECEIPT PREVIEW (draggable sections)
// ============================================================================

function renderReceiptSection(
  sectionId: ReceiptSectionId,
  config: ReceiptTemplateConfig,
  storeName: string,
): React.ReactNode {
  switch (sectionId) {
    case "logo":
      return config.showLogo ? (
        <View className="items-center mb-2">
          <View className="w-10 h-10 bg-gray-300 rounded" />
        </View>
      ) : null;
    case "storeInfo":
      return (
        <View>
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
        </View>
      );
    case "orderInfo":
      return (
        <View>
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
        </View>
      );
    case "items":
      return (
        <View>
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
        </View>
      );
    case "totals":
      return (
        <View>
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
        </View>
      );
    case "tipLine":
      return config.showTipLine ? (
        <View>
          <DottedLine />
          <View className="flex-row justify-between">
            <Text className="text-black text-xs">Tip:</Text>
            <Text className="text-black text-xs">________</Text>
          </View>
          <View className="flex-row justify-between mt-1">
            <Text className="text-black text-xs font-bold">Total w/ Tip:</Text>
            <Text className="text-black text-xs font-bold">________</Text>
          </View>
        </View>
      ) : null;
    case "payment":
      return (
        <View>
          <DottedLine />
          <View className="flex-row justify-between">
            <Text className="text-black text-xs">Paid: Card</Text>
            <Text className="text-black text-xs">$30.82</Text>
          </View>
          <Text className="text-zinc-500 text-[10px]">
            Visa ending in 4242
          </Text>
        </View>
      );
    case "footer":
      return config.footerText ? (
        <View>
          <DottedLine />
          <Text className="text-black text-center text-[10px]">
            {config.footerText}
          </Text>
        </View>
      ) : null;
    case "barcode":
      return (config.showBarcode || config.showQrCode) ? (
        <View className="flex-row justify-center items-center gap-3 mt-3">
          {config.showBarcode && (
            <Barcode size={32} color="#a1a1aa" strokeWidth={1.5} />
          )}
          {config.showQrCode && (
            <QrCode size={32} color="#a1a1aa" strokeWidth={1.5} />
          )}
        </View>
      ) : null;
    default:
      return null;
  }
}

function ReceiptPreview({
  config,
  storeName,
  sectionOrder,
  onReorder,
}: {
  config: ReceiptTemplateConfig;
  storeName: string;
  sectionOrder: ReceiptSectionId[];
  onReorder: (newOrder: ReceiptSectionId[]) => void;
}) {
  const sections: ReceiptSection[] = sectionOrder.map((id) => ({
    id,
    label: RECEIPT_SECTION_LABELS[id],
  }));

  const renderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<ReceiptSection>) => {
      const content = renderReceiptSection(item.id, config, storeName);
      return (
        <ScaleDecorator>
          <TouchableOpacity
            onLongPress={drag}
            disabled={isActive}
            activeOpacity={1}
            className={`relative ${isActive ? "opacity-80" : ""}`}
          >
            {/* Drag handle label — only visible on hover/press */}
            <View
              style={{
                position: "absolute",
                right: -28,
                top: 2,
                zIndex: 10,
              }}
            >
              <GripVertical size={14} color="#9ca3af" />
            </View>
            {content !== null ? (
              <View>{content}</View>
            ) : (
              <View className="py-1 px-2 my-0.5 rounded border border-dashed border-gray-200">
                <Text className="text-gray-300 text-[9px] text-center">
                  {item.label} (hidden)
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </ScaleDecorator>
      );
    },
    [config, storeName],
  );

  return (
    <ReceiptPaper>
      <DraggableFlatList
        data={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        onDragEnd={({ data }) => onReorder(data.map((s) => s.id))}
        scrollEnabled={false}
      />
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
    ? "text-black text-base font-bold"
    : "text-black text-xs font-bold";
  const modTextClass = config.showModsLarge
    ? "text-zinc-600 text-sm ml-3"
    : "text-zinc-500 text-[10px] ml-3";

  // Sample data used for the preview
  const grillItems = [
    {
      qty: 2,
      name: "Cheeseburger",
      mods: ["+ Extra Cheese", "- No Onions"],
      allergy: "Dairy",
      seat: 1,
    },
    { qty: 1, name: "Veggie Wrap", mods: ["+ Avocado"], allergy: null, seat: 3 },
  ];
  const saladItems = [
    { qty: 1, name: "Caesar Salad", mods: ["+ Grilled Chicken"], allergy: null, seat: 2 },
  ];

  const renderItem = (
    item: { qty: number; name: string; mods: string[]; allergy: string | null; seat: number },
    idx: number,
  ) => (
    <View key={idx} className={idx > 0 ? "mt-2" : ""}>
      <View className="flex-row items-baseline gap-1">
        {config.groupBySeat && (
          <Text className="text-zinc-400 text-[9px] font-semibold mr-0.5">
            S{item.seat}
          </Text>
        )}
        <Text className={itemTextClass}>
          {item.qty}x {item.name}
        </Text>
      </View>
      {config.showItemModifiers && item.mods.map((m, i) => (
        <Text key={i} className={modTextClass}>{m}</Text>
      ))}
      {config.showAllergyAlert && item.allergy && (
        <View className="flex-row items-center gap-1 ml-3 mt-0.5">
          <TriangleAlert size={10} color="#dc2626" />
          <Text className="text-red-600 font-bold text-[9px]">
            ALLERGY: {item.allergy}
          </Text>
        </View>
      )}
    </View>
  );

  const StationBanner = ({ label }: { label: string }) => (
    <View className="bg-gray-200 -mx-4 px-4 py-0.5 mb-1.5">
      <Text className="text-center font-black text-[10px] uppercase tracking-widest text-black">
        ▶ {label}
      </Text>
    </View>
  );

  return (
    <ReceiptPaper>
      {/* Order header */}
      <Text className="text-black text-center font-black text-base tracking-wide">
        ORDER #1042
      </Text>
      {config.showOrderType && (
        <Text className="text-black text-center font-bold text-[10px] uppercase tracking-wide mt-0.5">
          Dine In — Table 5
        </Text>
      )}
      {config.showServerName && (
        <Text className="text-zinc-500 text-center text-[10px] mt-0.5">
          Server: Sarah M.
        </Text>
      )}
      <Text className="text-zinc-400 text-center text-[9px]">
        01/15/2026  12:34 PM
      </Text>

      {/* Ready by badge */}
      {config.showReadyByTime && (
        <View className="flex-row items-center justify-center gap-1 mt-1.5 bg-black rounded px-2 py-0.5">
          <Clock size={9} color="#fff" />
          <Text className="text-white text-[10px] font-bold">
            Ready by: 12:49 PM
          </Text>
        </View>
      )}

      <DoubleLine />

      {/* Items — with optional station grouping */}
      {config.groupByStation ? (
        <View className="gap-0">
          <StationBanner label="Grill" />
          <View className="gap-0 mb-2">
            {grillItems.map(renderItem)}
          </View>
          <DottedLine />
          <StationBanner label="Salad" />
          <View className="gap-0">
            {saladItems.map(renderItem)}
          </View>
        </View>
      ) : (
        <View className="gap-0">
          {[...grillItems, ...saladItems].map(renderItem)}
        </View>
      )}

      <DoubleLine />

      <Text className="text-zinc-400 text-center text-[9px]">
        3 items total
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
  const [showTestPrint, setShowTestPrint] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [showCopyFrom, setShowCopyFrom] = useState(false);
  const [sectionOrder, setSectionOrder] = useState<ReceiptSectionId[]>(
    DEFAULT_RECEIPT_SECTION_ORDER,
  );

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

  const applyPreset = useCallback((overrides: Partial<ReceiptTemplateConfig>) => {
    setLocalConfig((prev) => ({ ...prev, ...overrides }));
    toastService.show({ title: "Preset applied", message: "Review and save when ready.", type: "info" });
  }, []);

  const applyFromLocation = useCallback((config: ReceiptTemplateConfig) => {
    setLocalConfig((prev) => ({
      ...config,
      id: prev.id,
      merchantId: prev.merchantId,
      locationId: prev.locationId,
      templateType: prev.templateType,
    }));
    toastService.show({ title: "Copied", message: "Settings copied. Save to apply.", type: "info" });
  }, []);

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
          onPress={() => { setActiveTab("receipt"); setSectionOrder(DEFAULT_RECEIPT_SECTION_ORDER); }}
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
          <View className="flex-row items-center justify-between mb-3 px-1">
            <Text className="text-gray-400 text-xs font-semibold uppercase tracking-wider">
              Live Preview
            </Text>
            {activeTab === "receipt" ? (
              <Text className="text-gray-600 text-[10px]">
                Long-press to reorder sections
              </Text>
            ) : (
              <Text className="text-gray-600 text-[10px]">
                Updates as you change settings
              </Text>
            )}
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 20 }}
          >
            {activeTab === "receipt" ? (
              <ReceiptPreview
                config={localConfig}
                storeName={storeName}
                sectionOrder={sectionOrder}
                onReorder={setSectionOrder}
              />
            ) : (
              <KitchenPreview config={localConfig} storeName={storeName} />
            )}
          </ScrollView>
        </View>

        {/* Settings Panel */}
        <View className="flex-[6] bg-card rounded-xl p-4">
          {/* Toolbar: Presets + Copy */}
          <View className="flex-row items-center gap-2 mb-3 pb-3 border-b border-gray-700">
            <Text className="text-white font-semibold text-sm flex-1">Settings</Text>
            <TouchableOpacity
              onPress={() => setShowCopyFrom(true)}
              className="flex-row items-center gap-1.5 px-3 py-1.5 bg-surface rounded-lg border border-gray-600"
            >
              <Copy size={13} color={colors.muted} />
              <Text className="text-gray-400 text-xs font-medium">Copy from…</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowPresets(true)}
              className="flex-row items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 rounded-lg border border-blue-500/40"
            >
              <Layers size={13} color={colors.info} />
              <Text className="text-blue-300 text-xs font-medium">Presets</Text>
            </TouchableOpacity>
          </View>

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

          {/* Save + Test Print Buttons */}
          <View className="pt-3 border-t border-gray-700 flex-row gap-2">
            <TouchableOpacity
              onPress={() => setShowTestPrint(true)}
              className="flex-row items-center justify-center px-4 py-3 rounded-lg bg-surface border border-gray-600"
            >
              <Printer size={16} color={colors.info} />
              <Text className="text-blue-400 font-semibold text-sm ml-1.5">Test Print</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSave}
              disabled={!hasChanges || isSaving}
              className={`flex-1 py-3 rounded-lg items-center ${
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

      <TestPrintModal
        visible={showTestPrint}
        onClose={() => setShowTestPrint(false)}
        initialPrintType={activeTab === "kitchen" ? "kitchen" : "receipt"}
      />

      <PresetPickerModal
        visible={showPresets}
        presets={activeTab === "receipt" ? RECEIPT_PRESETS : KITCHEN_PRESETS}
        onApply={applyPreset}
        onClose={() => setShowPresets(false)}
      />

      <CopyFromLocationModal
        visible={showCopyFrom}
        currentLocationId={locationId}
        templateType={activeTab}
        onApply={applyFromLocation}
        onClose={() => setShowCopyFrom(false)}
      />
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
      <CollapsibleSection title="Branding" subtitle="Logo, header, and footer text" defaultOpen>
        <ToggleRow
          label="Show Logo"
          subtitle="Display your business logo at the top"
          value={config.showLogo}
          onToggle={(v) => updateField("showLogo", v)}
        />
        <TextRow
          label="Header Text"
          value={config.headerText ?? ""}
          onChangeText={(v) => updateField("headerText", v || null)}
          placeholder="e.g. Welcome to Our Restaurant!"
        />
        <TextRow
          label="Footer Text"
          value={config.footerText ?? ""}
          onChangeText={(v) => updateField("footerText", v || null)}
          placeholder="e.g. Thank you, see you again!"
        />
      </CollapsibleSection>

      <CollapsibleSection title="Content" subtitle="What information prints on the receipt" defaultOpen>
        <ToggleRow
          label="Show Item Modifiers"
          subtitle="Print add-ons and customizations under each item"
          value={config.showItemModifiers}
          onToggle={(v) => updateField("showItemModifiers", v)}
        />
        <ToggleRow
          label="Show Tax Breakdown"
          subtitle="Print tax rate and amount as a separate line"
          value={config.showTaxBreakdown}
          onToggle={(v) => updateField("showTaxBreakdown", v)}
        />
        <ToggleRow
          label="Show Tip Line"
          subtitle="Add a blank tip line for card transactions"
          value={config.showTipLine}
          onToggle={(v) => updateField("showTipLine", v)}
        />
        <ToggleRow
          label="Show Server Name"
          subtitle="Print the name of the staff member who took the order"
          value={config.showServerName}
          onToggle={(v) => updateField("showServerName", v)}
        />
        <ToggleRow
          label="Show Order Type"
          subtitle="Print Dine In / Takeaway / Delivery"
          value={config.showOrderType}
          onToggle={(v) => updateField("showOrderType", v)}
        />
      </CollapsibleSection>

      <CollapsibleSection title="Extras" subtitle="Barcodes and QR codes" defaultOpen={false}>
        <ToggleRow
          label="Show Barcode"
          subtitle="Print an order barcode at the bottom"
          value={config.showBarcode}
          onToggle={(v) => updateField("showBarcode", v)}
        />
        <ToggleRow
          label="Show QR Code"
          subtitle="Print a QR code (e.g. for digital menu or feedback)"
          value={config.showQrCode}
          onToggle={(v) => updateField("showQrCode", v)}
        />
      </CollapsibleSection>
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
      {/* ── Header Info ─────────────────────────────────────────── */}
      <CollapsibleSection
        title="Header"
        subtitle="Order number, table, server, timing"
        defaultOpen
      >
        <ToggleRow
          label="Show Order Type"
          subtitle="Print Dine In / Takeaway / Delivery at the top"
          value={config.showOrderType}
          onToggle={(v) => updateField("showOrderType", v)}
        />
        <ToggleRow
          label="Show Server Name"
          subtitle="Print the staff member who placed the order"
          value={config.showServerName}
          onToggle={(v) => updateField("showServerName", v)}
        />
        <ToggleRow
          label="Show Ready-By Time"
          subtitle="Print the target ready time — useful for timed pickup orders"
          value={config.showReadyByTime}
          onToggle={(v) => updateField("showReadyByTime", v)}
        />
      </CollapsibleSection>

      {/* ── Items & Modifiers ────────────────────────────────────── */}
      <CollapsibleSection
        title="Items & Modifiers"
        subtitle="What detail prints per line item"
        defaultOpen
      >
        <ToggleRow
          label="Show Modifiers"
          subtitle="Print add-ons and customizations under each item"
          value={config.showItemModifiers}
          onToggle={(v) => updateField("showItemModifiers", v)}
        />
        <ToggleRow
          label="Show Allergy Alerts"
          subtitle="Highlight allergy warnings in red — never miss a dietary flag"
          value={config.showAllergyAlert}
          onToggle={(v) => updateField("showAllergyAlert", v)}
        />
      </CollapsibleSection>

      {/* ── Readability ──────────────────────────────────────────── */}
      <CollapsibleSection
        title="Readability"
        subtitle="Text size — tune for your kitchen distance"
        defaultOpen
      >
        {/* Visual size preview strip */}
        <View className="bg-surface rounded-lg px-3 py-2.5 mb-2 border border-gray-700">
          <Text className="text-gray-500 text-[9px] uppercase tracking-wider mb-1.5">
            Preview
          </Text>
          <Text
            className={
              config.largeItemText
                ? "text-white text-base font-bold"
                : "text-white text-xs font-bold"
            }
          >
            2x Cheeseburger
          </Text>
          {config.showItemModifiers && (
            <Text
              className={
                config.showModsLarge
                  ? "text-gray-400 text-sm ml-3"
                  : "text-gray-400 text-[10px] ml-3"
              }
            >
              + Extra Cheese
            </Text>
          )}
        </View>
        <ToggleRow
          label="Large Item Text"
          subtitle="Bigger, bolder item names — ideal for noisy kitchens"
          value={config.largeItemText}
          onToggle={(v) => updateField("largeItemText", v)}
        />
        <ToggleRow
          label="Large Modifier Text"
          subtitle="Scale modifiers up to match large item text"
          value={config.showModsLarge}
          onToggle={(v) => updateField("showModsLarge", v)}
        />
      </CollapsibleSection>

      {/* ── Organisation ─────────────────────────────────────────── */}
      <CollapsibleSection
        title="Organisation"
        subtitle="Grouping by station or seat"
        defaultOpen={false}
      >
        <ToggleRow
          label="Group by Station"
          subtitle="Divide the ticket into sections per kitchen station (Grill, Salad…)"
          value={config.groupByStation}
          onToggle={(v) => updateField("groupByStation", v)}
        />
        <ToggleRow
          label="Group by Seat"
          subtitle="Label each item with its seat number for easy runner service"
          value={config.groupBySeat}
          onToggle={(v) => updateField("groupBySeat", v)}
        />
      </CollapsibleSection>
    </>
  );
}

export default ReceiptTemplatesScreen;
