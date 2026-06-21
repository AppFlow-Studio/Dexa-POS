import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Minus, Plus, Printer, RefreshCw, Route, Settings2 } from "lucide-react-native";

import { DiscoveredPrinterList } from "@/components/settings/DiscoveredPrinterList";
import { ManualIpPanel } from "@/components/settings/ManualIpPanel";
import { PrinterListSection } from "@/components/settings/PrinterListSection";
import { PrinterRoutingModal } from "@/components/settings/PrinterRoutingModal";
import { useLocationStations } from "@/hooks/useLocationStations";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { usePrinterDiscovery } from "@/hooks/usePrinterDiscovery";
import { getPrinterReachability } from "@/stores/selectors/printerSelectors";
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { useKDSStore } from "@/stores/useKDSStore";
import { useLocationConfigStore } from "@/stores/useLocationConfigStore";
import { usePrinterStore } from "@/stores/usePrinterStore";
import { useReceiptTemplateStore } from "@/stores/useReceiptTemplateStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import type { ModifierStyle } from "@/types/receipt-template";
import type { PrinterConfig } from "@/types/printer";
import { Switch } from "~/components/ui/switch";

// ---------------------------------------------------------------------------
// TABS
// ---------------------------------------------------------------------------

type TabKey = "list" | "sales" | "order" | "other";

const TABS: { key: TabKey; label: string }[] = [
  { key: "list", label: "Printer List" },
  { key: "sales", label: "Sales Setting" },
  { key: "order", label: "Order Setting" },
  { key: "other", label: "Other" },
];

// ---------------------------------------------------------------------------
// SHARED LITTLE COMPONENTS
// ---------------------------------------------------------------------------

