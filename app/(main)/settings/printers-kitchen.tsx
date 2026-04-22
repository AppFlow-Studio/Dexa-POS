import {
  Minus,
  Plus,
  Printer,
  Settings2,
  Route,
} from "lucide-react-native";
import { colors } from "@/lib/theme";
import { PrinterRoutingModal } from "@/components/settings/PrinterRoutingModal";
import { useKDSStore } from "@/stores/useKDSStore";
import { usePrinterStore } from "@/stores/usePrinterStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useLocationConfigStore } from "@/stores/useLocationConfigStore";
import { useReceiptTemplateStore } from "@/stores/useReceiptTemplateStore";
import type { ModifierStyle } from "@/types/receipt-template";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import {
  type PrinterConfig,
} from "@/types/printer";
import React, { useEffect, useState } from "react";
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Switch } from "~/components/ui/switch";

// ---------------------------------------------------------------------------
// LOCAL TYPES
// ---------------------------------------------------------------------------

type PrinterTab = "receipt" | "order" | "kds";

interface ReceiptSettings {
  showLogo: boolean;
  showTaxBreakdown: boolean;
  showItemizedList: boolean;
  showTips: boolean;
  showBarcode: boolean;
  footerMessage: string;
}

interface KitchenTicketSettings {
  autoFire: boolean;
  autoFireDelay: number;
  showGuestCount: boolean;
  showModifiers: boolean;
  showCourseNumber: boolean;
  showServerName: boolean;
  largeFont: boolean;
  modifierStyle: ModifierStyle;
}

// ---------------------------------------------------------------------------
// SMALL COMPONENTS
// ---------------------------------------------------------------------------

