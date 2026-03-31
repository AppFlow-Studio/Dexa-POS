import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Minus,
  Monitor,
  Plus,
  Printer,
  RefreshCw,
  Settings2,
  Smartphone,
  Wifi,
  XCircle,
  Zap,
  Route,
  Trash2,
} from "lucide-react-native";
import { colors, spinnerColor } from "@/lib/theme";
import { PrinterService } from "@/services/printing/PrinterService";
import { PrinterRoutingModal } from "@/components/settings/PrinterRoutingModal";
import { useKDSStore } from "@/stores/useKDSStore";
import { usePrinterStore } from "@/stores/usePrinterStore";
import { usePrintQueueStore } from "@/stores/usePrintQueueStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useLocationConfigStore } from "@/stores/useLocationConfigStore";
import { useReceiptTemplateStore } from "@/stores/useReceiptTemplateStore";
import type { ModifierStyle } from "@/types/receipt-template";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import {
  type PrinterConfig,
  type PrinterDriverType,
  type PrinterRole,
} from "@/types/printer";
import {
  getCachedCapabilities,
  detectDeviceCapabilities,
  ensureDejavooPrinterProvisioned,
  verifyDejavooPrinter,
  provisionStarPrinter,
  verifyStarPrinter,
  type DeviceCapabilities,
} from "@/services/hardware";
import {
  discoverStarPrinters,
  stopDiscovery,
  probeStarPrinterByIp,
  type DiscoveredStarPrinter,
} from "@/services/printing/discovery/StarPrinterDiscovery";
import { toastService } from "@/lib/toastService";
import { formatDistanceToNow } from "date-fns";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
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

type PrinterTab = "printers" | "receipt" | "order" | "kds";

interface ReceiptSettings {
  merchantCopies: number;
  customerCopies: number;
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
  printVoidTickets: boolean;
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
// STATUS HELPERS
// ---------------------------------------------------------------------------

function getPrinterStatusColor(printer: PrinterConfig): string {
  if (printer.lastStatus === "verified") return colors.success;
  if (printer.isConnected) return colors.success;
  if (printer.lastStatus?.startsWith("verification_failed")) return colors.danger;
  if (printer.errorCount > 0) return colors.muted;
  return colors.muted;
}

function getPrinterStatusLabel(printer: PrinterConfig): string {
  if (printer.lastStatus === "verified") return "Verified";
  if (printer.isConnected) return "Online";
  if (printer.lastStatus?.startsWith("verification_failed")) return "Verify Failed";
  if (printer.errorCount > 0) return "Error";
  return "Offline";
}

function getPrinterStatusIcon(printer: PrinterConfig): React.ReactNode {
  if (printer.lastStatus === "verified" || printer.isConnected) {
    return <CheckCircle2 size={13} color={colors.success} />;
  }
  if (printer.lastStatus?.startsWith("verification_failed")) {
    return <XCircle size={13} color={colors.danger} />;
  }
  if (printer.errorCount > 0) {
    return <AlertTriangle size={13} color={colors.muted} />;
  }
  return <XCircle size={13} color={colors.muted} />;
}


function getRoleBadge(role: PrinterRole): { label: string; bg: string; text: string } {
  switch (role) {
    case "receipt": return { label: "Receipt", bg: colors.teal + "20", text: colors.teal };
    case "kitchen": return { label: "Kitchen", bg: colors.teal + "20", text: colors.teal };
    case "bar": return { label: "Bar", bg: colors.teal + "20", text: colors.teal };
    case "label": return { label: "Label", bg: colors.teal + "15", text: colors.teal };
    default: return { label: role, bg: colors.teal + "15", text: colors.teal };
  }
}

function getTypeBadge(type: PrinterDriverType): string {
  switch (type) {
    case "builtin_landi": return "Built-in";
    case "dejavoo_spin_p": return "Dejavoo";
    case "star_micronics": return "Star";
    case "generic_escpos": return "ESC/POS";
    default: return type;
  }
}


function getRelativeTime(iso: string | null): string {
  if (!iso) return "\u2014";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "\u2014";
  }
}

// ---------------------------------------------------------------------------
// TAB CONFIG
// ---------------------------------------------------------------------------