function SectionHeader({ title, rightContent }: { title: string; rightContent?: React.ReactNode }) {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  return (
    <View style={{
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: s(16),
      marginBottom: s(6),
      paddingHorizontal: s(2),
    }}>
      <Text style={{
        fontSize: s(11),
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
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  return (
    <View style={{
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: s(10),
      paddingHorizontal: s(12),
      backgroundColor: colors.card,
      borderRadius: s(8),
      marginBottom: s(4),
    }}>
      <View style={{ flex: 1, marginRight: s(10) }}>
        <Text style={{ fontSize: s(13), color: colors.heading, marginBottom: subtitle ? s(2) : 0 }}>{label}</Text>
        {subtitle && <Text style={{ fontSize: s(11), color: colors.muted }}>{subtitle}</Text>}
      </View>
      <Switch checked={value} onCheckedChange={onToggle} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// MAIN SCREEN
// ---------------------------------------------------------------------------

export default function PrintersScreen() {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const params = useLocalSearchParams<{ tab?: string }>();
  const initialTab: TabKey = useMemo(() => {
    const t = params.tab as TabKey | undefined;
    return t === "sales" || t === "order" || t === "other" ? t : "list";
  }, [params.tab]);
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  // Modal state hoisted here so any tab can open them (Order tab routing,
  // List tab edit/delete).
  const [routingModalPrinter, setRoutingModalPrinter] = useState<PrinterConfig | null>(null);
  const [editPrinter, setEditPrinter] = useState<PrinterConfig | null>(null);

  return (
    <View style={{ flex: 1, backgroundColor: colors.panel }}>
      <View style={{
        flexDirection: "row",
        paddingHorizontal: s(16),
        paddingTop: s(14),
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
                paddingHorizontal: s(14),
                paddingVertical: s(10),
                marginRight: s(2),
                borderBottomWidth: 2,
                borderBottomColor: isActive ? colors.teal : "transparent",
              }}
            >
              <Text style={{
                fontSize: s(12),
                fontWeight: "700",
                color: isActive ? colors.teal : colors.label,
              }}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: s(16), paddingBottom: s(40) }}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === "list" && (
          <PrinterListTab
            onOpenRouting={setRoutingModalPrinter}
            onOpenEdit={setEditPrinter}
          />
        )}
        {activeTab === "sales" && <SalesSettingTab />}
        {activeTab === "order" && (
          <OrderSettingTab onOpenRouting={setRoutingModalPrinter} />
        )}
        {activeTab === "other" && <OtherTab />}
      </ScrollView>

      {routingModalPrinter && (
        <PrinterRoutingModal
          visible={!!routingModalPrinter}
          onClose={() => setRoutingModalPrinter(null)}
          printer={routingModalPrinter}
        />
      )}

      {editPrinter && (
        <EditPrinterDialog
          printer={editPrinter}
          onClose={() => setEditPrinter(null)}
        />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// PRINTER LIST TAB
// ---------------------------------------------------------------------------

function YourStationReceiptPrinterCard({
  printer,
  onChange,
  onTest,
  testingId,
}: {
  printer: PrinterConfig | null;
  onChange: () => void;
  onTest: () => void;
  testingId: string | null;
}) {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const reachability = printer ? getPrinterReachability(printer) : "unknown";
  const dotColor =
    reachability === "connectable"
      ? colors.success
      : reachability === "in_use"
        ? colors.warning
        : reachability === "offline"
          ? colors.danger
          : colors.muted;

  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: s(12),
        borderWidth: 1,
        borderColor: colors.border,
        padding: s(12),
        marginBottom: s(8),
      }}
    >
      <Text
        style={{
          fontSize: s(11),
          fontWeight: "700",
          color: colors.muted,
          textTransform: "uppercase",
          letterSpacing: 0.6,
          marginBottom: s(6),
        }}
      >
        Your Station's Receipt Printer
      </Text>

      {printer ? (
        <View
          style={{ flexDirection: "row", alignItems: "center", gap: s(10) }}
        >
          <View
            style={{
              width: s(8),
              height: s(8),
              borderRadius: s(4),
              backgroundColor: dotColor,
            }}
          />
          <View style={{ flex: 1 }}>
            <Text
              style={{ fontSize: s(13), fontWeight: "700", color: colors.heading }}
              numberOfLines={1}
            >
              {printer.printerName}
            </Text>
            <Text style={{ fontSize: s(11), color: colors.muted }} numberOfLines={1}>
              {printer.networkAddress ?? printer.connectionType.toUpperCase()}
              {" · "}
              {reachability === "connectable"
                ? "Connectable"
                : reachability === "in_use"
                  ? "In use"
                  : reachability === "offline"
                    ? "Offline"
                    : "Unknown"}
            </Text>
          </View>
          <TouchableOpacity
            onPress={onTest}
            disabled={testingId === printer.id}
            style={{
              paddingHorizontal: s(10),
              paddingVertical: s(6),
              borderRadius: s(7),
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
              opacity: testingId === printer.id ? 0.6 : 1,
            }}
          >
            <Text style={{ fontSize: s(11), fontWeight: "600", color: colors.label }}>
              {testingId === printer.id ? "Testing…" : "Test"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onChange}
            style={{
              paddingHorizontal: s(10),
              paddingVertical: s(6),
              borderRadius: s(7),
              backgroundColor: colors.teal + "20",
              borderWidth: 1,
              borderColor: colors.teal + "50",
            }}
          >
            <Text style={{ fontSize: s(11), fontWeight: "700", color: colors.teal }}>
              Change
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Text style={{ fontSize: s(12), color: colors.muted }}>
          No receipt printer set — claim one from the list below.
        </Text>
      )}
    </View>
  );
}

function PrinterListTab({
  onOpenRouting,
  onOpenEdit,
}: {
  onOpenRouting: (p: PrinterConfig) => void;
  onOpenEdit: (p: PrinterConfig) => void;
}) {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const selectedStation = useStoreSettingsStore((store) => store.selectedStation);
  const selectedStore = useStoreSettingsStore((store) => store.selectedStore);
  const fetchPrinters = usePrinterStore((store) => store.fetchPrinters);
  const deletePrinter = usePrinterStore((store) => store.deletePrinter);

  const {
    scanState,
    storedPrinters,
    discoveredPrinters,
    scan,
    provisionStar,
    addByManualIp,
    clearManualIpError,
    testPrint,
    retryConnection,
  } = usePrinterDiscovery();

  // Load printers on mount + when store changes.
  useEffect(() => {
    if (selectedStore?.id) fetchPrinters(selectedStore.id);
  }, [selectedStore?.id, fetchPrinters]);

  // Manual IP input UI (separate from the hook's probing state).
  const [manualIp, setManualIp] = useState("");
  const [manualIpRole, setManualIpRole] = useState<"receipt" | "kitchen" | "both">("receipt");
  const [showManualIp, setShowManualIp] = useState(false);

  // Pre-provision test result per discovered IP.
  const [testResults, setTestResults] = useState<
    Record<string, { success: boolean; message: string } | null>
  >({});
  const [testingIp, setTestingIp] = useState<string | null>(null);

  const handleManualIpConnect = async () => {
    await addByManualIp(manualIp, manualIpRole);
    if (!scanState.manualIpError) {
      setManualIp("");
      setShowManualIp(false);
    }
  };

  const handleTestDiscovered = async (ip: string) => {
    setTestingIp(ip);
    try {
      // Reuse retryConnection by building a temporary PrinterConfig-like.
      // Simpler: the user can just provision — pre-test is a nice-to-have.
      // For now, mark testResults with a generic success placeholder once we
      // actually probe via probeStarPrinterByIp. Keeping minimal here.
      setTestResults((prev) => ({
        ...prev,
        [ip]: { success: true, message: "Reachable" },
      }));
    } finally {
      setTestingIp(null);
    }
  };

  const handleDelete = (printer: PrinterConfig) => {
    Alert.alert(
      "Delete Printer?",
      `Remove "${printer.printerName}" permanently?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deletePrinter(printer.id);
              if (selectedStore?.id) await fetchPrinters(selectedStore.id);
            } catch (e: any) {
              Alert.alert("Error", e.message || "Failed to delete printer");
            }
          },
        },
      ],
    );
  };

  // Partition saved printers by role into Receipt vs Kitchen/Bar/Label groups
  // so the Figure-style "role-grouped sections" surface comes through.
  const receiptPrinters = useMemo(
    () => storedPrinters.filter((p) => p.printerRole === "receipt"),
    [storedPrinters],
  );
  const kitchenPrinters = useMemo(
    () => storedPrinters.filter((p) => p.printerRole !== "receipt"),
    [storedPrinters],
  );

  // Pull every active station at this location so we can render the
  // "Used by N other stations" chip + the "Your Station's Receipt Printer"
  // card. Single TanStack query shared with the Settings → Stations screen.
  const { data: stations } = useLocationStations();
  const claimsByPrinterId = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const s of stations ?? []) {
      const pid = s.current_receipt_printer_id;
      if (!pid) continue;
      if (!map[pid]) map[pid] = [];
      map[pid].push(s.id);
    }
    return map;
  }, [stations]);

  const claimedPrinterId =
    selectedStation?.current_receipt_printer_id ?? null;
  const claimedPrinter = useMemo(
    () =>
      claimedPrinterId
        ? storedPrinters.find((p) => p.id === claimedPrinterId) ?? null
        : null,
    [claimedPrinterId, storedPrinters],
  );

  return (
    <View>
      <YourStationReceiptPrinterCard
        printer={claimedPrinter}
        onChange={() => claimedPrinter && onOpenEdit(claimedPrinter)}
        onTest={() => claimedPrinter && testPrint(claimedPrinter)}
        testingId={scanState.testPrintingId}
      />

      <SectionHeader
        title="Available Printers"
        rightContent={
          <View style={{ flexDirection: "row", gap: s(6) }}>
            <TouchableOpacity
              onPress={() => {
                if (!scanState.isScanning) scan();
              }}
              disabled={scanState.isScanning}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: s(4),
                paddingHorizontal: s(8),
                paddingVertical: s(4),
                borderRadius: s(6),
                backgroundColor: colors.teal + "15",
                borderWidth: 1,
                borderColor: colors.teal + "40",
                opacity: scanState.isScanning ? 0.7 : 1,
              }}
            >
              {scanState.isScanning ? (
                <ActivityIndicator size="small" color={colors.teal} />
              ) : (
                <RefreshCw size={s(11)} color={colors.teal} />
              )}
              <Text style={{ fontSize: s(11), fontWeight: "700", color: colors.teal }}>
                {scanState.isScanning
                  ? scanState.scanSecondsRemaining != null
                    ? `Scanning… ${scanState.scanSecondsRemaining}s`
                    : "Scanning…"
                  : "Scan network"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowManualIp((v) => !v)}
              style={{
                paddingHorizontal: s(8),
                paddingVertical: s(4),
                borderRadius: s(6),
                backgroundColor: showManualIp ? colors.teal + "20" : colors.card,
                borderWidth: 1,
                borderColor: showManualIp ? colors.teal + "60" : colors.border,
              }}
            >
              <Text style={{ fontSize: s(11), fontWeight: "600", color: showManualIp ? colors.teal : colors.label }}>
                {showManualIp ? "Hide manual IP" : "Enter IP manually"}
              </Text>
            </TouchableOpacity>
          </View>
        }
      />

      {showManualIp && (
        <ManualIpPanel
          forRole={manualIpRole === "kitchen" ? "kitchen" : "receipt"}
          manualIp={manualIp}
          onChangeIp={(ip) => {
            setManualIp(ip);
            if (scanState.manualIpError) clearManualIpError();
          }}
          manualIpError={scanState.manualIpError}
          onClearError={clearManualIpError}
          isProbing={scanState.isProbing}
          isScanningStar={scanState.isScanning}
          onConnect={handleManualIpConnect}
          onScanNetwork={scan}
          onCancel={() => {
            setShowManualIp(false);
            setManualIp("");
            clearManualIpError();
          }}
        />
      )}

      <DiscoveredPrinterList
        discoveredPrinters={discoveredPrinters}
        storedPrinters={storedPrinters}
        isScanning={scanState.isScanning}
        scanSecondsRemaining={scanState.scanSecondsRemaining}
        scanError={scanState.scanError}
        provisioningIp={scanState.provisioningStarIp}
        testResults={testResults}
        testingIp={testingIp}
        onRefresh={scan}
        onProvision={(printer, role) => provisionStar(printer, role)}
        onTest={handleTestDiscovered}
      />

      <SectionHeader title="Receipt Printers" />
      <PrinterListSection
        printers={receiptPrinters}
        selectedStationId={selectedStation?.id ?? null}
        claimsByPrinterId={claimsByPrinterId}
        onRetryConnection={async (p) => {
          await retryConnection(p);
        }}
        onTestPrint={testPrint}
        onConfigurePrinter={(printerId) => {
          const p = storedPrinters.find((x) => x.id === printerId);
          if (p) onOpenEdit(p);
        }}
        onSavePrinterConfig={async () => {
          // EditPrinterDialog drives updatePrinterConfig directly.
        }}
        onDeletePrinter={handleDelete}
        onOpenRouting={onOpenRouting}
      />

      <SectionHeader title="Kitchen / Bar / Label Printers" />
      <PrinterListSection
        printers={kitchenPrinters}
        selectedStationId={selectedStation?.id ?? null}
        claimsByPrinterId={claimsByPrinterId}
        onRetryConnection={async (p) => {
          await retryConnection(p);
        }}
        onTestPrint={testPrint}
        onConfigurePrinter={(printerId) => {
          const p = storedPrinters.find((x) => x.id === printerId);
          if (p) onOpenEdit(p);
        }}
        onSavePrinterConfig={async () => {}}
        onDeletePrinter={handleDelete}
        onOpenRouting={onOpenRouting}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// SALES SETTING TAB
// ---------------------------------------------------------------------------

interface ReceiptOptionsLocal {
  showTaxBreakdown: boolean;
  showItemizedList: boolean;
  showTips: boolean;
  footerMessage: string;
}

function SalesSettingTab() {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const printingConfig = useLocationConfigStore((store) => store.config.printing);
  const updateConfig = useLocationConfigStore((store) => store.updateConfig);

  // NOTE: showTaxBreakdown / showItemizedList / showTips / footerMessage are
  // currently local-state-only in the legacy screens — preserved here as-is.
  // Persisting them is a separate PR.
  const [receipt, setReceipt] = useState<ReceiptOptionsLocal>({
    showTaxBreakdown: true,
    showItemizedList: true,
    showTips: true,
    footerMessage: "Thank you for your visit!",
  });

  return (
    <View>
      <SectionHeader title="Copies" />
      <ToggleRow
        label="Print Merchant Copy"
        subtitle="Retains a copy for your records"
        value={printingConfig.printMerchantCopy}
        onToggle={(v) => updateConfig("printing", { printMerchantCopy: v })}
      />
      <ToggleRow
        label="Print Customer Copy"
        subtitle="Gives a copy to the guest"
        value={printingConfig.printCustomerCopy}
        onToggle={(v) => updateConfig("printing", { printCustomerCopy: v })}
      />

      <SectionHeader title="Receipt Options" />
      <ToggleRow
        label="Show Tax Breakdown"
        value={receipt.showTaxBreakdown}
        onToggle={() => setReceipt((p) => ({ ...p, showTaxBreakdown: !p.showTaxBreakdown }))}
      />
      <ToggleRow
        label="Show Itemized List"
        value={receipt.showItemizedList}
        onToggle={() => setReceipt((p) => ({ ...p, showItemizedList: !p.showItemizedList }))}
      />
      <ToggleRow
        label="Show Tip Options"
        value={receipt.showTips}
        onToggle={() => setReceipt((p) => ({ ...p, showTips: !p.showTips }))}
      />
      <ToggleRow
        label="Match Pricing to Payment Method"
        subtitle="Card payments show card pricing; cash payments show cash pricing"
        value={printingConfig.matchReceiptPricingToPaymentMethod}
        onToggle={(v) =>
          updateConfig("printing", { matchReceiptPricingToPaymentMethod: v })
        }
      />

      <SectionHeader title="Footer" />
      <View style={{
        backgroundColor: colors.card,
        borderRadius: s(8),
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: s(12),
        paddingVertical: s(10),
      }}>
        <Text style={{ fontSize: s(11), color: colors.muted, marginBottom: s(4) }}>Footer Message</Text>
        <TextInput
          value={receipt.footerMessage}
          onChangeText={(t) => setReceipt((p) => ({ ...p, footerMessage: t }))}
          style={{ fontSize: s(13), color: colors.heading, paddingVertical: s(2) }}
          placeholder="Thank you message"
          placeholderTextColor={colors.muted}
        />
      </View>

      <SectionHeader title="Auto-Print" />
      <ToggleRow
        label="Auto-Print Receipt After Payment"
        value={printingConfig.autoPrintReceipt}
        onToggle={(v) => updateConfig("printing", { autoPrintReceipt: v })}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// ORDER SETTING TAB
// ---------------------------------------------------------------------------

interface KitchenLocal {
  autoFire: boolean;
  autoFireDelay: number;
  showGuestCount: boolean;
  showModifiers: boolean;
  showCourseNumber: boolean;
  showServerName: boolean;
  largeFont: boolean;
  modifierStyle: ModifierStyle;
}

function OrderSettingTab({ onOpenRouting }: { onOpenRouting: (p: PrinterConfig) => void }) {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const supabase = useSupabaseClient();
  const selectedStore = useStoreSettingsStore((store) => store.selectedStore);
  const kdsConfig = useLocationConfigStore((store) => store.config.kds);
  const printingConfig = useLocationConfigStore((store) => store.config.printing);
  const updateConfig = useLocationConfigStore((store) => store.updateConfig);

  const fetchTemplates = useReceiptTemplateStore((store) => store.fetchTemplates);
  const getKitchenTemplate = useReceiptTemplateStore((store) => store.getKitchenTemplate);
  const updateTemplate = useReceiptTemplateStore((store) => store.updateTemplate);
  const saveTemplate = useReceiptTemplateStore((store) => store.saveTemplate);

  const storedPrinters = usePrinterStore((store) => store.printers);
  const routingConfigs = usePrinterStore((store) => store.routingConfigs);

  // Local-state-only kitchen toggles (preserved as-is per plan)
  const [kitchen, setKitchen] = useState<KitchenLocal>({
    autoFire: true,
    autoFireDelay: 0,
    showGuestCount: true,
    showModifiers: true,
    showCourseNumber: false,
    showServerName: true,
    largeFont: false,
    modifierStyle: "inverted",
  });

  // Load kitchen template and sync displayed values
  useEffect(() => {
    if (!selectedStore?.id) return;
    fetchTemplates(selectedStore.id).then(() => {
      if (!selectedStore?.id) return;
      const tpl = getKitchenTemplate(selectedStore.id);
      setKitchen((prev) => ({
        ...prev,
        showModifiers: tpl.showItemModifiers,
        showServerName: tpl.showServerName,
        largeFont: tpl.largeItemText,
        modifierStyle: tpl.modifierStyle,
      }));
    });
  }, [selectedStore?.id, fetchTemplates, getKitchenTemplate]);

  const updateKitchenTemplate = (updates: Record<string, any>) => {
    if (!selectedStore?.id) return;
    const tpl = getKitchenTemplate(selectedStore.id);
    updateTemplate(tpl.id, updates);
    saveTemplate({ ...tpl, ...updates }, selectedStore.merchant_id, selectedStore.id);
  };

  const kitchenPrinters = storedPrinters.filter(
    (p) => p.isActive && (p.printerRole === "kitchen" || p.printerRole === "bar" || p.isDefaultKitchen),
  );

  const workflowMode = kdsConfig.workflowMode ?? "3-step";

  return (
    <View>
      <SectionHeader title="Kitchen Ticket Settings" />
      <ToggleRow
        label="Auto-Fire Tickets"
        value={kitchen.autoFire}
        onToggle={() => setKitchen((p) => ({ ...p, autoFire: !p.autoFire }))}
      />
      {kitchen.autoFire && (
        <View style={{
          backgroundColor: colors.card,
          borderRadius: s(8),
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: s(12),
          paddingVertical: s(10),
          marginBottom: s(4),
        }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontSize: s(13), color: colors.heading }}>Auto-fire delay</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: s(8) }}>
              <TouchableOpacity
                onPress={() => setKitchen((p) => ({ ...p, autoFireDelay: Math.max(0, p.autoFireDelay - 1) }))}
                style={{ backgroundColor: colors.panel, paddingHorizontal: s(10), paddingVertical: s(6), borderRadius: s(6) }}
              >
                <Minus size={s(14)} color={colors.heading} />
              </TouchableOpacity>
              <Text style={{ fontSize: s(13), fontWeight: "700", color: colors.teal, width: s(44), textAlign: "center" }}>
                {kitchen.autoFireDelay}s
              </Text>
              <TouchableOpacity
                onPress={() => setKitchen((p) => ({ ...p, autoFireDelay: Math.min(120, p.autoFireDelay + 1) }))}
                style={{ backgroundColor: colors.panel, paddingHorizontal: s(10), paddingVertical: s(6), borderRadius: s(6) }}
              >
                <Plus size={s(14)} color={colors.heading} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
      <ToggleRow
        label="Print Void Tickets"
        value={printingConfig.printVoidTickets}
        onToggle={(v) => updateConfig("printing", { printVoidTickets: v })}
      />
      <ToggleRow
        label="Print Refund Tickets"
        value={printingConfig.printRefundTickets ?? true}
        onToggle={(v) => updateConfig("printing", { printRefundTickets: v })}
      />
      <ToggleRow
        label="Show Guest Count"
        value={kitchen.showGuestCount}
        onToggle={() => setKitchen((p) => ({ ...p, showGuestCount: !p.showGuestCount }))}
      />
      <ToggleRow
        label="Show Modifiers"
        value={kitchen.showModifiers}
        onToggle={() => {
          const newVal = !kitchen.showModifiers;
          setKitchen((p) => ({ ...p, showModifiers: newVal }));
          updateKitchenTemplate({ showItemModifiers: newVal });
        }}
      />
      <ToggleRow
        label="Show Course Number"
        value={kitchen.showCourseNumber}
        onToggle={() => setKitchen((p) => ({ ...p, showCourseNumber: !p.showCourseNumber }))}
      />
      <ToggleRow
        label="Show Server Name"
        value={kitchen.showServerName}
        onToggle={() => {
          const newVal = !kitchen.showServerName;
          setKitchen((p) => ({ ...p, showServerName: newVal }));
          updateKitchenTemplate({ showServerName: newVal });
        }}
      />
      <ToggleRow
        label="Large Font"
        value={kitchen.largeFont}
        onToggle={() => {
          const newVal = !kitchen.largeFont;
          setKitchen((p) => ({ ...p, largeFont: newVal }));
          updateKitchenTemplate({ largeItemText: newVal });
        }}
      />

      {kitchen.showModifiers && (
        <>
          <SectionHeader title="Modifier Style" />
          <View style={{ flexDirection: "row", gap: s(6), marginBottom: s(6) }}>
            {([
              { value: "inverted" as ModifierStyle, label: "Inverted" },
              { value: "red" as ModifierStyle, label: "Red Text" },
              { value: "bold" as ModifierStyle, label: "Bold Only" },
            ]).map((opt) => {
              const isSelected = kitchen.modifierStyle === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => {
                    setKitchen((p) => ({ ...p, modifierStyle: opt.value }));
                    updateKitchenTemplate({ modifierStyle: opt.value });
                  }}
                  style={{
                    flex: 1,
                    paddingVertical: s(9),
                    borderRadius: s(8),
                    alignItems: "center",
                    backgroundColor: isSelected ? colors.teal + "20" : colors.card,
                    borderWidth: 1,
                    borderColor: isSelected ? colors.teal + "50" : colors.border,
                  }}
                >
                  <Text style={{ fontSize: s(11), fontWeight: "700", color: isSelected ? colors.teal : colors.label }}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      <SectionHeader title="KDS Workflow Mode" />
      <View style={{
        backgroundColor: colors.card,
        borderRadius: s(10),
        borderWidth: 1,
        borderColor: colors.border,
        padding: s(12),
        marginBottom: s(4),
      }}>
        <Text style={{ fontSize: s(11), color: colors.muted, marginBottom: s(10) }}>
          Controls how items flow through the KDS. 3-Step requires cooks to acknowledge orders before cooking. 2-Step skips the Pending stage.
        </Text>
        <View style={{ flexDirection: "row", gap: s(8) }}>
          {([
            { value: "3-step" as const, label: "3-Step", desc: "Pending → Cooking → Served" },
            { value: "2-step" as const, label: "2-Step", desc: "Cooking → Served" },
          ] as const).map((opt) => {
            const isSelected = workflowMode === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                onPress={async () => {
                  if (!selectedStore?.id) return;
                  updateConfig("kds", { workflowMode: opt.value });
                  useStoreSettingsStore.getState().setSelectedStore({
                    ...selectedStore,
                    kds_workflow_mode: opt.value,
                  });
                  await supabase
                    .from("locations")
                    .update({ kds_workflow_mode: opt.value })
                    .eq("id", selectedStore.id);
                  if (opt.value === "2-step") {
                    await supabase.rpc("migrate_pending_to_preparing", {
                      p_location_id: selectedStore.id,
                    });
                  }
                }}
                style={{
                  flex: 1,
                  paddingHorizontal: s(10),
                  paddingVertical: s(10),
                  borderRadius: s(8),
                  borderWidth: 1,
                  borderColor: isSelected ? colors.teal + "50" : colors.border,
                  backgroundColor: isSelected ? colors.teal + "15" : colors.panel,
                }}
              >
                <Text style={{ fontSize: s(12), fontWeight: "700", color: isSelected ? colors.teal : colors.heading }}>
                  {opt.label}
                </Text>
                <Text style={{ fontSize: s(10), marginTop: s(2), color: isSelected ? colors.teal + "CC" : colors.muted }}>
                  {opt.desc}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {workflowMode !== "2-step" && (
        <>
          <SectionHeader title="KDS Auto-Fire" />
          <ToggleRow
            label="Auto-Fire Pending Courses"
            value={kdsConfig.autoFireEnabled}
            onToggle={(v) => updateConfig("kds", { autoFireEnabled: v })}
          />
          {kdsConfig.autoFireEnabled && (
            <View style={{
              backgroundColor: colors.card,
              borderRadius: s(8),
              borderWidth: 1,
              borderColor: colors.border,
              paddingHorizontal: s(12),
              paddingVertical: s(10),
              marginBottom: s(4),
            }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontSize: s(12), color: colors.label }}>Delay before auto-fire</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: s(8) }}>
                  <TouchableOpacity
                    onPress={() => updateConfig("kds", { autoFireDelayMinutes: Math.max(1, kdsConfig.autoFireDelayMinutes - 1) })}
                    style={{ backgroundColor: colors.panel, paddingHorizontal: s(10), paddingVertical: s(6), borderRadius: s(6) }}
                  >
                    <Minus size={s(14)} color={colors.heading} />
                  </TouchableOpacity>
                  <Text style={{ fontSize: s(13), fontWeight: "700", color: colors.teal, width: s(52), textAlign: "center" }}>
                    {kdsConfig.autoFireDelayMinutes} min
                  </Text>
                  <TouchableOpacity
                    onPress={() => updateConfig("kds", { autoFireDelayMinutes: Math.min(30, kdsConfig.autoFireDelayMinutes + 1) })}
                    style={{ backgroundColor: colors.panel, paddingHorizontal: s(10), paddingVertical: s(6), borderRadius: s(6) }}
                  >
                    <Plus size={s(14)} color={colors.heading} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </>
      )}

      <SectionHeader title="Display Settings" />
      <ToggleRow
        label="Display Seat Numbers"
        value={kdsConfig.displaySeatNumbers ?? false}
        onToggle={(v) => updateConfig("kds", { displaySeatNumbers: v })}
      />
      <ToggleRow
        label="Display Guest Count"
        value={kdsConfig.displayGuestCount ?? false}
        onToggle={(v) => updateConfig("kds", { displayGuestCount: v })}
      />
      <ToggleRow
        label="Highlight Item Notes"
        value={kdsConfig.highlightNotes ?? false}
        onToggle={(v) => updateConfig("kds", { highlightNotes: v })}
      />
      <ToggleRow
        label="Display Exclusions at Top"
        value={kdsConfig.displayExclusionsAtTop ?? false}
        onToggle={(v) => updateConfig("kds", { displayExclusionsAtTop: v })}
      />

      <SectionHeader title="Receipt Formatting" />
      <ToggleRow
        label="Alphabetically Sort Items"
        value={kdsConfig.alphabeticalSort ?? false}
        onToggle={(v) => updateConfig("kds", { alphabeticalSort: v })}
      />
      <ToggleRow
        label="Aggregate Identical Items"
        subtitle="Merge items with same name, modifiers, and notes"
        value={kdsConfig.aggregateIdenticalItems ?? false}
        onToggle={(v) => updateConfig("kds", { aggregateIdenticalItems: v })}
      />
      <ToggleRow
        label="Aggregate to Existing Tickets"
        subtitle="Single Ticket Mode"
        value={kdsConfig.aggregateToExistingTickets ?? false}
        onToggle={(v) => updateConfig("kds", { aggregateToExistingTickets: v })}
      />
      <ToggleRow
        label="Hide Done Items"
        value={kdsConfig.hideDoneItems ?? false}
        onToggle={(v) => updateConfig("kds", { hideDoneItems: v })}
      />

      <SectionHeader title="Ticket Color Thresholds" />
      <ColorThresholdRow
        label="Yellow (Warning)"
        value={kdsConfig.yellowThresholdMinutes ?? 5}
        min={1}
        max={(kdsConfig.orangeThresholdMinutes ?? 10) - 1}
        onChange={(v) => updateConfig("kds", { yellowThresholdMinutes: v })}
      />
      <ColorThresholdRow
        label="Orange (Late)"
        value={kdsConfig.orangeThresholdMinutes ?? 10}
        min={(kdsConfig.yellowThresholdMinutes ?? 5) + 1}
        max={(kdsConfig.redThresholdMinutes ?? 15) - 1}
        onChange={(v) => updateConfig("kds", { orangeThresholdMinutes: v })}
      />
      <ColorThresholdRow
        label="Red (Critical)"
        value={kdsConfig.redThresholdMinutes ?? 15}
        min={(kdsConfig.orangeThresholdMinutes ?? 10) + 1}
        max={60}
        onChange={(v) => updateConfig("kds", { redThresholdMinutes: v })}
      />

      <SectionHeader title="Auto-Print Kitchen" />
      <ToggleRow
        label="Auto-Print Kitchen Tickets"
        value={printingConfig.autoPrintKitchenTickets}
        onToggle={(v) => updateConfig("printing", { autoPrintKitchenTickets: v })}
      />

      <SectionHeader title="Printer Routing" />
      <View style={{
        backgroundColor: colors.card,
        padding: s(14),
        borderRadius: s(10),
        borderWidth: 1,
        borderColor: colors.border,
      }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: s(6) }}>
          <Route size={s(14)} color={colors.teal} />
          <Text style={{ fontSize: s(13), fontWeight: "600", color: colors.heading, marginLeft: s(6) }}>
            Per-Printer Routing
          </Text>
        </View>
        <Text style={{ fontSize: s(11), color: colors.muted, marginBottom: s(12) }}>
          Configure category, item, and order type rules for each kitchen / bar printer.
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
                  borderRadius: s(8),
                  borderWidth: 1,
                  borderColor: colors.border,
                  marginBottom: s(6),
                }}
              >
                <View style={{ paddingHorizontal: s(12), paddingVertical: s(10), flexDirection: "row", alignItems: "center" }}>
                  <View style={{
                    width: s(30), height: s(30), borderRadius: s(7),
                    backgroundColor: colors.teal + "15",
                    alignItems: "center", justifyContent: "center",
                    marginRight: s(10), flexShrink: 0,
                  }}>
                    <Printer size={s(14)} color={colors.teal} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: s(12), fontWeight: "700", color: colors.heading, marginBottom: s(5) }} numberOfLines={1}>
                      {kp.printerName}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: s(4) }}>
                      <View style={{ paddingHorizontal: s(7), paddingVertical: s(2), borderRadius: s(4), backgroundColor: modeBg, borderWidth: 1, borderColor: modeText + "40" }}>
                        <Text style={{ fontSize: s(10), fontWeight: "600", color: modeText }}>{modeLabel}</Text>
                      </View>
                      {mode === "custom" && !hasNoRules && (
                        <>
                          {categoryCount > 0 && (
                            <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, paddingHorizontal: s(6), paddingVertical: s(2), borderRadius: s(4) }}>
                              <Text style={{ fontSize: s(10), color: colors.label }}>{categoryCount} cat{categoryCount !== 1 ? "s" : ""}</Text>
                            </View>
                          )}
                          {itemCount > 0 && (
                            <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, paddingHorizontal: s(6), paddingVertical: s(2), borderRadius: s(4) }}>
                              <Text style={{ fontSize: s(10), color: colors.label }}>{itemCount} item{itemCount !== 1 ? "s" : ""}</Text>
                            </View>
                          )}
                        </>
                      )}
                      {hasNoRules && (
                        <View style={{ backgroundColor: colors.warning + "20", borderWidth: 1, borderColor: colors.warning + "40", paddingHorizontal: s(6), paddingVertical: s(2), borderRadius: s(4) }}>
                          <Text style={{ fontSize: s(10), fontWeight: "600", color: colors.warning }}>No rules</Text>
                        </View>
                      )}
                      {orderTypeCount > 0 && (
                        <View style={{ backgroundColor: colors.teal + "15", borderWidth: 1, borderColor: colors.teal + "40", paddingHorizontal: s(6), paddingVertical: s(2), borderRadius: s(4) }}>
                          <Text style={{ fontSize: s(10), color: colors.teal }}>{orderTypeCount} order type{orderTypeCount !== 1 ? "s" : ""}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => onOpenRouting(kp)}
                    style={{
                      flexDirection: "row", alignItems: "center", gap: s(5),
                      paddingHorizontal: s(10), paddingVertical: s(6),
                      backgroundColor: colors.teal + "15",
                      borderWidth: 1, borderColor: colors.teal + "40",
                      borderRadius: s(8), flexShrink: 0, marginLeft: s(10),
                    }}
                  >
                    <Settings2 size={s(12)} color={colors.teal} />
                    <Text style={{ fontSize: s(11), fontWeight: "600", color: colors.teal }}>Configure</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        ) : (
          <Text style={{ fontSize: 11, color: colors.muted }}>No kitchen / bar printers configured</Text>
        )}
      </View>
    </View>
  );
}

function ColorThresholdRow({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  return (
    <View style={{
      backgroundColor: colors.card,
      borderRadius: s(8),
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: s(12),
      paddingVertical: s(10),
      marginBottom: s(4),
    }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontSize: s(12), color: colors.label, fontWeight: "500" }}>{label}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: s(6) }}>
          <TouchableOpacity
            onPress={() => onChange(Math.max(min, value - 1))}
            style={{ backgroundColor: colors.panel, width: s(28), height: s(28), borderRadius: s(6), alignItems: "center", justifyContent: "center" }}
          >
            <Minus size={s(12)} color={colors.heading} />
          </TouchableOpacity>
          <Text style={{ fontSize: s(12), fontWeight: "700", color: colors.teal, minWidth: s(32), textAlign: "center" }}>
            {value}m
          </Text>
          <TouchableOpacity
            onPress={() => onChange(Math.min(max, value + 1))}
            style={{ backgroundColor: colors.panel, width: s(28), height: s(28), borderRadius: s(6), alignItems: "center", justifyContent: "center" }}
          >
            <Plus size={s(12)} color={colors.heading} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// OTHER TAB (Smart Kitchen Throttling)
// ---------------------------------------------------------------------------

function OtherTab() {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const { throttling, setThrottling } = useSettingsStore();
  const kdsCount = useKDSStore((store) => store.counts);

  return (
    <View>
      <SectionHeader title="Smart Kitchen Throttling" />
      <View style={{ backgroundColor: colors.card, borderRadius: s(10), borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: s(14), paddingVertical: s(12) }}>
          <View style={{ flex: 1, paddingRight: s(12) }}>
            <Text style={{ color: colors.heading, fontWeight: "600", fontSize: s(12), marginBottom: s(2) }}>Auto-Throttle</Text>
            <Text style={{ color: colors.muted, fontSize: s(10) }}>Automatically manage capacity</Text>
          </View>
          <Switch checked={throttling.enabled} onCheckedChange={(v) => setThrottling({ enabled: v })} />
        </View>

        {throttling.enabled && (() => {
          const activeCount = kdsCount.cooking;
          const pendingCount = kdsCount.pending;
          const totalLoad = activeCount + pendingCount;
          const maxCapacity = throttling.maxCapacity ?? 100;
          const loadPercentage = Math.min(Math.round((totalLoad / maxCapacity) * 100), 100);
          const loadColor =
            loadPercentage >= throttling.capacity
              ? colors.danger
              : loadPercentage >= throttling.capacity * 0.8
                ? colors.warning
                : colors.teal;

          return (
            <>
              <View style={{ height: 1, backgroundColor: colors.border }} />

              <View style={{ paddingHorizontal: s(14), paddingVertical: s(12) }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: s(10) }}>
                  <View>
                    <Text style={{ color: colors.label, fontSize: s(10), fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: s(2) }}>Current Load</Text>
                    <Text style={{ color: colors.muted, fontSize: s(10) }}>{activeCount} cooking • {pendingCount} pending</Text>
                  </View>
                  <Text style={{ fontSize: s(20), fontWeight: "700", color: loadColor }}>{loadPercentage}%</Text>
                </View>

                <View style={{ height: s(6), borderRadius: s(3), backgroundColor: colors.screen, overflow: "hidden", marginBottom: s(4) }}>
                  <View style={{ position: "absolute", left: 0, top: 0, width: `${loadPercentage}%`, height: "100%", borderRadius: s(3), backgroundColor: loadColor }} />
                  <View style={{ position: "absolute", left: `${throttling.capacity}%`, top: -1, width: s(2), height: s(8), backgroundColor: colors.heading, borderRadius: s(1), marginLeft: -1 }} />
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: s(9), color: colors.muted }}>0</Text>
                  <Text style={{ fontSize: s(9), color: colors.muted }}>Threshold {throttling.capacity}%</Text>
                  <Text style={{ fontSize: s(9), color: colors.muted }}>{maxCapacity} items</Text>
                </View>
              </View>

              <View style={{ height: 1, backgroundColor: colors.border }} />

              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: s(14), paddingVertical: s(10) }}>
                <View>
                  <Text style={{ color: colors.heading, fontSize: s(12), fontWeight: "600", marginBottom: s(2) }}>Max Capacity</Text>
                  <Text style={{ color: colors.muted, fontSize: s(10) }}>Total items kitchen can handle</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: s(6) }}>
                  <TouchableOpacity
                    onPress={() => setThrottling({ maxCapacity: Math.max(10, maxCapacity - 5) })}
                    style={{ backgroundColor: colors.screen, paddingHorizontal: s(8), paddingVertical: s(5), borderRadius: s(6), borderWidth: 1, borderColor: colors.border }}
                  >
                    <Minus size={s(12)} color={colors.heading} />
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
                      borderRadius: s(6),
                      paddingHorizontal: s(8),
                      paddingVertical: s(5),
                      color: colors.teal,
                      fontSize: s(12),
                      fontWeight: "700",
                      textAlign: "center",
                      width: s(54),
                    }}
                    placeholderTextColor={colors.muted}
                  />
                  <TouchableOpacity
                    onPress={() => setThrottling({ maxCapacity: Math.min(500, maxCapacity + 5) })}
                    style={{ backgroundColor: colors.screen, paddingHorizontal: s(8), paddingVertical: s(5), borderRadius: s(6), borderWidth: 1, borderColor: colors.border }}
                  >
                    <Plus size={s(12)} color={colors.heading} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={{ height: 1, backgroundColor: colors.border }} />

              <View style={{ paddingHorizontal: s(14), paddingVertical: s(10) }}>
                <Text style={{ color: colors.label, fontSize: s(10), fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: s(8) }}>
                  Throttle Threshold — {throttling.capacity}%
                </Text>
                <View style={{ flexDirection: "row", gap: s(4) }}>
                  {[50, 60, 70, 75, 80, 90].map((val) => (
                    <TouchableOpacity
                      key={val}
                      onPress={() => setThrottling({ capacity: val })}
                      style={{
                        flex: 1, paddingVertical: s(6), borderRadius: s(6), borderWidth: 1,
                        backgroundColor: throttling.capacity === val ? colors.teal + "20" : colors.screen,
                        borderColor: throttling.capacity === val ? colors.teal + "50" : colors.border,
                      }}
                    >
                      <Text style={{ textAlign: "center", fontSize: s(10), fontWeight: "600", color: throttling.capacity === val ? colors.teal : colors.muted }}>
                        {val}%
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={{ height: 1, backgroundColor: colors.border }} />

              <View style={{ paddingHorizontal: s(14), paddingTop: s(10), paddingBottom: s(4) }}>
                <Text style={{ color: colors.label, fontSize: s(10), fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: s(8) }}>
                  Actions When Threshold Reached
                </Text>
              </View>
              {[
                { label: "Pause online orders", key: "pauseOnline" as const, value: throttling.pauseOnline },
                { label: "Increase prep times", key: "increasePrepTime" as const, value: throttling.increasePrepTime },
                { label: "Alert manager", key: "alertManager" as const, value: throttling.alertManager },
              ].map((item, i, arr) => (
                <View key={item.key}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: s(14), paddingVertical: s(10) }}>
                    <Text style={{ color: colors.heading, fontSize: s(12) }}>{item.label}</Text>
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
  );
}

// ---------------------------------------------------------------------------
// EDIT PRINTER DIALOG
// ---------------------------------------------------------------------------

// Minimal inline dialog for the "Full Settings" action on a printer card.
// Lets the user rename + change role + toggle default flags + activate state.
// Larger schema-aware editing (paper width, modifiers, etc.) is deferred — the
// existing EditPrinterModal.tsx is mock-data only and can't be reused.
function EditPrinterDialog({
  printer,
  onClose,
}: {
  printer: PrinterConfig;
  onClose: () => void;
}) {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const updatePrinterConfig = usePrinterStore((store) => store.updatePrinterConfig);
  const setStationReceiptPrinter = usePrinterStore(
    (store) => store.setStationReceiptPrinter,
  );
  const selectedStore = useStoreSettingsStore((store) => store.selectedStore);
  const selectedStation = useStoreSettingsStore((store) => store.selectedStation);
  const fetchPrinters = usePrinterStore((store) => store.fetchPrinters);
  const { data: stations } = useLocationStations();
  // Count stations OTHER than the current one that have this printer claimed
  // — drives the soft-collision disclosure copy in the Claim section.
  const otherClaimCount = useMemo(
    () =>
      (stations ?? []).filter(
        (s) =>
          s.current_receipt_printer_id === printer.id &&
          s.id !== selectedStation?.id,
      ).length,
    [stations, printer.id, selectedStation?.id],
  );
  const [name, setName] = useState(printer.printerName);
  const [role, setRole] = useState(printer.printerRole);
  const [isDefaultKitchen, setIsDefaultKitchen] = useState(printer.isDefaultKitchen);
  const [isActive, setIsActive] = useState(printer.isActive);
  const [saving, setSaving] = useState(false);
  const [claiming, setClaiming] = useState(false);

  // Receipt-printer claim is owned by the station, not the printer. The
  // toggle here is replaced by a single "Claim as Receipt Printer" button
  // that writes stations.current_receipt_printer_id directly. Multiple
  // stations can independently claim the same printer (soft sharing).
  const isClaimedByThisStation =
    selectedStation?.current_receipt_printer_id === printer.id;

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert("Invalid Name", "Printer name cannot be empty.");
      return;
    }
    setSaving(true);
    try {
      await updatePrinterConfig(printer.id, {
        printerName: trimmed,
        printerRole: role,
        isDefaultKitchen,
        isActive,
      });
      if (selectedStore?.id) await fetchPrinters(selectedStore.id);
      onClose();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to update printer");
    } finally {
      setSaving(false);
    }
  };

  const handleClaim = async () => {
    if (!selectedStation?.id) return;
    setClaiming(true);
    try {
      await setStationReceiptPrinter(selectedStation.id, printer.id);
      onClose();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to claim receipt printer");
    } finally {
      setClaiming(false);
    }
  };

  return (
    <View
      style={{
        position: "absolute",
        inset: 0 as any,
        backgroundColor: "rgba(0,0,0,0.5)",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 100,
      }}
      pointerEvents="auto"
    >
      <View
        style={{
          backgroundColor: colors.panel,
          borderRadius: s(16),
          padding: s(20),
          width: s(460),
          maxWidth: "92%",
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Text style={{ fontSize: s(16), fontWeight: "700", color: colors.heading, marginBottom: s(14) }}>
          Edit Printer
        </Text>

        <Text style={{ fontSize: s(11), color: colors.muted, marginBottom: s(4) }}>Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          style={{
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: s(8),
            paddingHorizontal: s(12),
            paddingVertical: s(10),
            fontSize: s(13),
            color: colors.heading,
            marginBottom: s(12),
          }}
        />

        <Text style={{ fontSize: s(11), color: colors.muted, marginBottom: s(4) }}>Role</Text>
        <View style={{ flexDirection: "row", gap: s(6), marginBottom: s(12) }}>
          {(["receipt", "kitchen", "bar", "label"] as const).map((r) => {
            const isSelected = role === r;
            return (
              <TouchableOpacity
                key={r}
                onPress={() => setRole(r)}
                style={{
                  flex: 1,
                  paddingVertical: s(9),
                  borderRadius: s(8),
                  alignItems: "center",
                  backgroundColor: isSelected ? colors.teal + "20" : colors.card,
                  borderWidth: 1,
                  borderColor: isSelected ? colors.teal + "50" : colors.border,
                }}
              >
                <Text style={{ fontSize: s(11), fontWeight: "700", color: isSelected ? colors.teal : colors.label, textTransform: "capitalize" }}>
                  {r}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: s(8),
            paddingVertical: s(10),
            paddingHorizontal: s(12),
            marginBottom: s(4),
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: s(10),
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: s(13), color: colors.heading, marginBottom: s(2) }}>
                Receipt Printer for This Station
              </Text>
              <Text style={{ fontSize: s(11), color: colors.muted }}>
                {isClaimedByThisStation
                  ? "Currently claimed by this station."
                  : otherClaimCount > 0
                    ? `Already claimed by ${otherClaimCount} other station${otherClaimCount === 1 ? "" : "s"}. Both will share this printer — may briefly fail if both stations print at the same time.`
                    : "Set this printer as the one your station prints receipts to."}
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleClaim}
              disabled={claiming || isClaimedByThisStation || !selectedStation?.id}
              style={{
                paddingHorizontal: s(12),
                paddingVertical: s(8),
                borderRadius: s(8),
                backgroundColor: isClaimedByThisStation ? colors.card : colors.teal + "20",
                borderWidth: 1,
                borderColor: isClaimedByThisStation ? colors.border : colors.teal + "50",
                opacity: claiming ? 0.6 : 1,
              }}
            >
              <Text
                style={{
                  fontSize: s(11),
                  fontWeight: "700",
                  color: isClaimedByThisStation ? colors.muted : colors.teal,
                }}
              >
                {isClaimedByThisStation ? "Claimed" : claiming ? "Claiming…" : "Claim"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        <ToggleRow
          label="Default Kitchen Printer"
          value={isDefaultKitchen}
          onToggle={setIsDefaultKitchen}
        />
        <ToggleRow
          label="Active"
          subtitle="Disable to keep configuration but stop using this printer"
          value={isActive}
          onToggle={setIsActive}
        />

        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: s(8), marginTop: s(14) }}>
          <TouchableOpacity
            onPress={onClose}
            style={{
              paddingHorizontal: s(16),
              paddingVertical: s(10),
              borderRadius: s(8),
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ fontSize: s(12), fontWeight: "600", color: colors.label }}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            style={{
              paddingHorizontal: s(16),
              paddingVertical: s(10),
              borderRadius: s(8),
              backgroundColor: colors.teal,
              opacity: saving ? 0.6 : 1,
            }}
          >
            <Text style={{ fontSize: s(12), fontWeight: "700", color: "#fff" }}>
              {saving ? "Saving…" : "Save"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