function SectionHeader({ title, rightContent }: { title: string; rightContent?: React.ReactNode }) {
  return (
    <View style={{
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 16,
      marginBottom: 6,
      paddingHorizontal: 2,
    }}>
      <Text style={{
        fontSize: 11,
        fontWeight: "700",
        color: colors.muted,
        textTransform: "uppercase",
        letterSpacing: 0.6,
      }}>
        {title}
      </Text>
      {rightContent}
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
    <View style={{
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 10,
      paddingHorizontal: 12,
      backgroundColor: colors.card,
      borderRadius: 8,
      marginBottom: 4,
    }}>
      <View style={{ flex: 1, marginRight: 10 }}>
        <Text style={{ fontSize: 13, color: colors.heading, marginBottom: subtitle ? 2 : 0 }}>{label}</Text>
        {subtitle && (
          <Text style={{ fontSize: 11, color: colors.muted }}>{subtitle}</Text>
        )}
      </View>
      <Switch checked={value} onCheckedChange={onToggle} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// TAB CONFIG
// ---------------------------------------------------------------------------

const TABS: { key: PrinterTab; label: string }[] = [
  { key: "receipt", label: "Receipt Settings" },
  { key: "order", label: "Order Settings" },
  { key: "kds", label: "KDS & Routing" },
];

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------

const PrintersKitchenScreen = () => {
  const supabase = useSupabaseClient();

  // Tab state
  const [activeTab, setActiveTab] = useState<PrinterTab>("receipt");

  // KDS + Printing settings from unified config
  const kdsConfig = useLocationConfigStore((s) => s.config.kds);
  const printingConfig = useLocationConfigStore((s) => s.config.printing);
  const _updateConfig = useLocationConfigStore((s) => s.updateConfig);
  const kdsAutoFireEnabled = kdsConfig.autoFireEnabled;
  const kdsAutoFireDelayMinutes = kdsConfig.autoFireDelayMinutes;
  const autoPrintKitchenTickets = printingConfig.autoPrintKitchenTickets;
  const autoPrintReceipt = printingConfig.autoPrintReceipt;
  const printMerchantCopy = printingConfig.printMerchantCopy;
  const printCustomerCopy = printingConfig.printCustomerCopy;
  const printVoidTickets = printingConfig.printVoidTickets;
  const printRefundTickets = printingConfig.printRefundTickets ?? true;
  // Shim for existing updateField calls
  const updateField = (field: string, value: any) => {
    const KDS_MAP: Record<string, string> = {
      kdsAutoFireEnabled: 'autoFireEnabled',
      kdsAutoFireDelayMinutes: 'autoFireDelayMinutes',
      kdsDisplayModifierGroupName: 'displayModifierGroupName',
      kdsItemNameLines: 'itemNameLines',
      kdsDisplaySeatNumbers: 'displaySeatNumbers',
      kdsDisplayGuestCount: 'displayGuestCount',
      kdsAlphabeticalSort: 'alphabeticalSort',
      kdsHighlightNotes: 'highlightNotes',
      kdsDisplayExclusionsAtTop: 'displayExclusionsAtTop',
      kdsAggregateIdenticalItems: 'aggregateIdenticalItems',
      kdsHideDoneItems: 'hideDoneItems',
      kdsAggregateToExistingTickets: 'aggregateToExistingTickets',
      kdsYellowThresholdMinutes: 'yellowThresholdMinutes',
      kdsOrangeThresholdMinutes: 'orangeThresholdMinutes',
      kdsRedThresholdMinutes: 'redThresholdMinutes',
      newOrderPosition: 'newOrderPosition',
    };
    const PRINT_MAP: Record<string, string> = {
      autoPrintKitchenTickets: 'autoPrintKitchenTickets',
      autoPrintReceipt: 'autoPrintReceipt',
    };
    if (KDS_MAP[field]) _updateConfig('kds', { [KDS_MAP[field]]: value });
    else if (PRINT_MAP[field]) _updateConfig('printing', { [PRINT_MAP[field]]: value });
  };

  // Location
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);

  // Receipt template store
  const fetchTemplates = useReceiptTemplateStore((s) => s.fetchTemplates);
  const getKitchenTemplate = useReceiptTemplateStore((s) => s.getKitchenTemplate);
  const updateTemplate = useReceiptTemplateStore((s) => s.updateTemplate);
  const saveTemplate = useReceiptTemplateStore((s) => s.saveTemplate);

  // Printer store (for KDS routing section)
  const storedPrinters = usePrinterStore((s) => s.printers);
  const fetchPrinters = usePrinterStore((s) => s.fetchPrinters);
  const routingConfigs = usePrinterStore((s) => s.routingConfigs);

  // Throttling & KDS store
  const { throttling, setThrottling } = useSettingsStore();
  const kdsCount = useKDSStore((s) => s.counts);

  // Routing modal state
  const [routingModalPrinter, setRoutingModalPrinter] = useState<PrinterConfig | null>(null);

  // Fetch printers on mount (needed for KDS routing section)
  useEffect(() => {
    if (selectedStore?.id) {
      fetchPrinters(selectedStore.id);
    }
  }, [selectedStore?.id]);

  // Load kitchen template from DB and sync to local state
  useEffect(() => {
    if (!selectedStore?.id) return;
    fetchTemplates(selectedStore.id).then(() => {
      const tpl = getKitchenTemplate(selectedStore.id);
      setKitchenSettings((prev) => ({
        ...prev,
        showModifiers: tpl.showItemModifiers,
        showServerName: tpl.showServerName,
        largeFont: tpl.largeItemText,
        modifierStyle: tpl.modifierStyle,
      }));
    });
  }, [selectedStore?.id]);

  // Helper to update a kitchen template field and persist
  const updateKitchenTemplateField = (updates: Record<string, any>) => {
    if (!selectedStore?.id) return;
    const tpl = getKitchenTemplate(selectedStore.id);
    updateTemplate(tpl.id, updates);
    const updatedTpl = { ...tpl, ...updates };
    saveTemplate(updatedTpl, selectedStore.merchant_id, selectedStore.id);
  };

  // Derived: kitchen printers for routing section in KDS tab
  const kitchenPrinters = storedPrinters.filter(
    (p) => p.isActive && (p.printerRole === "kitchen" || p.printerRole === "bar" || p.isDefaultKitchen),
  );

  // Receipt settings state
  const [receiptSettings, setReceiptSettings] = useState<ReceiptSettings>({
    showLogo: true,
    showTaxBreakdown: true,
    showItemizedList: true,
    showTips: true,
    showBarcode: true,
    footerMessage: "Thank you for dining with us!",
  });

  // Kitchen ticket settings state
  const [kitchenSettings, setKitchenSettings] = useState<KitchenTicketSettings>({
    autoFire: true,
    autoFireDelay: 0,
    showGuestCount: true,
    showModifiers: true,
    showCourseNumber: false,
    showServerName: true,
    largeFont: false,
    modifierStyle: "inverted",
  });

  // ---------------------------------------------------------------------------
  // MAIN RENDER
  // ---------------------------------------------------------------------------

  return (
    <View style={{ flex: 1, backgroundColor: colors.panel }}>
      {/* Tab Bar — underline style */}
      <View style={{
        flexDirection: "row",
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 0,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 10,
                marginRight: 2,
                borderBottomWidth: 2,
                borderBottomColor: isActive ? colors.teal : "transparent",
              }}
            >
              <Text style={{
                fontSize: 12,
                fontWeight: "700",
                color: isActive ? colors.teal : colors.label,
              }}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Tab Content */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ============================================================== */}
        {/* RECEIPT SETTINGS TAB                                            */}
        {/* ============================================================== */}
        {activeTab === "receipt" && (
          <View>
            <SectionHeader title="Copy Settings" />
            <ToggleRow
              label="Print Merchant Copy"
              subtitle="Retains a copy for your records"
              value={printMerchantCopy}
              onToggle={(v) => _updateConfig('printing', { printMerchantCopy: v })}
            />
            <ToggleRow
              label="Print Customer Copy"
              subtitle="Gives a copy to the guest"
              value={printCustomerCopy}
              onToggle={(v) => _updateConfig('printing', { printCustomerCopy: v })}
            />

            <SectionHeader title="Receipt Options" />
            <ToggleRow
              label="Show Tax Breakdown"
              value={receiptSettings.showTaxBreakdown}
              onToggle={() => setReceiptSettings((prev) => ({ ...prev, showTaxBreakdown: !prev.showTaxBreakdown }))}
            />
            <ToggleRow
              label="Show Itemized List"
              value={receiptSettings.showItemizedList}
              onToggle={() => setReceiptSettings((prev) => ({ ...prev, showItemizedList: !prev.showItemizedList }))}
            />
            <ToggleRow
              label="Show Tip Options"
              value={receiptSettings.showTips}
              onToggle={() => setReceiptSettings((prev) => ({ ...prev, showTips: !prev.showTips }))}
            />

            <SectionHeader title="Footer" />
            <View style={{
              backgroundColor: colors.card,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}>
              <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 4 }}>Footer Message</Text>
              <TextInput
                value={receiptSettings.footerMessage}
                onChangeText={(t) => setReceiptSettings((prev) => ({ ...prev, footerMessage: t }))}
                style={{ fontSize: 13, color: colors.heading, paddingVertical: 2 }}
                placeholder="Thank you message"
                placeholderTextColor={colors.muted}
              />
            </View>
          </View>
        )}

        {/* ============================================================== */}
        {/* ORDER SETTINGS TAB                                              */}
        {/* ============================================================== */}
        {activeTab === "order" && (
          <View>
            <SectionHeader title="Auto-Print" />
            <ToggleRow
              label="Auto-Print Kitchen Tickets"
              value={autoPrintKitchenTickets}
              onToggle={(v) => updateField("autoPrintKitchenTickets", v)}
            />
            <ToggleRow
              label="Auto-Print Receipt After Payment"
              value={autoPrintReceipt}
              onToggle={(v) => updateField("autoPrintReceipt", v)}
            />

            <SectionHeader title="Kitchen Ticket" />
            <ToggleRow
              label="Auto-Fire Tickets"
              value={kitchenSettings.autoFire}
              onToggle={() => setKitchenSettings((prev) => ({ ...prev, autoFire: !prev.autoFire }))}
            />
            {kitchenSettings.autoFire && (
              <View style={{
                backgroundColor: colors.card,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                paddingHorizontal: 12,
                paddingVertical: 10,
                marginBottom: 4,
              }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontSize: 13, color: colors.heading }}>Auto-fire delay</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <TouchableOpacity
                      onPress={() =>
                        setKitchenSettings((prev) => ({
                          ...prev,
                          autoFireDelay: Math.max(0, prev.autoFireDelay - 1),
                        }))
                      }
                      style={{ backgroundColor: colors.panel, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }}
                    >
                      <Minus size={14} color={colors.heading} />
                    </TouchableOpacity>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: colors.teal, width: 44, textAlign: "center" }}>
                      {kitchenSettings.autoFireDelay}s
                    </Text>
                    <TouchableOpacity
                      onPress={() =>
                        setKitchenSettings((prev) => ({
                          ...prev,
                          autoFireDelay: Math.min(120, prev.autoFireDelay + 1),
                        }))
                      }
                      style={{ backgroundColor: colors.panel, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }}
                    >
                      <Plus size={14} color={colors.heading} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
            <ToggleRow
              label="Print Void Tickets"
              value={printVoidTickets}
              onToggle={(v) => _updateConfig('printing', { printVoidTickets: v })}
            />
            <ToggleRow
              label="Print Refund Tickets"
              value={printRefundTickets}
              onToggle={(v) => _updateConfig('printing', { printRefundTickets: v })}
            />
            <ToggleRow
              label="Show Guest Count"
              value={kitchenSettings.showGuestCount}
              onToggle={() => setKitchenSettings((prev) => ({ ...prev, showGuestCount: !prev.showGuestCount }))}
            />
            <ToggleRow
              label="Show Modifiers"
              value={kitchenSettings.showModifiers}
              onToggle={() => {
                const newVal = !kitchenSettings.showModifiers;
                setKitchenSettings((prev) => ({ ...prev, showModifiers: newVal }));
                updateKitchenTemplateField({ showItemModifiers: newVal });
              }}
            />
            <ToggleRow
              label="Show Course Number"
              value={kitchenSettings.showCourseNumber}
              onToggle={() => setKitchenSettings((prev) => ({ ...prev, showCourseNumber: !prev.showCourseNumber }))}
            />
            <ToggleRow
              label="Show Server Name"
              value={kitchenSettings.showServerName}
              onToggle={() => {
                const newVal = !kitchenSettings.showServerName;
                setKitchenSettings((prev) => ({ ...prev, showServerName: newVal }));
                updateKitchenTemplateField({ showServerName: newVal });
              }}
            />
            <ToggleRow
              label="Large Font"
              value={kitchenSettings.largeFont}
              onToggle={() => {
                const newVal = !kitchenSettings.largeFont;
                setKitchenSettings((prev) => ({ ...prev, largeFont: newVal }));
                updateKitchenTemplateField({ largeItemText: newVal });
              }}
            />

            {kitchenSettings.showModifiers && (
              <>
                <SectionHeader title="Modifier Style" />
                <View style={{ flexDirection: "row", gap: 6, marginBottom: 6 }}>
                  {([
                    { value: "inverted" as ModifierStyle, label: "Inverted" },
                    { value: "red" as ModifierStyle, label: "Red Text" },
                    { value: "bold" as ModifierStyle, label: "Bold Only" },
                  ]).map((opt) => {
                    const isSelected = kitchenSettings.modifierStyle === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        onPress={() => {
                          setKitchenSettings((prev) => ({ ...prev, modifierStyle: opt.value }));
                          updateKitchenTemplateField({ modifierStyle: opt.value });
                        }}
                        style={{
                          flex: 1,
                          paddingVertical: 9,
                          borderRadius: 8,
                          alignItems: "center",
                          backgroundColor: isSelected ? colors.teal + "20" : colors.card,
                          borderWidth: 1,
                          borderColor: isSelected ? colors.teal + "50" : colors.border,
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: "700", color: isSelected ? colors.teal : colors.label }}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}
          </View>
        )}

        {/* ============================================================== */}
        {/* KDS & ROUTING TAB                                               */}
        {/* ============================================================== */}
        {activeTab === "kds" && (
          <View>
            <SectionHeader title="KDS Workflow Mode" />
            <View style={{
              backgroundColor: colors.card,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 12,
              marginBottom: 4,
            }}>
              <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 10 }}>
                Controls how items flow through the KDS. 3-Step requires cooks to acknowledge orders before cooking. 2-Step skips the Pending stage.
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {([
                  { value: '3-step' as const, label: '3-Step', desc: 'Pending → Cooking → Served' },
                  { value: '2-step' as const, label: '2-Step', desc: 'Cooking → Served' },
                ] as const).map((opt) => {
                  const currentMode = useLocationConfigStore.getState().config.kds.workflowMode ?? '3-step';
                  const isSelected = currentMode === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      onPress={async () => {
                        if (!selectedStore?.id) return;
                        // Update via unified config (optimistic + backend + broadcast)
                        _updateConfig('kds', { workflowMode: opt.value });
                        // Also update selectedStore for backward compat
                        useStoreSettingsStore.getState().setSelectedStore({
                          ...selectedStore,
                          kds_workflow_mode: opt.value,
                        });
                        // Also persist to the legacy column
                        await supabase
                          .from('locations')
                          .update({ kds_workflow_mode: opt.value })
                          .eq('id', selectedStore.id);
                        // If switching to 2-step, migrate existing pending items
                        if (opt.value === '2-step') {
                          await supabase.rpc('migrate_pending_to_preparing', {
                            p_location_id: selectedStore.id,
                          });
                        }
                      }}
                      style={{
                        flex: 1,
                        paddingHorizontal: 10,
                        paddingVertical: 10,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: isSelected ? colors.teal + "50" : colors.border,
                        backgroundColor: isSelected ? colors.teal + "15" : colors.panel,
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: "700", color: isSelected ? colors.teal : colors.heading }}>
                        {opt.label}
                      </Text>
                      <Text style={{ fontSize: 10, marginTop: 2, color: isSelected ? colors.teal + "CC" : colors.muted }}>
                        {opt.desc}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {kdsConfig.workflowMode !== '2-step' && (
              <>
                <SectionHeader title="KDS Auto-Fire" />
                <ToggleRow
                  label="Auto-Fire Pending Courses"
                  value={kdsAutoFireEnabled}
                  onToggle={(v) => updateField("kdsAutoFireEnabled", v)}
                />
                {kdsAutoFireEnabled && (
                  <View style={{
                    backgroundColor: colors.card,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.border,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    marginBottom: 4,
                  }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={{ fontSize: 12, color: colors.label }}>Delay before auto-fire</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <TouchableOpacity
                          onPress={() =>
                            updateField("kdsAutoFireDelayMinutes", Math.max(1, kdsAutoFireDelayMinutes - 1))
                          }
                          style={{ backgroundColor: colors.panel, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }}
                        >
                          <Minus size={14} color={colors.heading} />
                        </TouchableOpacity>
                        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.teal, width: 52, textAlign: "center" }}>
                          {kdsAutoFireDelayMinutes} min
                        </Text>
                        <TouchableOpacity
                          onPress={() =>
                            updateField("kdsAutoFireDelayMinutes", Math.min(30, kdsAutoFireDelayMinutes + 1))
                          }
                          style={{ backgroundColor: colors.panel, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }}
                        >
                          <Plus size={14} color={colors.heading} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                )}
              </>
            )}

            {/* DISPLAY SETTINGS */}
            <SectionHeader title="Display Settings" />
            <ToggleRow
              label="Display Seat Numbers"
              value={kdsConfig.displaySeatNumbers ?? false}
              onToggle={(v) => updateField("kdsDisplaySeatNumbers", v)}
            />
            <ToggleRow
              label="Display Guest Count"
              value={kdsConfig.displayGuestCount ?? false}
              onToggle={(v) => updateField("kdsDisplayGuestCount", v)}
            />
            <ToggleRow
              label="Highlight Item Notes"
              value={kdsConfig.highlightNotes ?? false}
              onToggle={(v) => updateField("kdsHighlightNotes", v)}
            />
            <ToggleRow
              label="Display Exclusions at Top"
              value={kdsConfig.displayExclusionsAtTop ?? false}
              onToggle={(v) => updateField("kdsDisplayExclusionsAtTop", v)}
            />

            {/* RECEIPT FORMATTING */}
            <SectionHeader title="Receipt Formatting" />
            <ToggleRow
              label="Alphabetically Sort Items"
              value={kdsConfig.alphabeticalSort ?? false}
              onToggle={(v) => updateField("kdsAlphabeticalSort", v)}
            />
            <ToggleRow
              label="Aggregate Identical Items"
              subtitle="Merge items with same name, modifiers, and notes"
              value={kdsConfig.aggregateIdenticalItems ?? false}
              onToggle={(v) => updateField("kdsAggregateIdenticalItems", v)}
            />
            <ToggleRow
              label="Aggregate to Existing Tickets"
              subtitle="Single Ticket Mode"
              value={kdsConfig.aggregateToExistingTickets ?? false}
              onToggle={(v) => updateField("kdsAggregateToExistingTickets", v)}
            />
            <ToggleRow
              label="Hide Done Items"
              value={kdsConfig.hideDoneItems ?? false}
              onToggle={(v) => updateField("kdsHideDoneItems", v)}
            />

            {/* TICKET COLOR THRESHOLDS */}
            <SectionHeader title="Ticket Color Thresholds" />
            <View style={{
              backgroundColor: colors.card,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border,
              paddingHorizontal: 12,
              paddingVertical: 10,
              marginBottom: 4,
            }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <Text style={{ fontSize: 12, color: colors.label, fontWeight: "500" }}>Yellow (Warning)</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <TouchableOpacity
                    onPress={() =>
                      updateField("kdsYellowThresholdMinutes", Math.max(1, (kdsConfig.yellowThresholdMinutes ?? 5) - 1))
                    }
                    style={{ backgroundColor: colors.panel, width: 28, height: 28, borderRadius: 6, alignItems: "center", justifyContent: "center" }}
                  >
                    <Minus size={12} color={colors.heading} />
                  </TouchableOpacity>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.teal, minWidth: 32, textAlign: "center" }}>
                    {kdsConfig.yellowThresholdMinutes ?? 5}m
                  </Text>
                  <TouchableOpacity
                    onPress={() =>
                      updateField("kdsYellowThresholdMinutes", Math.min((kdsConfig.orangeThresholdMinutes ?? 10) - 1, (kdsConfig.yellowThresholdMinutes ?? 5) + 1))
                    }
                    style={{ backgroundColor: colors.panel, width: 28, height: 28, borderRadius: 6, alignItems: "center", justifyContent: "center" }}
                  >
                    <Plus size={12} color={colors.heading} />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <Text style={{ fontSize: 12, color: colors.label, fontWeight: "500" }}>Orange (Late)</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <TouchableOpacity
                    onPress={() =>
                      updateField("kdsOrangeThresholdMinutes", Math.max((kdsConfig.yellowThresholdMinutes ?? 5) + 1, (kdsConfig.orangeThresholdMinutes ?? 10) - 1))
                    }
                    style={{ backgroundColor: colors.panel, width: 28, height: 28, borderRadius: 6, alignItems: "center", justifyContent: "center" }}
                  >
                    <Minus size={12} color={colors.heading} />
                  </TouchableOpacity>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.teal, minWidth: 32, textAlign: "center" }}>
                    {kdsConfig.orangeThresholdMinutes ?? 10}m
                  </Text>
                  <TouchableOpacity
                    onPress={() =>
                      updateField("kdsOrangeThresholdMinutes", Math.min((kdsConfig.redThresholdMinutes ?? 15) - 1, (kdsConfig.orangeThresholdMinutes ?? 10) + 1))
                    }
                    style={{ backgroundColor: colors.panel, width: 28, height: 28, borderRadius: 6, alignItems: "center", justifyContent: "center" }}
                  >
                    <Plus size={12} color={colors.heading} />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontSize: 12, color: colors.label, fontWeight: "500" }}>Red (Critical)</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <TouchableOpacity
                    onPress={() =>
                      updateField("kdsRedThresholdMinutes", Math.max((kdsConfig.orangeThresholdMinutes ?? 10) + 1, (kdsConfig.redThresholdMinutes ?? 15) - 1))
                    }
                    style={{ backgroundColor: colors.panel, width: 28, height: 28, borderRadius: 6, alignItems: "center", justifyContent: "center" }}
                  >
                    <Minus size={12} color={colors.heading} />
                  </TouchableOpacity>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.teal, minWidth: 32, textAlign: "center" }}>
                    {kdsConfig.redThresholdMinutes ?? 15}m
                  </Text>
                  <TouchableOpacity
                    onPress={() =>
                      updateField("kdsRedThresholdMinutes", Math.min(60, (kdsConfig.redThresholdMinutes ?? 15) + 1))
                    }
                    style={{ backgroundColor: colors.panel, width: 28, height: 28, borderRadius: 6, alignItems: "center", justifyContent: "center" }}
                  >
                    <Plus size={12} color={colors.heading} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <SectionHeader title="Printer Routing" />
            <View style={{
              backgroundColor: colors.card,
              padding: 14,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border,
            }}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                <Route size={14} color={colors.teal} />
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading, marginLeft: 6 }}>Per-Printer Routing</Text>
              </View>
              <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 12 }}>
                Routing is now configured per-printer. Open a kitchen/bar printer's settings and tap "Configure Routing" to set up category, item, and order type rules.
              </Text>
              {kitchenPrinters.length > 0 ? (
                kitchenPrinters.map((kp) => {
                  const cfg = routingConfigs[kp.id];
                  const categoryCount = cfg?.rules.filter((r) => r.rule_type === "category" && r.is_enabled).length ?? 0;
                  const itemCount = cfg?.rules.filter((r) => r.rule_type === "menu_item" && r.is_enabled).length ?? 0;
                  const orderTypeCount = cfg?.rules.filter((r) => r.rule_type === "order_type" && r.is_enabled).length ?? 0;
                  const mode = cfg?.routingMode ?? kp.routingMode;
                  const hasNoRules = mode === "custom" && categoryCount === 0 && itemCount === 0;
                  const modeBg = mode === "all" ? colors.border : mode === "unassigned" ? colors.warning + "20" : colors.teal + "20";
                  const modeText = mode === "all" ? colors.label : mode === "unassigned" ? colors.warning : colors.teal;
                  const modeLabel = mode === "all" ? "All Items" : mode === "unassigned" ? "Catch-All" : "Custom";

                  return (
                    <View
                      key={kp.id}
                      style={{
                        backgroundColor: colors.panel,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: colors.border,
                        marginBottom: 6,
                      }}
                    >
                      <View style={{ paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center" }}>

                        {/* Icon box */}
                        <View style={{
                          width: 30, height: 30, borderRadius: 7,
                          backgroundColor: colors.teal + "15",
                          alignItems: "center", justifyContent: "center",
                          marginRight: 10, flexShrink: 0,
                        }}>
                          <Printer size={14} color={colors.teal} />
                        </View>

                        {/* Name + badges */}
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 12, fontWeight: "700", color: colors.heading, marginBottom: 5 }} numberOfLines={1}>
                            {kp.printerName}
                          </Text>
                          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4 }}>
                            <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4, backgroundColor: modeBg, borderWidth: 1, borderColor: modeText + "40" }}>
                              <Text style={{ fontSize: 10, fontWeight: "600", color: modeText }}>{modeLabel}</Text>
                            </View>
                            {mode === "custom" && !hasNoRules && (
                              <>
                                {categoryCount > 0 && (
                                  <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                    <Text style={{ fontSize: 10, color: colors.label }}>{categoryCount} cat{categoryCount !== 1 ? "s" : ""}</Text>
                                  </View>
                                )}
                                {itemCount > 0 && (
                                  <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                    <Text style={{ fontSize: 10, color: colors.label }}>{itemCount} item{itemCount !== 1 ? "s" : ""}</Text>
                                  </View>
                                )}
                              </>
                            )}
                            {hasNoRules && (
                              <View style={{ backgroundColor: colors.warning + "20", borderWidth: 1, borderColor: colors.warning + "40", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                <Text style={{ fontSize: 10, fontWeight: "600", color: colors.warning }}>No rules</Text>
                              </View>
                            )}
                            {orderTypeCount > 0 && (
                              <View style={{ backgroundColor: colors.teal + "15", borderWidth: 1, borderColor: colors.teal + "40", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                <Text style={{ fontSize: 10, color: colors.teal }}>{orderTypeCount} order type{orderTypeCount !== 1 ? "s" : ""}</Text>
                              </View>
                            )}
                          </View>
                        </View>

                        {/* Configure button */}
                        <TouchableOpacity
                          onPress={() => setRoutingModalPrinter(kp)}
                          style={{
                            flexDirection: "row", alignItems: "center", gap: 5,
                            paddingHorizontal: 10, paddingVertical: 6,
                            backgroundColor: colors.teal + "15",
                            borderWidth: 1, borderColor: colors.teal + "40",
                            borderRadius: 8, flexShrink: 0, marginLeft: 10,
                          }}
                        >
                          <Settings2 size={12} color={colors.teal} />
                          <Text style={{ fontSize: 11, fontWeight: "600", color: colors.teal }}>Configure</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              ) : (
                <Text style={{ fontSize: 11, color: colors.muted }}>No kitchen/bar printers configured</Text>
              )}
            </View>

            <SectionHeader title="Smart Kitchen Throttling" />
            <View style={{ backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>

              {/* Auto-Throttle toggle */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 12 }}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={{ color: colors.heading, fontWeight: "600", fontSize: 12, marginBottom: 2 }}>Auto-Throttle</Text>
                  <Text style={{ color: colors.muted, fontSize: 10 }}>Automatically manage capacity</Text>
                </View>
                <Switch checked={throttling.enabled} onCheckedChange={(v) => setThrottling({ enabled: v })} />
              </View>

              {throttling.enabled && (() => {
                const activeCount = kdsCount.cooking;
                const pendingCount = kdsCount.pending;
                const totalLoad = activeCount + pendingCount;
                const maxCapacity = throttling.maxCapacity ?? 100;
                const loadPercentage = Math.min(Math.round((totalLoad / maxCapacity) * 100), 100);
                const loadColor = loadPercentage >= throttling.capacity ? colors.danger : loadPercentage >= throttling.capacity * 0.8 ? colors.warning : colors.teal;

                return (
                  <>
                    <View style={{ height: 1, backgroundColor: colors.border }} />

                    {/* Current Load */}
                    <View style={{ paddingHorizontal: 14, paddingVertical: 12 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <View>
                          <Text style={{ color: colors.label, fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>Current Load</Text>
                          <Text style={{ color: colors.muted, fontSize: 10 }}>{activeCount} cooking • {pendingCount} pending</Text>
                        </View>
                        <Text style={{ fontSize: 20, fontWeight: "700", color: loadColor }}>{loadPercentage}%</Text>
                      </View>

                      {/* Heat line */}
                      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.screen, overflow: "hidden", marginBottom: 4 }}>
                        <View style={{ position: "absolute", left: 0, top: 0, width: `${loadPercentage}%`, height: "100%", borderRadius: 3, backgroundColor: loadColor }} />
                        <View style={{ position: "absolute", left: `${throttling.capacity}%`, top: -1, width: 2, height: 8, backgroundColor: colors.heading, borderRadius: 1, marginLeft: -1 }} />
                      </View>
                      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <Text style={{ fontSize: 9, color: colors.muted }}>0</Text>
                        <Text style={{ fontSize: 9, color: colors.muted }}>Threshold {throttling.capacity}%</Text>
                        <Text style={{ fontSize: 9, color: colors.muted }}>{maxCapacity} items</Text>
                      </View>
                    </View>

                    <View style={{ height: 1, backgroundColor: colors.border }} />

                    {/* Max Capacity */}
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10 }}>
                      <View>
                        <Text style={{ color: colors.heading, fontSize: 12, fontWeight: "600", marginBottom: 2 }}>Max Capacity</Text>
                        <Text style={{ color: colors.muted, fontSize: 10 }}>Total items kitchen can handle</Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <TouchableOpacity
                          onPress={() => setThrottling({ maxCapacity: Math.max(10, maxCapacity - 5) })}
                          style={{ backgroundColor: colors.screen, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: colors.border }}
                        >
                          <Minus size={12} color={colors.heading} />
                        </TouchableOpacity>
                        <TextInput
                          value={String(maxCapacity)}
                          onChangeText={(val) => {
                            const num = parseInt(val, 10);
                            if (!isNaN(num) && num >= 10 && num <= 500) setThrottling({ maxCapacity: num });
                          }}
                          keyboardType="number-pad"
                          style={{
                            backgroundColor: colors.screen,
                            borderWidth: 1,
                            borderColor: colors.border,
                            borderRadius: 6,
                            paddingHorizontal: 8,
                            paddingVertical: 5,
                            color: colors.teal,
                            fontSize: 12,
                            fontWeight: "700",
                            textAlign: "center",
                            width: 54,
                          }}
                          placeholderTextColor={colors.muted}
                        />
                        <TouchableOpacity
                          onPress={() => setThrottling({ maxCapacity: Math.min(500, maxCapacity + 5) })}
                          style={{ backgroundColor: colors.screen, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: colors.border }}
                        >
                          <Plus size={12} color={colors.heading} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={{ height: 1, backgroundColor: colors.border }} />

                    {/* Throttle Threshold */}
                    <View style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
                      <Text style={{ color: colors.label, fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                        Throttle Threshold — {throttling.capacity}%
                      </Text>
                      <View style={{ flexDirection: "row", gap: 4 }}>
                        {[50, 60, 70, 75, 80, 90].map((val) => (
                          <TouchableOpacity
                            key={val}
                            onPress={() => setThrottling({ capacity: val })}
                            style={{
                              flex: 1, paddingVertical: 6, borderRadius: 6, borderWidth: 1,
                              backgroundColor: throttling.capacity === val ? colors.teal + "20" : colors.screen,
                              borderColor: throttling.capacity === val ? colors.teal + "50" : colors.border,
                            }}
                          >
                            <Text style={{ textAlign: "center", fontSize: 10, fontWeight: "600", color: throttling.capacity === val ? colors.teal : colors.muted }}>
                              {val}%
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>

                    <View style={{ height: 1, backgroundColor: colors.border }} />

                    {/* Actions */}
                    <View style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 }}>
                      <Text style={{ color: colors.label, fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                        Actions When Threshold Reached
                      </Text>
                    </View>
                    {[
                      { label: "Pause online orders", key: "pauseOnline" as const, value: throttling.pauseOnline },
                      { label: "Increase prep times", key: "increasePrepTime" as const, value: throttling.increasePrepTime },
                      { label: "Alert manager", key: "alertManager" as const, value: throttling.alertManager },
                    ].map((item, i, arr) => (
                      <View key={item.key}>
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10 }}>
                          <Text style={{ color: colors.heading, fontSize: 12 }}>{item.label}</Text>
                          <Switch checked={item.value} onCheckedChange={(v) => setThrottling({ [item.key]: v })} />
                        </View>
                        {i < arr.length - 1 && <View style={{ height: 1, backgroundColor: colors.border }} />}
                      </View>
                    ))}
                  </>
                );
              })()}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Printer Routing Modal */}
      {routingModalPrinter && (
        <PrinterRoutingModal
          visible={!!routingModalPrinter}
          onClose={() => setRoutingModalPrinter(null)}
          printer={routingModalPrinter}
        />
      )}
    </View>
  );
};

export default PrintersKitchenScreen;