const TABS: { key: PrinterTab; label: string }[] = [
  { key: "printers", label: "Printer List" },
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
  const [activeTab, setActiveTab] = useState<PrinterTab>("printers");

  // KDS + Printing settings from unified config
  const kdsConfig = useLocationConfigStore((s) => s.config.kds);
  const printingConfig = useLocationConfigStore((s) => s.config.printing);
  const _updateConfig = useLocationConfigStore((s) => s.updateConfig);
  const kdsAutoFireEnabled = kdsConfig.autoFireEnabled;
  const kdsAutoFireDelayMinutes = kdsConfig.autoFireDelayMinutes;
  const autoPrintKitchenTickets = printingConfig.autoPrintKitchenTickets;
  const autoPrintReceipt = printingConfig.autoPrintReceipt;
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

  // Location & station
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const selectedStation = useStoreSettingsStore((s) => s.selectedStation);

  // Receipt template store
  const fetchTemplates = useReceiptTemplateStore((s) => s.fetchTemplates);
  const getKitchenTemplate = useReceiptTemplateStore((s) => s.getKitchenTemplate);
  const updateTemplate = useReceiptTemplateStore((s) => s.updateTemplate);
  const saveTemplate = useReceiptTemplateStore((s) => s.saveTemplate);

  // Printer store
  const storedPrinters = usePrinterStore((s) => s.printers);
  const fetchPrinters = usePrinterStore((s) => s.fetchPrinters);
  const updatePrinterConfig = usePrinterStore((s) => s.updatePrinterConfig);
  const deletePrinter = usePrinterStore((s) => s.deletePrinter);
  const routingConfigs = usePrinterStore((s) => s.routingConfigs);


  // Print queue (reactive via selector on jobs array)
  const jobs = usePrintQueueStore((s) => s.jobs);
  const queuedJobCount = jobs.filter((j) => j.status === "queued" || j.status === "processing").length;
  const failedJobCount = jobs.filter((j) => j.status === "failed").length;

  // Throttling & KDS store (must be at top level, not in conditional)
  const { throttling, setThrottling } = useSettingsStore();
  const kdsCount = useKDSStore((s) => s.counts);

  // Device capabilities
  const [deviceCapabilities, setDeviceCapabilities] = useState<DeviceCapabilities | null>(
    getCachedCapabilities,
  );
  const [isRefreshingCapabilities, setIsRefreshingCapabilities] = useState(false);

  // Dejavoo provisioning
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisioningError, setProvisioningError] = useState<string | null>(null);

  // Star Micronics discovery
  const [isScanningStar, setIsScanningStar] = useState(false);
  const [discoveredStarPrinters, setDiscoveredStarPrinters] = useState<DiscoveredStarPrinter[]>([]);
  const [starScanError, setStarScanError] = useState<string | null>(null);
  const [provisioningStarIp, setProvisioningStarIp] = useState<string | null>(null);

  // Star role overrides (keyed by IP, user can switch before provisioning)
  const [starRoleOverrides, setStarRoleOverrides] = useState<Record<string, "receipt" | "kitchen">>({});

  // Manual IP entry for Star printers
  const [manualIp, setManualIp] = useState("");
  const [manualIpRole, setManualIpRole] = useState<"receipt" | "kitchen">("receipt");
  const [isProbing, setIsProbing] = useState(false);
  const [manualIpError, setManualIpError] = useState<string | null>(null);

  // Add printer inline panel state
  const [addingForRole, setAddingForRole] = useState<"receipt" | "kitchen" | null>(null);

  // Custom alert modal
  const [alertModal, setAlertModal] = useState<{ title: string; message: string; success: boolean } | null>(null);

  // Edit panel state
  const [editingPrinterId, setEditingPrinterId] = useState<string | null>(null);
  const [isSavingPrinter, setIsSavingPrinter] = useState(false);
  const [deletingPrinterId, setDeletingPrinterId] = useState<string | null>(null);
  const [draftPrinterEdits, setDraftPrinterEdits] = useState<{
    printerRole?: PrinterRole;
    isDefaultReceipt?: boolean;
    isDefaultKitchen?: boolean;
    isActive?: boolean;
  }>({});

  // Advanced settings draft state
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showCapabilities, setShowCapabilities] = useState(false);
  const [draftMaxChars, setDraftMaxChars] = useState('');
  const [draftPaperWidth, setDraftPaperWidth] = useState('');
  const [draftDensity, setDraftDensity] = useState('');
  const [draftCopies, setDraftCopies] = useState('');
  const [draftNetworkAddress, setDraftNetworkAddress] = useState('');
  const [draftNetworkPort, setDraftNetworkPort] = useState('');
  const [draftPrintLogo, setDraftPrintLogo] = useState(false);
  const [draftAutoPrintReceipt, setDraftAutoPrintReceipt] = useState(false);
  const [draftPrintOrderTickets, setDraftPrintOrderTickets] = useState(false);
  const [draftReceiptHeader, setDraftReceiptHeader] = useState('');
  const [draftReceiptFooter, setDraftReceiptFooter] = useState('');
  const [draftGraphicsOnly, setDraftGraphicsOnly] = useState(false);
  const [draftSupportsAutoCut, setDraftSupportsAutoCut] = useState(false);
  const [draftSupportsCashDrawer, setDraftSupportsCashDrawer] = useState(false);
  const [draftSupportsBarcode, setDraftSupportsBarcode] = useState(false);
  const [draftSupportsQrCode, setDraftSupportsQrCode] = useState(false);
  const [draftSupportsLogo, setDraftSupportsLogo] = useState(false);

  // Printer scope toggle
  const [printerScope, setPrinterScope] = useState<"station" | "location">("station");

  // Routing modal state
  const [routingModalPrinter, setRoutingModalPrinter] = useState<PrinterConfig | null>(null);


  // Test print loading per printer
  const [testPrintingId, setTestPrintingId] = useState<string | null>(null);
  const [testPrintType] = useState<"test_page" | "receipt" | "kitchen">("test_page");

  // Fetch real printers on mount
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

  // Cleanup Star discovery on unmount
  useEffect(() => {
    return () => {
      stopDiscovery();
    };
  }, []);

  // Initialize advanced drafts when configure panel opens
  useEffect(() => {
    if (!editingPrinterId) return;
    const p = storedPrinters.find((pr) => pr.id === editingPrinterId);
    if (!p) return;
    setShowAdvanced(false);
    setShowCapabilities(false);
    setDraftMaxChars(String(p.maxCharsPerLine ?? ''));
    setDraftPaperWidth(String(p.paperWidth ?? ''));
    setDraftDensity(String(p.printDensity ?? ''));
    setDraftCopies(String(p.copies ?? ''));
    setDraftNetworkAddress(p.networkAddress ?? '');
    setDraftNetworkPort(String(p.networkPort ?? ''));
    setDraftPrintLogo(p.printLogo ?? false);
    setDraftAutoPrintReceipt(p.autoPrintReceipt ?? false);
    setDraftPrintOrderTickets(p.printOrderTickets ?? false);
    setDraftReceiptHeader(p.receiptHeader ?? '');
    setDraftReceiptFooter(p.receiptFooter ?? '');
    setDraftGraphicsOnly(p.graphicsOnly ?? false);
    setDraftSupportsAutoCut(p.supportsAutoCut ?? false);
    setDraftSupportsCashDrawer(p.supportsCashDrawerKick ?? false);
    setDraftSupportsBarcode(p.supportsBarcode ?? false);
    setDraftSupportsQrCode(p.supportsQrCode ?? false);
    setDraftSupportsLogo(p.supportsLogo ?? false);
  }, [editingPrinterId]);

  // Retry connection state
  const [retryingPrinterId, setRetryingPrinterId] = useState<string | null>(null);

  // Pull-to-refresh
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Derived
  const paymentTerminal = selectedStation?.payment_terminal ?? null;
  const visiblePrinters = storedPrinters.filter((p) => {
    if (printerScope === "station") {
      // Show this station's printers + shared (null station) printers
      return p.stationId === selectedStation?.id || p.stationId === null;
    }
    // "location" mode: show all, but still hide other stations' builtins
    return p.connectionType !== "builtin" || p.stationId === selectedStation?.id;
  });
  const hasDejavooPrinter = visiblePrinters.some((p) => p.printerType === "dejavoo_spin_p");
  const dejavooPrinter = visiblePrinters.find((p) => p.printerType === "dejavoo_spin_p") ?? null;
  const builtinPrinter = visiblePrinters.find((p) => p.printerType === "builtin_landi") ?? null;
  const receiptPrinters = visiblePrinters.filter(
    (p) => p.printerRole === "receipt",
  );
  const kitchenPrinters = visiblePrinters.filter(
    (p) => p.printerRole === "kitchen" || p.printerRole === "bar",
  );
  const connectedCount = visiblePrinters.filter((p) => p.isActive && p.isConnected).length;
  const totalActive = visiblePrinters.filter((p) => p.isActive).length;

  // Receipt settings state
  const [receiptSettings, setReceiptSettings] = useState<ReceiptSettings>({
    merchantCopies: 1,
    customerCopies: 1,
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
    printVoidTickets: true,
    showGuestCount: true,
    showModifiers: true,
    showCourseNumber: false,
    showServerName: true,
    largeFont: false,
    modifierStyle: "inverted",
  });

  // ---------------------------------------------------------------------------
  // HANDLERS
  // ---------------------------------------------------------------------------

  const handleRefreshCapabilities = async () => {
    setIsRefreshingCapabilities(true);
    try {
      const caps = await detectDeviceCapabilities();
      setDeviceCapabilities(caps);
    } catch (e) {
      console.warn("[PrintersKitchen] Failed to refresh capabilities:", e);
    } finally {
      setIsRefreshingCapabilities(false);
    }
  };

  const handlePullToRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        selectedStore?.id ? fetchPrinters(selectedStore.id) : Promise.resolve(),
        handleRefreshCapabilities(),
      ]);
    } catch (e) {
      console.warn("[PrintersKitchen] Pull-to-refresh failed:", e);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleProvisionDejavoo = async () => {
    if (!paymentTerminal || !selectedStation || !selectedStore) return;
    setIsProvisioning(true);
    setProvisioningError(null);
    try {
      const printerId = await ensureDejavooPrinterProvisioned(
        supabase,
        selectedStation.id,
        selectedStore.id,
        selectedStore.merchant_id,
        paymentTerminal,
      );
      if (printerId) {
        const verified = await verifyDejavooPrinter(supabase, printerId);
        await fetchPrinters(selectedStore.id);
        if (verified) {
          Alert.alert(
            "Terminal Connected",
            "The Dejavoo terminal printer has been successfully verified and is ready to use.",
          );
        } else {
          Alert.alert(
            "Verification Failed",
            "The printer was provisioned but verification failed. The terminal may come online later.",
          );
        }
      } else {
        setProvisioningError("Failed to provision printer. Check terminal credentials.");
      }
    } catch (e: any) {
      setProvisioningError(e.message || "Provisioning failed");
    } finally {
      setIsProvisioning(false);
    }
  };

  const handleScanStarPrinters = async () => {
    setIsScanningStar(true);
    setStarScanError(null);
    setDiscoveredStarPrinters([]);
    try {
      const printers = await discoverStarPrinters(10000);
      setDiscoveredStarPrinters(printers);
    } catch (e: any) {
      setStarScanError(e.message || "Discovery failed");
    } finally {
      setIsScanningStar(false);
    }
  };

  const handleProvisionStar = async (discovered: DiscoveredStarPrinter, roleOverride?: "receipt" | "kitchen") => {
    if (!selectedStation || !selectedStore) return;
    setProvisioningStarIp(discovered.ipAddress);
    try {
      const printerId = await provisionStarPrinter(
        supabase,
        selectedStation.id,
        selectedStore.id,
        selectedStore.merchant_id,
        discovered,
        roleOverride ?? starRoleOverrides[discovered.ipAddress] ?? discovered.capabilities.suggestedRole,
      );
      if (printerId) {
        const verified = await verifyStarPrinter(supabase, printerId);
        await fetchPrinters(selectedStore.id);
        if (verified) {
          Alert.alert(
            "Printer Connected",
            `${discovered.modelName} has been verified and is ready to use.`,
          );
        } else {
          Alert.alert(
            "Verification Failed",
            "The printer was added but verification failed. It may come online later.",
          );
        }
      } else {
        Alert.alert("Error", "Failed to provision printer.");
      }
    } catch (e: any) {
      Alert.alert("Error", e.message || "Provisioning failed");
    } finally {
      setProvisioningStarIp(null);
    }
  };

  const handleManualIpAdd = async () => {
    const ip = manualIp.trim();
    if (!ip) return;
    if (!selectedStation || !selectedStore) return;

    // Check for duplicate
    const alreadyExists = storedPrinters.some(
      (p) => p.printerType === "star_micronics" && p.networkAddress === ip && p.stationId === selectedStation?.id,
    );
    if (alreadyExists) {
      setManualIpError("A printer with this IP address is already configured.");
      return;
    }

    setIsProbing(true);
    setManualIpError(null);
    try {
      const discovered = await probeStarPrinterByIp(ip);
      const printerId = await provisionStarPrinter(
        supabase,
        selectedStation.id,
        selectedStore.id,
        selectedStore.merchant_id,
        discovered,
        manualIpRole,
      );
      if (printerId) {
        const verified = await verifyStarPrinter(supabase, printerId);
        await fetchPrinters(selectedStore.id);
        setManualIp("");
        setManualIpError(null);
        setAddingForRole(null);
        if (verified) {
          Alert.alert(
            "Printer Connected",
            `${discovered.modelName} at ${ip} has been verified and is ready to use.`,
          );
        } else {
          Alert.alert(
            "Verification Failed",
            "The printer was added but verification failed. It may come online later.",
          );
        }
      } else {
        setManualIpError("Failed to provision printer.");
      }
    } catch (e: any) {
      setManualIpError(e.message || "Failed to connect to printer");
    } finally {
      setIsProbing(false);
    }
  };

  const handleTestPrint = async (printer: PrinterConfig) => {
    setTestPrintingId(printer.id);
    try {
      if (testPrintType === "receipt") {
        await PrinterService.printTestReceipt(printer);
      } else if (testPrintType === "kitchen") {
        await PrinterService.printTestKitchenTicket(printer);
      } else {
        await PrinterService.printTestPage(printer);
      }
    } catch (e) {
      console.warn("[PrintersKitchen] Test print failed:", e);
    } finally {
      setTestPrintingId(null);
    }
  };

  const handleRetryConnection = async (printer: PrinterConfig) => {
    setRetryingPrinterId(printer.id);
    try {
      if (printer.printerType === "star_micronics" && printer.networkAddress) {
        const verified = await verifyStarPrinter(supabase, printer.id);
        if (selectedStore?.id) await fetchPrinters(selectedStore.id);
        setAlertModal({
          success: verified,
          title: verified ? "Printer Online" : "Connection Failed",
          message: verified
            ? `${printer.printerName} is connected and ready.`
            : `Could not reach ${printer.printerName}. Check that the printer is powered on and connected to the network.`,
        });
      } else if (printer.printerType === "dejavoo_spin_p") {
        const verified = await verifyDejavooPrinter(supabase, printer.id);
        if (selectedStore?.id) await fetchPrinters(selectedStore.id);
        setAlertModal({
          success: verified,
          title: verified ? "Printer Online" : "Connection Failed",
          message: verified
            ? `${printer.printerName} is connected and ready.`
            : `Could not reach ${printer.printerName}. Check terminal connection.`,
        });
      } else {
        await PrinterService.printTestPage(printer);
        if (selectedStore?.id) await fetchPrinters(selectedStore.id);
      }
    } catch (e: any) {
      setAlertModal({ success: false, title: "Connection Failed", message: e.message || "Unable to connect to printer." });
    } finally {
      setRetryingPrinterId(null);
    }
  };

  const handleSavePrinterEdits = async (printerId: string) => {
    const printer = storedPrinters.find((p) => p.id === printerId);
    setIsSavingPrinter(true);
    try {
      await updatePrinterConfig(printerId, {
        ...draftPrinterEdits,
        maxCharsPerLine: parseInt(draftMaxChars) || printer?.maxCharsPerLine,
        paperWidth: parseInt(draftPaperWidth) || printer?.paperWidth,
        printDensity: parseInt(draftDensity) || printer?.printDensity,
        copies: parseInt(draftCopies) || printer?.copies,
        networkAddress: draftNetworkAddress || printer?.networkAddress,
        networkPort: parseInt(draftNetworkPort) || printer?.networkPort,
        printLogo: draftPrintLogo,
        autoPrintReceipt: draftAutoPrintReceipt,
        printOrderTickets: draftPrintOrderTickets,
        graphicsOnly: draftGraphicsOnly,
        receiptHeader: draftReceiptHeader || null,
        receiptFooter: draftReceiptFooter || null,
        supportsAutoCut: draftSupportsAutoCut,
        supportsCashDrawerKick: draftSupportsCashDrawer,
        supportsBarcode: draftSupportsBarcode,
        supportsQrCode: draftSupportsQrCode,
        supportsLogo: draftSupportsLogo,
      });
      if (selectedStore?.id) {
        await fetchPrinters(selectedStore.id);
      }
      setEditingPrinterId(null);
      setDraftPrinterEdits({});
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to update printer");
    } finally {
      setIsSavingPrinter(false);
    }
  };

  const handleCancelPrinterEdits = () => {
    setEditingPrinterId(null);
    setDraftPrinterEdits({});
    setShowAdvanced(false);
    setShowCapabilities(false);
  };

  const handleStartAdding = (role: "receipt" | "kitchen") => {
    setAddingForRole(role);
    setManualIpRole(role);
    setManualIp("");
    setManualIpError(null);
    setDiscoveredStarPrinters([]);
    setStarScanError(null);
  };

  const handleCancelAdding = () => {
    setAddingForRole(null);
    setManualIp("");
    setManualIpError(null);
    setDiscoveredStarPrinters([]);
    setStarScanError(null);
  };

  const handleDeletePrinter = (printer: PrinterConfig) => {
    Alert.alert(
      "Delete Printer?",
      `This will permanently remove "${printer.printerName}". This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeletingPrinterId(printer.id);
            try {
              await deletePrinter(printer.id);
              setEditingPrinterId(null);
              if (selectedStore?.id) {
                await fetchPrinters(selectedStore.id);
              }
            } catch (e: any) {
              Alert.alert("Error", e.message || "Failed to delete printer");
            } finally {
              setDeletingPrinterId(null);
            }
          },
        },
      ],
    );
  };

  // ---------------------------------------------------------------------------
  // RENDER HELPERS
  // ---------------------------------------------------------------------------

  const renderCapBadge = (label: string, has: boolean) => (
    <View
      key={label}
      style={{
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
        marginRight: 6,
        marginBottom: 6,
        backgroundColor: has ? colors.success + "20" : colors.border + "80",
        borderWidth: 1,
        borderColor: has ? colors.success + "40" : colors.border,
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: "500", color: has ? colors.success : colors.muted }}>
        {label}
      </Text>
    </View>
  );

  const renderAddPrinterPanel = (forRole: "receipt" | "kitchen") => {
    const isReceipt = forRole === "receipt";
    const accentColor = isReceipt ? colors.teal : "#f97316";
    return (
      <View style={{
        backgroundColor: colors.card,
        padding: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        marginBottom: 10,
      }}>
        {/* Header + Cancel */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Plus size={14} color={accentColor} />
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.heading }}>
              Add {isReceipt ? "Receipt" : "Kitchen"} Printer by IP
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleCancelAdding}
            style={{ padding: 6, backgroundColor: colors.panel, borderRadius: 6 }}
          >
            <XCircle size={14} color={colors.label} />
          </TouchableOpacity>
        </View>
        <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 10 }}>
          Enter the IP address from the printer's configuration receipt.
        </Text>
        <TextInput
          value={manualIp}
          onChangeText={(t) => {
            setManualIp(t);
            if (manualIpError) setManualIpError(null);
          }}
          placeholder="192.168.1.100"
          placeholderTextColor={colors.muted}
          keyboardType="numeric"
          style={{
            backgroundColor: colors.panel,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 9,
            fontSize: 13,
            color: colors.heading,
            marginBottom: 10,
          }}
          editable={!isProbing}
        />
        {manualIpError && (
          <View style={{ backgroundColor: colors.danger + "12", borderWidth: 1, borderColor: colors.danger + "30", borderRadius: 8, padding: 10, marginBottom: 10 }}>
            <Text style={{ fontSize: 11, color: colors.danger }}>{manualIpError}</Text>
          </View>
        )}
        <View style={{ flexDirection: "row", marginBottom: 10, gap: 8 }}>
          <TouchableOpacity
            onPress={handleManualIpAdd}
            disabled={isProbing || !manualIp.trim()}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 8,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: isProbing || !manualIp.trim() ? colors.border : accentColor + "20",
              borderWidth: 1,
              borderColor: isProbing || !manualIp.trim() ? colors.border : accentColor + "60",
            }}
          >
            {isProbing ? (
              <ActivityIndicator size="small" color={accentColor} />
            ) : (
              <>
                <Wifi size={14} color={isProbing || !manualIp.trim() ? colors.muted : accentColor} />
                <Text style={{ fontSize: 12, fontWeight: "600", marginLeft: 6, color: isProbing || !manualIp.trim() ? colors.muted : accentColor }}>Connect</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleScanStarPrinters}
            disabled={isScanningStar}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 8,
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            {isScanningStar ? (
              <ActivityIndicator size="small" color={colors.teal} />
            ) : (
              <>
                <Wifi size={13} color={colors.teal} />
                <Text style={{ fontSize: 12, fontWeight: "600", marginLeft: 5, color: colors.teal }}>Scan</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Star Discovery results (inline) */}
        {isScanningStar && (
          <View style={{ alignItems: "center", paddingVertical: 16 }}>
            <ActivityIndicator size="large" color={accentColor} />
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 10 }}>Scanning for Star printers...</Text>
          </View>
        )}

        {starScanError && (
          <View style={{ backgroundColor: colors.danger + "12", borderWidth: 1, borderColor: colors.danger + "30", borderRadius: 8, padding: 10, marginBottom: 10 }}>
            <Text style={{ fontSize: 12, color: colors.danger }}>{starScanError}</Text>
          </View>
        )}

        {discoveredStarPrinters.map((dp) => {
          const alreadyAdded = storedPrinters.some(
            (p) => p.printerType === "star_micronics" && p.networkAddress === dp.ipAddress && p.stationId === selectedStation?.id,
          );
          const isProvisioningThis = provisioningStarIp === dp.ipAddress;

          return (
            <View
              key={dp.ipAddress}
              style={{
                backgroundColor: colors.panel,
                padding: 10,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                marginBottom: 6,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Printer size={13} color={accentColor} />
                    <Text style={{ fontSize: 12, fontWeight: "600", color: colors.heading, marginLeft: 6 }}>{dp.modelName}</Text>
                    {alreadyAdded && (
                      <View style={{ backgroundColor: colors.success + "20", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 6 }}>
                        <Text style={{ fontSize: 10, fontWeight: "600", color: colors.success }}>Added</Text>
                      </View>
                    )}
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", marginTop: 3 }}>
                    <Wifi size={10} color={colors.muted} />
                    <Text style={{ fontSize: 11, color: colors.muted, marginLeft: 4 }}>{dp.ipAddress}</Text>
                    {dp.macAddress && (
                      <Text style={{ fontSize: 10, color: colors.muted, marginLeft: 10 }}>{dp.macAddress}</Text>
                    )}
                  </View>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 4, gap: 4 }}>
                    <View style={{ backgroundColor: colors.border, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                      <Text style={{ fontSize: 10, color: colors.label }}>{dp.capabilities.paperWidth}mm</Text>
                    </View>
                    <View style={{ backgroundColor: colors.border, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                      <Text style={{ fontSize: 10, color: colors.label }}>{dp.capabilities.maxCharsPerLine} chars</Text>
                    </View>
                    <View style={{ backgroundColor: colors.border, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                      <Text style={{ fontSize: 10, color: colors.label }}>{dp.capabilities.supportsAutoCut ? "Auto-cut" : "Tear-off"}</Text>
                    </View>
                  </View>
                </View>
                {!alreadyAdded && (
                  <TouchableOpacity
                    onPress={() => handleProvisionStar(dp, forRole)}
                    disabled={isProvisioningThis}
                    style={{
                      marginLeft: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 8,
                      backgroundColor: accentColor + "20",
                      borderWidth: 1,
                      borderColor: accentColor + "50",
                    }}
                  >
                    {isProvisioningThis ? (
                      <ActivityIndicator size="small" color={accentColor} />
                    ) : (
                      <Text style={{ fontSize: 12, fontWeight: "600", color: accentColor }}>Add</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}

        {/* Dejavoo provisioning — only in receipt panel */}
        {isReceipt && paymentTerminal?.terminal_type === "dejavoo" && !hasDejavooPrinter && (
          <View style={{ backgroundColor: colors.panel, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, marginTop: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
              <CreditCard size={13} color="#a78bfa" />
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.heading, marginLeft: 6 }}>Dejavoo Terminal Printer</Text>
            </View>
            <TouchableOpacity
              onPress={handleProvisionDejavoo}
              disabled={isProvisioning}
              style={{
                paddingVertical: 8,
                borderRadius: 8,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.teal + "20",
                borderWidth: 1,
                borderColor: colors.teal + "50",
              }}
            >
              {isProvisioning ? (
                <ActivityIndicator size="small" color={colors.teal} />
              ) : (
                <>
                  <Plus size={13} color={colors.teal} />
                  <Text style={{ fontSize: 12, fontWeight: "600", color: colors.teal, marginLeft: 6 }}>Provision Dejavoo</Text>
                </>
              )}
            </TouchableOpacity>
            {provisioningError && (
              <Text style={{ fontSize: 11, color: colors.danger, marginTop: 6 }}>{provisioningError}</Text>
            )}
          </View>
        )}
      </View>
    );
  };

  const renderPrinterCard = (printer: PrinterConfig) => {
    const role = getRoleBadge(printer.printerRole);
    const isTestPrinting = testPrintingId === printer.id;
    const isEditing = editingPrinterId === printer.id;
    const statusColor = getPrinterStatusColor(printer);

    const statusLabel = getPrinterStatusLabel(printer);

    return (
      <View
        key={printer.id}
        style={{
          backgroundColor: colors.card,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: printer.isActive ? colors.border : colors.border + "60",
          marginBottom: 8,
          opacity: printer.isActive ? 1 : 0.65,
        }}
      >
      {/* ── Card row ── */}
      <View style={{ paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", overflow: "hidden" }}>

        {/* Col 1 — Printer icon box (always teal) */}
        <View style={{
          width: 30, height: 30, borderRadius: 7,
          backgroundColor: colors.teal + "15",
          alignItems: "center", justifyContent: "center",
          marginRight: 10, flexShrink: 0,
        }}>
          <Printer size={14} color={colors.teal} />
        </View>

        {/* Col 2 — Name + status badge (with error count) + IP */}
        <View style={{ width: 180, flexShrink: 0, marginRight: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.heading, flexShrink: 1 }} numberOfLines={1}>
              {printer.printerName}
            </Text>
            {/* Status + optional error count badge */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3, flexShrink: 0 }}>
              <View style={{
                flexDirection: "row", alignItems: "center", gap: 3,
                backgroundColor: statusColor + "20",
                borderWidth: 1, borderColor: statusColor + "50",
                paddingHorizontal: 6, paddingVertical: 1, borderRadius: 20,
              }}>
                {getPrinterStatusIcon(printer)}
                <Text style={{ fontSize: 10, fontWeight: "600", color: statusColor }}>{statusLabel}</Text>
              </View>
              {printer.errorCount > 0 && (
                <View style={{
                  backgroundColor: colors.warning + "25",
                  borderWidth: 1, borderColor: colors.warning + "60",
                  borderRadius: 20, minWidth: 16, height: 16,
                  alignItems: "center", justifyContent: "center",
                  paddingHorizontal: 4,
                }}>
                  <Text style={{ fontSize: 9, fontWeight: "700", color: colors.warning }}>{printer.errorCount}</Text>
                </View>
              )}
            </View>
          </View>
          <Text style={{ fontSize: 10, color: colors.label, marginTop: 2 }} numberOfLines={1}>
            {printer.networkAddress || printer.connectionType.toUpperCase()}
          </Text>
        </View>

        {/* Col 3 — Role pills + last print (right-aligned, no wrap) */}
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6, overflow: "hidden" }}>
          <View style={{
            flexShrink: 0,
            backgroundColor: role.bg,
            borderWidth: 1, borderColor: role.text + "60",
            paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20,
          }}>
            <Text style={{ fontSize: 10, fontWeight: "600", color: role.text }}>{role.label}</Text>
          </View>
          {printer.isDefaultReceipt && printer.printerRole !== "receipt" && (
            <View style={{
              flexShrink: 0, backgroundColor: colors.teal + "15",
              borderWidth: 1, borderColor: colors.teal + "40",
              paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20,
            }}>
              <Text style={{ fontSize: 10, fontWeight: "600", color: colors.teal }}>Receipt</Text>
            </View>
          )}
          {printer.isDefaultKitchen && printer.printerRole !== "kitchen" && (
            <View style={{
              flexShrink: 0, backgroundColor: colors.teal + "15",
              borderWidth: 1, borderColor: colors.teal + "40",
              paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20,
            }}>
              <Text style={{ fontSize: 10, fontWeight: "600", color: colors.teal }}>Kitchen</Text>
            </View>
          )}
          {printer.lastPrintAt ? (
            <Text style={{ fontSize: 10, color: colors.muted, flexShrink: 1 }} numberOfLines={1}>
              Last print: {getRelativeTime(printer.lastPrintAt)}
            </Text>
          ) : null}
        </View>

        {/* Col 4 — Action buttons */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0, marginLeft: 10 }}>
          {!printer.isConnected && (
            <TouchableOpacity
              onPress={() => handleRetryConnection(printer)}
              disabled={retryingPrinterId === printer.id}
              style={{
                padding: 6,
                backgroundColor: colors.teal + "15",
                borderWidth: 1, borderColor: colors.teal + "40",
                borderRadius: 7,
              }}
            >
              {retryingPrinterId === printer.id
                ? <ActivityIndicator size="small" color={colors.teal} />
                : <RefreshCw size={12} color={colors.teal} />}
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => {
              if (isEditing) {
                handleCancelPrinterEdits();
              } else {
                setDraftPrinterEdits({});
                setEditingPrinterId(printer.id);
              }
            }}
            style={{
              flexDirection: "row", alignItems: "center", gap: 4,
              paddingHorizontal: 9, paddingVertical: 5,
              backgroundColor: isEditing ? colors.teal + "30" : colors.teal + "15",
              borderWidth: 1, borderColor: isEditing ? colors.teal + "70" : colors.teal + "40",
              borderRadius: 7,
            }}
          >
            <Settings2 size={12} color={colors.teal} />
            <Text style={{ fontSize: 11, fontWeight: "600", color: colors.teal }}>{isEditing ? "Close" : "Configure"}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleTestPrint(printer)}
            disabled={isTestPrinting}
            style={{
              flexDirection: "row", alignItems: "center", gap: 4,
              paddingHorizontal: 9, paddingVertical: 5,
              backgroundColor: colors.teal + "15",
              borderWidth: 1, borderColor: colors.teal + "40",
              borderRadius: 7,
            }}
          >
            {isTestPrinting
              ? <ActivityIndicator size="small" color={colors.teal} />
              : <Printer size={12} color={colors.teal} />}
            <Text style={{ fontSize: 11, fontWeight: "600", color: colors.teal }}>Test Print</Text>
          </TouchableOpacity>
        </View>

      </View>

        {/* Expandable Edit Panel */}
        {isEditing && (() => {

          const draftRole = draftPrinterEdits.printerRole ?? printer.printerRole;
          const draftDefaultReceipt = draftPrinterEdits.isDefaultReceipt ?? printer.isDefaultReceipt;
          const draftDefaultKitchen = draftPrinterEdits.isDefaultKitchen ?? printer.isDefaultKitchen;
          const draftActive = draftPrinterEdits.isActive ?? printer.isActive;
          const hasPendingChanges = true; // always allow save (advanced fields always included)

          return (
          <View style={{
            marginHorizontal: 16, marginBottom: 14,
            paddingTop: 16, paddingHorizontal: 16, paddingBottom: 16,
            borderTopWidth: 1, borderTopColor: colors.border,
            backgroundColor: colors.screen,
            borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
          }}>

            {/* Role Selector */}
            <Text style={{ fontSize: 10, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>
              Printer Role
            </Text>
            <View style={{
              flexDirection: "row", gap: 6, marginBottom: 16,
            }}>
              {(["receipt", "kitchen", "bar", "label"] as const).map((r) => {
                const badge = getRoleBadge(r);
                const isSelected = draftRole === r;
                return (
                  <TouchableOpacity
                    key={r}
                    onPress={() => setDraftPrinterEdits((prev) => ({ ...prev, printerRole: r }))}
                    disabled={isSavingPrinter}
                    style={{
                      flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center",
                      backgroundColor: isSelected ? colors.teal + "20" : "transparent",
                      borderWidth: 1,
                      borderColor: isSelected ? colors.teal + "60" : colors.border,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "600", color: isSelected ? colors.teal : colors.label }}>
                      {badge.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Default Receipt toggle */}
            {draftRole === "receipt" && (
              <View style={{
                flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                paddingHorizontal: 12, paddingVertical: 10,
                backgroundColor: colors.card, borderRadius: 8, borderWidth: 1, borderColor: colors.border,
                marginBottom: 8,
              }}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={{ fontSize: 13, color: colors.heading, fontWeight: "500" }}>Default Receipt Printer</Text>
                  <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>Used for all receipt printing</Text>
                </View>
                <Switch
                  checked={draftDefaultReceipt}
                  onCheckedChange={(v) => setDraftPrinterEdits((prev) => ({ ...prev, isDefaultReceipt: v }))}
                />
              </View>
            )}

            {/* Default Kitchen toggle + Routing */}
            {(draftRole === "kitchen" || draftRole === "bar") && (
              <>
                <View style={{
                  flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                  paddingHorizontal: 12, paddingVertical: 10,
                  backgroundColor: colors.card, borderRadius: 8, borderWidth: 1, borderColor: colors.border,
                  marginBottom: 8,
                }}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={{ fontSize: 13, color: colors.heading, fontWeight: "500" }}>Default Kitchen Printer</Text>
                    <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>Used for all kitchen ticket printing</Text>
                  </View>
                  <Switch
                    checked={draftDefaultKitchen}
                    onCheckedChange={(v) => setDraftPrinterEdits((prev) => ({ ...prev, isDefaultKitchen: v }))}
                  />
                </View>

                <TouchableOpacity
                  onPress={() => setRoutingModalPrinter(printer)}
                  style={{
                    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                    paddingHorizontal: 12, paddingVertical: 10,
                    backgroundColor: colors.card, borderRadius: 8, borderWidth: 1, borderColor: colors.border,
                    marginBottom: 8,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 7, backgroundColor: colors.teal + "15", alignItems: "center", justifyContent: "center" }}>
                      <Route size={14} color={colors.teal} />
                    </View>
                    <View>
                      <Text style={{ fontSize: 13, color: colors.heading, fontWeight: "500" }}>Configure Routing</Text>
                      <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1, textTransform: "capitalize" }}>
                        Mode: {printer.routingMode}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: colors.teal }}>Edit →</Text>
                </TouchableOpacity>
              </>
            )}

            {/* ── Advanced Settings Collapsible ── */}
            <TouchableOpacity
              onPress={() => setShowAdvanced((v) => !v)}
              style={{
                flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                paddingHorizontal: 12, paddingVertical: 10,
                backgroundColor: colors.card, borderRadius: 8, borderWidth: 1, borderColor: colors.border,
                marginBottom: showAdvanced ? 0 : 8,
              }}
            >
              <Text style={{ fontSize: 13, color: colors.heading, fontWeight: "500" }}>Advanced Settings</Text>
              <Text style={{ fontSize: 14, color: colors.teal }}>{showAdvanced ? "▲" : "▼"}</Text>
            </TouchableOpacity>

            {showAdvanced && (
              <View style={{
                backgroundColor: colors.panel, borderRadius: 8,
                borderWidth: 1, borderColor: colors.border,
                padding: 12, marginBottom: 8,
              }}>

                {/* Group A — Print Settings */}
                <Text style={{ fontSize: 10, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>
                  Print Settings
                </Text>

                {/* Max Chars Per Line */}
                <View style={{ marginBottom: 10 }}>
                  <Text style={{ fontSize: 11, color: colors.label, marginBottom: 4 }}>Max Chars Per Line</Text>
                  <TextInput
                    value={draftMaxChars}
                    onChangeText={setDraftMaxChars}
                    keyboardType="numeric"
                    placeholder={String(printer.maxCharsPerLine)}
                    placeholderTextColor={colors.muted}
                    style={{
                      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
                      borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8,
                      fontSize: 13, color: colors.heading, marginBottom: 6,
                    }}
                  />
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    {[32, 40, 42, 48].map((v) => (
                      <TouchableOpacity
                        key={v}
                        onPress={() => setDraftMaxChars(String(v))}
                        style={{
                          paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6,
                          backgroundColor: draftMaxChars === String(v) ? colors.teal + "25" : colors.card,
                          borderWidth: 1,
                          borderColor: draftMaxChars === String(v) ? colors.teal + "60" : colors.border,
                        }}
                      >
                        <Text style={{ fontSize: 12, color: draftMaxChars === String(v) ? colors.teal : colors.label }}>{v}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Paper Width */}
                <View style={{ marginBottom: 10 }}>
                  <Text style={{ fontSize: 11, color: colors.label, marginBottom: 4 }}>Paper Width (mm)</Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {[58, 80].map((v) => (
                      <TouchableOpacity
                        key={v}
                        onPress={() => setDraftPaperWidth(String(v))}
                        style={{
                          flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center",
                          backgroundColor: draftPaperWidth === String(v) ? colors.teal + "20" : colors.card,
                          borderWidth: 1,
                          borderColor: draftPaperWidth === String(v) ? colors.teal + "60" : colors.border,
                        }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: "600", color: draftPaperWidth === String(v) ? colors.teal : colors.label }}>{v}mm</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Density + Copies */}
                <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, color: colors.label, marginBottom: 4 }}>Print Density (1–10)</Text>
                    <TextInput
                      value={draftDensity}
                      onChangeText={setDraftDensity}
                      keyboardType="numeric"
                      placeholder={String(printer.printDensity)}
                      placeholderTextColor={colors.muted}
                      style={{
                        backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
                        borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8,
                        fontSize: 13, color: colors.heading,
                      }}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, color: colors.label, marginBottom: 4 }}>Copies (1–5)</Text>
                    <TextInput
                      value={draftCopies}
                      onChangeText={setDraftCopies}
                      keyboardType="numeric"
                      placeholder={String(printer.copies)}
                      placeholderTextColor={colors.muted}
                      style={{
                        backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
                        borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8,
                        fontSize: 13, color: colors.heading,
                      }}
                    />
                  </View>
                </View>

                {/* Group B — Content Flags */}
                <Text style={{ fontSize: 10, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8, marginTop: 4 }}>
                  Content Flags
                </Text>
                {[
                  { label: "Print Logo", value: draftPrintLogo, set: setDraftPrintLogo },
                  { label: "Auto-Print Receipt", value: draftAutoPrintReceipt, set: setDraftAutoPrintReceipt },
                  { label: "Print Order Tickets", value: draftPrintOrderTickets, set: setDraftPrintOrderTickets },
                  { label: "Graphics-Only Mode", value: draftGraphicsOnly, set: setDraftGraphicsOnly },
                ].map(({ label, value, set }) => (
                  <View key={label} style={{
                    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                    paddingHorizontal: 10, paddingVertical: 8,
                    backgroundColor: colors.card, borderRadius: 7, borderWidth: 1, borderColor: colors.border,
                    marginBottom: 4,
                  }}>
                    <Text style={{ fontSize: 12, color: colors.heading }}>{label}</Text>
                    <Switch checked={value} onCheckedChange={set} />
                  </View>
                ))}

                {/* Group C — Receipt Customization */}
                <Text style={{ fontSize: 10, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8, marginTop: 8 }}>
                  Receipt Customization
                </Text>
                <View style={{ marginBottom: 8 }}>
                  <Text style={{ fontSize: 11, color: colors.label, marginBottom: 4 }}>Receipt Header</Text>
                  <TextInput
                    value={draftReceiptHeader}
                    onChangeText={setDraftReceiptHeader}
                    placeholder="Optional header text"
                    placeholderTextColor={colors.muted}
                    multiline
                    style={{
                      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
                      borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8,
                      fontSize: 13, color: colors.heading, minHeight: 50,
                    }}
                  />
                </View>
                <View style={{ marginBottom: 8 }}>
                  <Text style={{ fontSize: 11, color: colors.label, marginBottom: 4 }}>Receipt Footer</Text>
                  <TextInput
                    value={draftReceiptFooter}
                    onChangeText={setDraftReceiptFooter}
                    placeholder="Optional footer text"
                    placeholderTextColor={colors.muted}
                    multiline
                    style={{
                      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
                      borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8,
                      fontSize: 13, color: colors.heading, minHeight: 50,
                    }}
                  />
                </View>

                {/* Group D — Connection (network printers only) */}
                {printer.networkAddress && (
                  <>
                    <Text style={{ fontSize: 10, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8, marginTop: 4 }}>
                      Connection
                    </Text>
                    <View style={{ flexDirection: "row", gap: 10, marginBottom: 8 }}>
                      <View style={{ flex: 2 }}>
                        <Text style={{ fontSize: 11, color: colors.label, marginBottom: 4 }}>IP Address</Text>
                        <TextInput
                          value={draftNetworkAddress}
                          onChangeText={setDraftNetworkAddress}
                          placeholder={printer.networkAddress}
                          placeholderTextColor={colors.muted}
                          keyboardType="numeric"
                          style={{
                            backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
                            borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8,
                            fontSize: 13, color: colors.heading,
                          }}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 11, color: colors.label, marginBottom: 4 }}>Port</Text>
                        <TextInput
                          value={draftNetworkPort}
                          onChangeText={setDraftNetworkPort}
                          placeholder={String(printer.networkPort ?? 9100)}
                          placeholderTextColor={colors.muted}
                          keyboardType="numeric"
                          style={{
                            backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
                            borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8,
                            fontSize: 13, color: colors.heading,
                          }}
                        />
                      </View>
                    </View>
                  </>
                )}

                {/* Group E — Hardware Capabilities (collapsible sub-section) */}
                <TouchableOpacity
                  onPress={() => setShowCapabilities((v) => !v)}
                  style={{
                    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                    paddingHorizontal: 10, paddingVertical: 8,
                    backgroundColor: colors.card, borderRadius: 7, borderWidth: 1, borderColor: colors.border,
                    marginTop: 8,
                  }}
                >
                  <Text style={{ fontSize: 12, color: colors.heading, fontWeight: "500" }}>Hardware Capabilities</Text>
                  <Text style={{ fontSize: 13, color: colors.muted }}>{showCapabilities ? "▲" : "▼"}</Text>
                </TouchableOpacity>

                {showCapabilities && (
                  <View style={{ marginTop: 4 }}>
                    <View style={{
                      backgroundColor: colors.warning + "12", borderWidth: 1, borderColor: colors.warning + "30",
                      borderRadius: 7, padding: 8, marginBottom: 6,
                    }}>
                      <Text style={{ fontSize: 11, color: colors.warning }}>Override printer hardware capabilities — use with caution.</Text>
                    </View>
                    {[
                      { label: "Supports Auto-Cut", value: draftSupportsAutoCut, set: setDraftSupportsAutoCut },
                      { label: "Supports Cash Drawer", value: draftSupportsCashDrawer, set: setDraftSupportsCashDrawer },
                      { label: "Supports Barcode", value: draftSupportsBarcode, set: setDraftSupportsBarcode },
                      { label: "Supports QR Code", value: draftSupportsQrCode, set: setDraftSupportsQrCode },
                      { label: "Supports Logo", value: draftSupportsLogo, set: setDraftSupportsLogo },
                    ].map(({ label, value, set }) => (
                      <View key={label} style={{
                        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                        paddingHorizontal: 10, paddingVertical: 8,
                        backgroundColor: colors.card, borderRadius: 7, borderWidth: 1, borderColor: colors.border,
                        marginBottom: 4,
                      }}>
                        <Text style={{ fontSize: 12, color: colors.heading }}>{label}</Text>
                        <Switch checked={value} onCheckedChange={set} />
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Active toggle */}
            <View style={{
              flexDirection: "row", alignItems: "center", justifyContent: "space-between",
              paddingHorizontal: 12, paddingVertical: 10,
              backgroundColor: colors.card, borderRadius: 8, borderWidth: 1, borderColor: colors.border,
              marginBottom: 16,
            }}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ fontSize: 13, color: colors.heading, fontWeight: "500" }}>Printer Active</Text>
                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>Enable or disable this printer</Text>
              </View>
              <Switch
                checked={draftActive}
                onCheckedChange={(v) => setDraftPrinterEdits((prev) => ({ ...prev, isActive: v }))}
              />
            </View>

            {/* Save / Cancel */}
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
              <TouchableOpacity
                onPress={handleCancelPrinterEdits}
                disabled={isSavingPrinter}
                style={{
                  flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: "center",
                  borderWidth: 1, borderColor: colors.border, backgroundColor: "transparent",
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "600", color: colors.label }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleSavePrinterEdits(printer.id)}
                disabled={isSavingPrinter || !hasPendingChanges}
                style={{
                  flex: 2, paddingVertical: 9, borderRadius: 8,
                  alignItems: "center", justifyContent: "center",
                  backgroundColor: hasPendingChanges ? colors.teal + "20" : colors.teal + "08",
                  borderWidth: 1,
                  borderColor: hasPendingChanges ? colors.teal + "50" : colors.teal + "20",
                }}
              >
                {isSavingPrinter
                  ? <ActivityIndicator size="small" color={colors.teal} />
                  : <Text style={{ fontSize: 12, fontWeight: "600", color: hasPendingChanges ? colors.teal : colors.muted }}>Save Changes</Text>
                }
              </TouchableOpacity>
            </View>

            {/* Delete */}
            <TouchableOpacity
              onPress={() => handleDeletePrinter(printer)}
              disabled={deletingPrinterId === printer.id}
              style={{
                paddingVertical: 9, borderRadius: 8,
                backgroundColor: colors.danger + "10",
                borderWidth: 1, borderColor: colors.danger + "30",
                flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
              }}
            >
              {deletingPrinterId === printer.id
                ? <ActivityIndicator size="small" color={colors.danger} />
                : <>
                    <Trash2 size={13} color={colors.danger} />
                    <Text style={{ fontSize: 12, fontWeight: "600", color: colors.danger }}>Delete Printer</Text>
                  </>
              }
            </TouchableOpacity>
          </View>
          );
        })()}
      </View>
    );
  };

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
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handlePullToRefresh}
            tintColor={colors.teal}
          />
        }
      >
        {/* ============================================================== */}
        {/* PRINTER LIST TAB                                                */}
        {/* ============================================================== */}
        {activeTab === "printers" && (
          <View>
            {/* Status line + Scan button */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{
                  width: 7, height: 7, borderRadius: 4,
                  backgroundColor: connectedCount === totalActive && totalActive > 0 ? colors.success
                    : connectedCount > 0 ? colors.warning : colors.danger,
                }} />
                <Text style={{ fontSize: 12, fontWeight: "600", color: colors.heading }}>
                  {connectedCount}/{totalActive} {totalActive === 1 ? "printer" : "printers"} connected
                </Text>
                {connectedCount < totalActive && totalActive > 0 && (
                  <Text style={{ fontSize: 11, color: colors.muted }}>· {totalActive - connectedCount} offline</Text>
                )}
              </View>
              <TouchableOpacity
                onPress={handleScanStarPrinters}
                disabled={isScanningStar}
                style={{
                  backgroundColor: colors.teal + "15",
                  borderWidth: 1,
                  borderColor: colors.teal + "40",
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 8,
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                {isScanningStar ? (
                  <ActivityIndicator size="small" color={colors.teal} />
                ) : (
                  <>
                    <Wifi size={12} color={colors.teal} />
                    <Text style={{ fontSize: 11, fontWeight: "600", color: colors.teal, marginLeft: 5 }}>Scan Network</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* Station / Location scope toggle */}
            <View style={{
              flexDirection: "row",
              backgroundColor: colors.card,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border,
              overflow: "hidden",
              marginBottom: 10,
            }}>
              {([
                { key: "station" as const, label: "This Station" },
                { key: "location" as const, label: "All Printers" },
              ]).map(({ key, label }) => (
                <TouchableOpacity
                  key={key}
                  onPress={() => setPrinterScope(key)}
                  style={{
                    flex: 1,
                    paddingVertical: 8,
                    alignItems: "center",
                    backgroundColor: printerScope === key ? colors.teal + "20" : "transparent",
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "600", color: printerScope === key ? colors.teal : colors.label }}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Print Queue Banner */}
            {(queuedJobCount > 0 || failedJobCount > 0) && (
              <View style={{
                backgroundColor: failedJobCount > 0 ? colors.danger + "12" : colors.teal + "10",
                borderWidth: 1,
                borderColor: failedJobCount > 0 ? colors.danger + "35" : colors.teal + "35",
                borderRadius: 10,
                paddingHorizontal: 14,
                paddingVertical: 10,
                marginBottom: 12,
              }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Zap size={14} color={failedJobCount > 0 ? colors.danger : colors.teal} />
                  <Text style={{ fontSize: 12, fontWeight: "600", color: failedJobCount > 0 ? colors.danger : colors.teal }}>
                    Print Queue
                  </Text>
                  <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12 }}>
                    {queuedJobCount > 0 && (
                      <Text style={{ fontSize: 12, color: colors.teal, fontWeight: "600" }}>{queuedJobCount} queued</Text>
                    )}
                    {failedJobCount > 0 && (
                      <Text style={{ fontSize: 12, color: colors.danger, fontWeight: "600" }}>{failedJobCount} failed</Text>
                    )}
                  </View>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {failedJobCount > 0 && (
                      <TouchableOpacity
                        onPress={() => {
                          const count = usePrintQueueStore.getState().retryAllFailed();
                          if (count > 0) {
                            toastService.show({ title: "Retrying", message: `${count} failed jobs re-queued`, type: "info", duration: 3000 });
                          }
                        }}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                          paddingHorizontal: 10,
                          paddingVertical: 5,
                          backgroundColor: colors.teal + "20",
                          borderRadius: 6,
                          borderWidth: 1,
                          borderColor: colors.teal + "40",
                        }}
                      >
                        <RefreshCw size={12} color={colors.teal} />
                        <Text style={{ fontSize: 11, fontWeight: "600", color: colors.teal }}>Retry All</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      onPress={() => {
                        usePrintQueueStore.getState().clearAll();
                        toastService.show({ title: "Queue Cleared", message: "All print jobs removed", type: "info", duration: 3000 });
                      }}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        backgroundColor: colors.danger + "20",
                        borderRadius: 6,
                        borderWidth: 1,
                        borderColor: colors.danger + "40",
                      }}
                    >
                      <Trash2 size={12} color={colors.danger} />
                      <Text style={{ fontSize: 11, fontWeight: "600", color: colors.danger }}>Clear Queue</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            {/* RECEIPT PRINTERS SECTION */}
            <SectionHeader
              title="Receipt Printers"
              rightContent={
                addingForRole !== "receipt" && (
                  <TouchableOpacity
                    onPress={() => handleStartAdding("receipt")}
                    style={{
                      flexDirection: "row", alignItems: "center", gap: 5,
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      backgroundColor: colors.teal + "18",
                      borderWidth: 1,
                      borderColor: colors.teal + "45",
                      borderRadius: 6,
                    }}
                  >
                    <Plus size={14} color={colors.teal} />
                    <Text style={{ fontSize: 11, fontWeight: "600", color: colors.teal }}>Add Printer</Text>
                  </TouchableOpacity>
                )
              }
            />
            {receiptPrinters.length === 0 && addingForRole !== "receipt" && (
              <View style={{
                backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border,
                paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
                flexDirection: "row", alignItems: "center", gap: 8,
              }}>
                <Printer size={14} color={colors.muted} />
                <Text style={{ fontSize: 12, color: colors.muted }}>No receipt printers configured</Text>
              </View>
            )}
            {receiptPrinters.map(renderPrinterCard)}
            {addingForRole === "receipt" && (
              renderAddPrinterPanel("receipt")
            )}

            {/* KITCHEN & BAR PRINTERS SECTION */}
            <SectionHeader
              title="Kitchen & Bar Printers"
              rightContent={
                addingForRole !== "kitchen" && (
                  <TouchableOpacity
                    onPress={() => handleStartAdding("kitchen")}
                    style={{
                      flexDirection: "row", alignItems: "center", gap: 5,
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      backgroundColor: colors.teal + "18",
                      borderWidth: 1,
                      borderColor: colors.teal + "45",
                      borderRadius: 6,
                    }}
                  >
                    <Plus size={14} color={colors.teal} />
                    <Text style={{ fontSize: 11, fontWeight: "600", color: colors.teal }}>Add Printer</Text>
                  </TouchableOpacity>
                )
              }
            />
            {kitchenPrinters.length === 0 && addingForRole !== "kitchen" && (
              <View style={{
                backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border,
                paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
                flexDirection: "row", alignItems: "center", gap: 8,
              }}>
                <Printer size={14} color={colors.muted} />
                <Text style={{ fontSize: 12, color: colors.muted }}>No kitchen printers configured</Text>
              </View>
            )}
            {kitchenPrinters.map(renderPrinterCard)}
            {addingForRole === "kitchen" && (
              renderAddPrinterPanel("kitchen")
            )}
          </View>
        )}

        {/* ============================================================== */}
        {/* RECEIPT SETTINGS TAB                                            */}
        {/* ============================================================== */}
        {activeTab === "receipt" && (
          <View>
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
              value={kitchenSettings.printVoidTickets}
              onToggle={() => setKitchenSettings((prev) => ({ ...prev, printVoidTickets: !prev.printVoidTickets }))}
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

      {/* Connection Alert Modal */}
      <Modal visible={!!alertModal} transparent animationType="fade" onRequestClose={() => setAlertModal(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" }}>
          <View style={{
            width: 320, backgroundColor: colors.panel,
            borderRadius: 14, borderWidth: 1, borderColor: colors.border,
            overflow: "hidden",
          }}>
            {/* Colour strip */}
            <View style={{
              height: 4,
              backgroundColor: alertModal?.success ? colors.teal : colors.danger,
            }} />
            <View style={{ padding: 20 }}>
              {/* Icon + title */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <View style={{
                  width: 32, height: 32, borderRadius: 8,
                  backgroundColor: (alertModal?.success ? colors.teal : colors.danger) + "20",
                  alignItems: "center", justifyContent: "center",
                }}>
                  {alertModal?.success
                    ? <Printer size={16} color={colors.teal} />
                    : <AlertTriangle size={16} color={colors.danger} />}
                </View>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.heading, flex: 1 }}>
                  {alertModal?.title}
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: colors.label, lineHeight: 18, marginBottom: 20 }}>
                {alertModal?.message}
              </Text>
              <TouchableOpacity
                onPress={() => setAlertModal(null)}
                style={{
                  paddingVertical: 9, borderRadius: 8, alignItems: "center",
                  backgroundColor: (alertModal?.success ? colors.teal : colors.danger) + "20",
                  borderWidth: 1, borderColor: (alertModal?.success ? colors.teal : colors.danger) + "50",
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: alertModal?.success ? colors.teal : colors.danger }}>
                  Dismiss
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default PrintersKitchenScreen;
