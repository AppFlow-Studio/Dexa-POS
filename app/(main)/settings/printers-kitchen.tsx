import {
  AlertTriangle,
  Bluetooth,
  CheckCircle2,
  ChefHat,
  ChevronDown,
  Cpu,
  CreditCard,
  FileText,
  Minus,
  Monitor,
  Play,
  Plus,
  Printer,
  Receipt,
  RefreshCw,
  Settings2,
  Smartphone,
  Usb,
  Volume2,
  Wifi,
  XCircle,
  Zap,
  Route,
} from "lucide-react-native";
import { colors, spinnerColor } from "@/lib/theme";
import KDSSoundService, {
  DEFAULT_SOUND_CONFIG,
  SOUND_PRESET_OPTIONS,
  type KDSSoundConfig,
  type SoundPreset,
} from "@/services/kds/kdsSoundService";
import { useKDSStore } from "@/stores/useKDSStore";
import { PrinterService } from "@/services/printing/PrinterService";
import { PrinterRoutingModal } from "@/components/settings/PrinterRoutingModal";
import { usePrinterStore } from "@/stores/usePrinterStore";
import { usePrintQueueStore } from "@/stores/usePrintQueueStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import {
  type PrinterConfig,
  type PrinterConnectionType,
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
import { formatDistanceToNow } from "date-fns";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
}

// ---------------------------------------------------------------------------
// SMALL COMPONENTS
// ---------------------------------------------------------------------------

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

function SoundPresetRow({
  label,
  value,
  onChange,
  onTest,
}: {
  label: string;
  value: SoundPreset;
  onChange: (preset: SoundPreset) => void;
  onTest: (preset: SoundPreset) => void;
}) {
  const [open, setOpen] = useState(false);
  const currentLabel = SOUND_PRESET_OPTIONS.find((o) => o.value === value)?.label ?? value;

  return (
    <View className="flex-row items-center justify-between py-2.5">
      <Text className="text-gray-300 text-sm flex-1">{label}</Text>
      <View className="flex-row items-center gap-2">
        <TouchableOpacity
          onPress={() => setOpen(!open)}
          className="flex-row items-center bg-card px-3 py-1.5 rounded-lg border border-gray-600"
        >
          <Text className="text-white text-sm mr-1">{currentLabel}</Text>
          <ChevronDown size={14} color="#9ca3af" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onTest(value)}
          className="bg-card px-2.5 py-1.5 rounded-lg border border-gray-600"
        >
          <Play size={14} color={colors.info} />
        </TouchableOpacity>
      </View>
      {open && (
        <View className="absolute right-12 top-10 z-50 bg-card border border-gray-600 rounded-lg shadow-lg">
          {SOUND_PRESET_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              onPress={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`px-4 py-2.5 ${opt.value === value ? "bg-blue-600/20" : ""}`}
            >
              <Text
                className={`text-sm ${opt.value === value ? "text-blue-400 font-medium" : "text-white"}`}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// STATUS HELPERS
// ---------------------------------------------------------------------------

function getPrinterStatusColor(printer: PrinterConfig): string {
  if (printer.lastStatus === "verified") return "text-green-400";
  if (printer.isConnected) return "text-green-400";
  if (printer.lastStatus?.startsWith("verification_failed")) return "text-red-400";
  if (printer.errorCount > 0) return "text-yellow-400";
  return "text-gray-500";
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
    return <CheckCircle2 size={14} color={colors.success} />;
  }
  if (printer.lastStatus?.startsWith("verification_failed")) {
    return <XCircle size={14} color={colors.danger} />;
  }
  if (printer.errorCount > 0) {
    return <AlertTriangle size={14} color={colors.warning} />;
  }
  return <XCircle size={14} color={colors.muted} />;
}

function getConnectionIcon(connType: PrinterConnectionType): React.ReactNode {
  switch (connType) {
    case "network": return <Wifi size={12} color={colors.label} />;
    case "bluetooth": return <Bluetooth size={12} color={colors.label} />;
    case "usb": return <Usb size={12} color={colors.label} />;
    case "builtin": return <Cpu size={12} color={colors.label} />;
    default: return <Wifi size={12} color={colors.label} />;
  }
}

function getRoleBadge(role: PrinterRole): { label: string; bgColor: string; textColor: string } {
  switch (role) {
    case "receipt": return { label: "Receipt", bgColor: "bg-blue-600/20", textColor: "text-blue-400" };
    case "kitchen": return { label: "Kitchen", bgColor: "bg-orange-600/20", textColor: "text-orange-400" };
    case "bar": return { label: "Bar", bgColor: "bg-purple-600/20", textColor: "text-purple-400" };
    case "label": return { label: "Label", bgColor: "bg-teal-600/20", textColor: "text-teal-400" };
    default: return { label: role, bgColor: "bg-gray-600/20", textColor: "text-gray-400" };
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

function getRoleIcon(role: PrinterRole, color: string): React.ReactNode {
  switch (role) {
    case "receipt": return <Receipt size={20} color={color} />;
    case "kitchen": return <ChefHat size={20} color={color} />;
    case "bar": return <ChefHat size={20} color={color} />;
    case "label": return <FileText size={20} color={color} />;
    default: return <Printer size={20} color={color} />;
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

  // KDS settings from store
  const kdsAutoFireEnabled = useStoreSettingsStore((s) => s.kdsAutoFireEnabled);
  const kdsAutoFireDelayMinutes = useStoreSettingsStore((s) => s.kdsAutoFireDelayMinutes);
  const autoPrintKitchenTickets = useStoreSettingsStore((s) => s.autoPrintKitchenTickets);
  const autoPrintReceipt = useStoreSettingsStore((s) => s.autoPrintReceipt);
  const updateField = useStoreSettingsStore((s) => s.updateField);

  // Location & station
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const selectedStation = useStoreSettingsStore((s) => s.selectedStation);

  // Printer store
  const storedPrinters = usePrinterStore((s) => s.printers);
  const fetchPrinters = usePrinterStore((s) => s.fetchPrinters);
  const updatePrinterConfig = usePrinterStore((s) => s.updatePrinterConfig);

  // Print queue (reactive via selector on jobs array)
  const jobs = usePrintQueueStore((s) => s.jobs);
  const queuedJobCount = jobs.filter((j) => j.status === "queued" || j.status === "processing").length;
  const failedJobCount = jobs.filter((j) => j.status === "failed").length;

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

  // Edit panel state
  const [editingPrinterId, setEditingPrinterId] = useState<string | null>(null);
  const [isSavingPrinter, setIsSavingPrinter] = useState(false);

  // Routing modal state
  const [routingModalPrinter, setRoutingModalPrinter] = useState<PrinterConfig | null>(null);

  // KDS Sound settings
  const kdsDisplayId = useKDSStore((s) => s.kdsDisplayId);
  const kdsDisplayConfig = useKDSStore((s) => s.kdsDisplayConfig);
  const fetchKDSDisplay = useKDSStore((s) => s.fetchKDSDisplay);
  const [soundOnNewOrder, setSoundOnNewOrder] = useState(false);
  const [soundConfig, setSoundConfig] = useState<KDSSoundConfig>({ ...DEFAULT_SOUND_CONFIG });
  const [soundServicePreview] = useState(() => new KDSSoundService());
  const [isSavingSound, setIsSavingSound] = useState(false);

  // Sync sound state from KDS display config
  useEffect(() => {
    if (kdsDisplayConfig) {
      setSoundOnNewOrder(kdsDisplayConfig.soundOnNewOrder ?? false);
      if (kdsDisplayConfig.soundConfig) {
        setSoundConfig(kdsDisplayConfig.soundConfig);
      }
    }
  }, [kdsDisplayConfig]);

  // Init preview sound service + fetch KDS display
  useEffect(() => {
    soundServicePreview.init();
    if (selectedStation?.id) {
      fetchKDSDisplay(selectedStation.id);
    }
    return () => soundServicePreview.dispose();
  }, [selectedStation?.id]);

  // Save sound config to Supabase
  const saveSoundConfig = async (
    newSoundOn: boolean,
    newConfig: KDSSoundConfig,
  ) => {
    if (!kdsDisplayId) return;
    setIsSavingSound(true);
    try {
      await supabase
        .from("kds_displays")
        .update({
          sound_on_new_order: newSoundOn,
          sound_config: newConfig as any,
        })
        .eq("id", kdsDisplayId);

      // Refresh the display config in the store
      if (selectedStation?.id) {
        fetchKDSDisplay(selectedStation.id);
      }
    } catch (err) {
      console.error("[Settings] saveSoundConfig error:", err);
    } finally {
      setIsSavingSound(false);
    }
  };

  const handleSoundToggle = (val: boolean) => {
    setSoundOnNewOrder(val);
    saveSoundConfig(val, soundConfig);
  };

  const handleSoundPresetChange = (key: keyof KDSSoundConfig, preset: SoundPreset) => {
    const updated = { ...soundConfig, [key]: preset };
    setSoundConfig(updated);
    saveSoundConfig(soundOnNewOrder, updated);
  };

  // Test print loading per printer
  const [testPrintingId, setTestPrintingId] = useState<string | null>(null);
  const [testPrintType, setTestPrintType] = useState<"test_page" | "receipt" | "kitchen">("test_page");

  // Fetch real printers on mount
  useEffect(() => {
    if (selectedStore?.id) {
      fetchPrinters(selectedStore.id);
    }
  }, [selectedStore?.id]);

  // Cleanup Star discovery on unmount
  useEffect(() => {
    return () => {
      stopDiscovery();
    };
  }, []);

  // Retry connection state
  const [retryingPrinterId, setRetryingPrinterId] = useState<string | null>(null);

  // Pull-to-refresh
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Derived
  const paymentTerminal = selectedStation?.payment_terminal ?? null;
  // Hide built-in printers from other stations — they can't receive external print requests
  const visiblePrinters = storedPrinters.filter(
    (p) => p.connectionType !== "builtin" || p.stationId === selectedStation?.id,
  );
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
      (p) => p.printerType === "star_micronics" && p.networkAddress === ip,
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
        Alert.alert(
          verified ? "Printer Online" : "Connection Failed",
          verified
            ? `${printer.printerName} is connected and ready.`
            : `Could not reach ${printer.printerName}. Check that the printer is powered on and connected to the network.`,
        );
      } else if (printer.printerType === "dejavoo_spin_p") {
        const verified = await verifyDejavooPrinter(supabase, printer.id);
        if (selectedStore?.id) await fetchPrinters(selectedStore.id);
        Alert.alert(
          verified ? "Printer Online" : "Connection Failed",
          verified
            ? `${printer.printerName} is connected and ready.`
            : `Could not reach ${printer.printerName}. Check terminal connection.`,
        );
      } else {
        await PrinterService.printTestPage(printer);
        if (selectedStore?.id) await fetchPrinters(selectedStore.id);
      }
    } catch (e: any) {
      Alert.alert("Connection Failed", e.message || "Unable to connect to printer.");
    } finally {
      setRetryingPrinterId(null);
    }
  };

  const handleUpdatePrinter = async (
    printerId: string,
    updates: {
      printerRole?: PrinterRole;
      isDefaultReceipt?: boolean;
      isDefaultKitchen?: boolean;
      isActive?: boolean;
    },
  ) => {
    setIsSavingPrinter(true);
    try {
      await updatePrinterConfig(printerId, updates);
      if (selectedStore?.id) {
        await fetchPrinters(selectedStore.id);
      }
      setEditingPrinterId(null);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to update printer");
    } finally {
      setIsSavingPrinter(false);
    }
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

  // ---------------------------------------------------------------------------
  // RENDER HELPERS
  // ---------------------------------------------------------------------------

  const renderCapBadge = (label: string, has: boolean) => (
    <View
      key={label}
      className={`px-3 py-1.5 rounded-lg mr-2 mb-2 ${has ? "bg-green-600/20" : "bg-gray-700/40"}`}
    >
      <Text className={`text-xs font-medium ${has ? "text-green-400" : "text-gray-500"}`}>
        {label}
      </Text>
    </View>
  );

  const renderAddPrinterPanel = (forRole: "receipt" | "kitchen") => {
    const isReceipt = forRole === "receipt";
    return (
      <View className="bg-surface p-4 rounded-xl border border-gray-600 mb-3">
        {/* Header + Cancel */}
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center">
            <Plus size={16} color={isReceipt ? colors.info : "#f97316"} />
            <Text className="text-white font-bold ml-2">
              Add {isReceipt ? "Receipt" : "Kitchen"} Printer by IP
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleCancelAdding}
            className="p-1.5 bg-card rounded-lg"
          >
            <XCircle size={16} color={colors.label} />
          </TouchableOpacity>
        </View>
        <Text className="text-gray-400 text-xs mb-3">
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
          className="bg-card border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm mb-3"
          editable={!isProbing}
        />
        {manualIpError && (
          <View className="bg-red-600/10 border border-red-600/30 rounded-lg p-2.5 mb-3">
            <Text className="text-red-400 text-xs">{manualIpError}</Text>
          </View>
        )}
        <View className="flex-row mb-3">
          <TouchableOpacity
            onPress={handleManualIpAdd}
            disabled={isProbing || !manualIp.trim()}
            className={`flex-1 py-2.5 rounded-lg flex-row items-center justify-center mr-2 ${
              isProbing || !manualIp.trim() ? "bg-gray-600" : isReceipt ? "bg-blue-600" : "bg-orange-600"
            }`}
          >
            {isProbing ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <>
                <Wifi size={16} color="white" />
                <Text className="text-white font-medium ml-2 text-sm">Connect</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleScanStarPrinters}
            disabled={isScanningStar}
            className="bg-card border border-gray-600 px-4 py-2.5 rounded-lg flex-row items-center"
          >
            {isScanningStar ? (
              <ActivityIndicator size="small" color={colors.info} />
            ) : (
              <>
                <Wifi size={14} color={colors.info} />
                <Text className="text-blue-400 font-medium ml-1.5 text-sm">Scan</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Star Discovery results (inline) */}
        {isScanningStar && (
          <View className="items-center py-4">
            <ActivityIndicator size="large" color={isReceipt ? colors.info : "#f97316"} />
            <Text className="text-gray-400 text-sm mt-3">Scanning for Star printers...</Text>
          </View>
        )}

        {starScanError && (
          <View className="bg-red-600/10 border border-red-600/30 rounded-lg p-2.5 mb-3">
            <Text className="text-red-400 text-sm">{starScanError}</Text>
          </View>
        )}

        {discoveredStarPrinters.map((dp) => {
          const alreadyAdded = storedPrinters.some(
            (p) => p.printerType === "star_micronics" && p.networkAddress === dp.ipAddress,
          );
          const isProvisioningThis = provisioningStarIp === dp.ipAddress;

          return (
            <View
              key={dp.ipAddress}
              className="bg-card p-3 rounded-lg border border-gray-600 mb-2"
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-1">
                  <View className="flex-row items-center">
                    <Printer size={16} color={isReceipt ? colors.info : "#f97316"} />
                    <Text className="text-white font-medium ml-2 text-sm">{dp.modelName}</Text>
                    {alreadyAdded && (
                      <View className="bg-green-600/20 px-2 py-0.5 rounded ml-2">
                        <Text className="text-green-400 text-[10px] font-medium">Added</Text>
                      </View>
                    )}
                  </View>
                  <View className="flex-row items-center mt-1">
                    <Wifi size={12} color={colors.label} />
                    <Text className="text-gray-400 text-xs ml-1">{dp.ipAddress}</Text>
                    {dp.macAddress && (
                      <Text className="text-gray-500 text-xs ml-3">{dp.macAddress}</Text>
                    )}
                  </View>
                  <View className="flex-row flex-wrap mt-1.5">
                    <View className="bg-gray-700/50 px-2 py-0.5 rounded mr-2 mb-1">
                      <Text className="text-gray-400 text-[10px]">
                        {dp.capabilities.paperWidth}mm
                      </Text>
                    </View>
                    <View className="bg-gray-700/50 px-2 py-0.5 rounded mr-2 mb-1">
                      <Text className="text-gray-400 text-[10px]">
                        {dp.capabilities.maxCharsPerLine} chars
                      </Text>
                    </View>
                    <View className="bg-gray-700/50 px-2 py-0.5 rounded mr-2 mb-1">
                      <Text className="text-gray-400 text-[10px]">
                        {dp.capabilities.supportsAutoCut ? "Auto-cut" : "Tear-off"}
                      </Text>
                    </View>
                  </View>
                </View>
                {!alreadyAdded && (
                  <TouchableOpacity
                    onPress={() => handleProvisionStar(dp, forRole)}
                    disabled={isProvisioningThis}
                    className={`ml-3 px-4 py-2.5 rounded-lg ${isReceipt ? "bg-blue-600" : "bg-orange-600"}`}
                  >
                    {isProvisioningThis ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <Text className="text-white font-medium text-sm">Add</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}

        {/* Dejavoo provisioning — only in receipt panel */}
        {isReceipt && paymentTerminal?.terminal_type === "dejavoo" && !hasDejavooPrinter && (
          <View className="bg-card p-3 rounded-lg border border-gray-600 mt-2">
            <View className="flex-row items-center mb-2">
              <CreditCard size={14} color="#a78bfa" />
              <Text className="text-white font-medium ml-2 text-sm">Dejavoo Terminal Printer</Text>
            </View>
            <TouchableOpacity
              onPress={handleProvisionDejavoo}
              disabled={isProvisioning}
              className="bg-blue-600 px-4 py-2 rounded-lg flex-row items-center justify-center"
            >
              {isProvisioning ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <Plus size={14} color="white" />
                  <Text className="text-white font-medium ml-2 text-sm">Provision Dejavoo</Text>
                </>
              )}
            </TouchableOpacity>
            {provisioningError && (
              <Text className="text-red-400 text-xs mt-2">{provisioningError}</Text>
            )}
          </View>
        )}
      </View>
    );
  };

  const renderPrinterCard = (printer: PrinterConfig) => {
    const role = getRoleBadge(printer.printerRole);
    const roleIconColor =
      printer.printerRole === "receipt"
        ? colors.info
        : printer.printerRole === "kitchen"
          ? "#f97316"
          : printer.printerRole === "bar"
            ? "#a78bfa"
            : colors.teal;
    const isTestPrinting = testPrintingId === printer.id;
    const isEditing = editingPrinterId === printer.id;

    return (
      <View
        key={printer.id}
        className={`bg-surface p-4 rounded-xl border mb-3 ${printer.isActive ? "border-gray-600" : "border-gray-700 opacity-60"}`}
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center flex-1">
            <View className={`w-10 h-10 rounded-lg items-center justify-center mr-3 ${role.bgColor}`}>
              {getRoleIcon(printer.printerRole, roleIconColor)}
            </View>
            <View className="flex-1">
              <View className="flex-row items-center flex-wrap">
                <Text className="text-white font-bold mr-2">{printer.printerName}</Text>
                {printer.isDefaultReceipt && (
                  <View className="bg-blue-600/30 px-2 py-0.5 rounded mr-1">
                    <Text className="text-blue-300 text-[10px] font-medium">Default Receipt</Text>
                  </View>
                )}
                {printer.isDefaultKitchen && (
                  <View className="bg-orange-600/30 px-2 py-0.5 rounded mr-1">
                    <Text className="text-orange-300 text-[10px] font-medium">Default Kitchen</Text>
                  </View>
                )}
              </View>
              <View className="flex-row items-center mt-1 flex-wrap">
                {getConnectionIcon(printer.connectionType)}
                <Text className="text-gray-400 text-xs ml-1">
                  {printer.networkAddress || printer.connectionType.toUpperCase()}
                </Text>
                <View className="flex-row items-center ml-3">
                  {getPrinterStatusIcon(printer)}
                  <Text className={`ml-1 text-xs ${getPrinterStatusColor(printer)}`}>
                    {getPrinterStatusLabel(printer)}
                  </Text>
                </View>
              </View>
              <View className="flex-row items-center mt-1.5 flex-wrap">
                <View className={`px-2 py-0.5 rounded mr-2 ${role.bgColor}`}>
                  <Text className={`text-[10px] font-medium ${role.textColor}`}>{role.label}</Text>
                </View>
                <Text className="text-gray-500 text-[10px]">{getTypeBadge(printer.printerType)}</Text>
                {printer.lastPrintAt && (
                  <Text className="text-gray-500 text-[10px] ml-3">
                    Last print: {getRelativeTime(printer.lastPrintAt)}
                  </Text>
                )}
                {printer.errorCount > 0 && (
                  <Text className="text-red-400 text-[10px] ml-3">
                    {printer.errorCount} error{printer.errorCount > 1 ? "s" : ""}
                  </Text>
                )}
                {printer.lastStatusAt && (
                  <Text className="text-gray-600 text-[10px] ml-3">
                    Checked {getRelativeTime(printer.lastStatusAt)}
                  </Text>
                )}
              </View>
            </View>
          </View>
          <View className="flex-row items-center">
            {!printer.isConnected && (
              <TouchableOpacity
                onPress={() => handleRetryConnection(printer)}
                disabled={retryingPrinterId === printer.id}
                className="ml-2 p-2.5 bg-amber-600/20 rounded-lg"
              >
                {retryingPrinterId === printer.id ? (
                  <ActivityIndicator size="small" color={colors.warning} />
                ) : (
                  <RefreshCw size={18} color={colors.warning} />
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => setEditingPrinterId(isEditing ? null : printer.id)}
              className="ml-2 p-2.5 bg-card rounded-lg"
            >
              <Settings2 size={18} color={isEditing ? colors.info : colors.label} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleTestPrint(printer)}
              disabled={isTestPrinting}
              className="ml-2 p-2.5 bg-green-600/20 rounded-lg"
            >
              {isTestPrinting ? (
                <ActivityIndicator size="small" color={colors.success} />
              ) : (
                <Printer size={18} color={colors.success} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Expandable Edit Panel */}
        {isEditing && (
          <View className="mt-4 pt-4 border-t border-gray-600">
            {/* Role Selector */}
            <Text className="text-gray-400 text-xs mb-2">Printer Role</Text>
            <View className="flex-row bg-card rounded-lg border border-gray-600 overflow-hidden mb-4">
              {(["receipt", "kitchen", "bar"] as const).map((r) => {
                const badge = getRoleBadge(r);
                const isSelected = printer.printerRole === r;
                return (
                  <TouchableOpacity
                    key={r}
                    onPress={() => handleUpdatePrinter(printer.id, { printerRole: r })}
                    disabled={isSavingPrinter}
                    className={`flex-1 py-2.5 items-center ${isSelected ? "bg-blue-600" : ""}`}
                  >
                    <Text
                      className={`text-sm font-medium ${isSelected ? "text-white" : "text-gray-400"}`}
                    >
                      {badge.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Default Receipt toggle (only for receipt role) */}
            {printer.printerRole === "receipt" && (
              <View className="flex-row items-center justify-between py-2 mb-2">
                <View className="flex-1 pr-4">
                  <Text className="text-white text-sm font-medium">Default Receipt Printer</Text>
                  <Text className="text-gray-500 text-xs">Use for all receipt printing</Text>
                </View>
                <Switch
                  checked={printer.isDefaultReceipt}
                  onCheckedChange={(v) =>
                    handleUpdatePrinter(printer.id, { isDefaultReceipt: v })
                  }
                />
              </View>
            )}

            {/* Default Kitchen toggle (only for kitchen/bar role) */}
            {(printer.printerRole === "kitchen" || printer.printerRole === "bar") && (
              <>
                <View className="flex-row items-center justify-between py-2 mb-2">
                  <View className="flex-1 pr-4">
                    <Text className="text-white text-sm font-medium">Default Kitchen Printer</Text>
                    <Text className="text-gray-500 text-xs">Use for all kitchen ticket printing</Text>
                  </View>
                  <Switch
                    checked={printer.isDefaultKitchen}
                    onCheckedChange={(v) =>
                      handleUpdatePrinter(printer.id, { isDefaultKitchen: v })
                    }
                  />
                </View>

                {/* Configure Routing button */}
                <TouchableOpacity
                  onPress={() => setRoutingModalPrinter(printer)}
                  className="flex-row items-center justify-between py-3 px-3 bg-card rounded-lg mb-2 border border-gray-600"
                >
                  <View className="flex-row items-center">
                    <Route size={16} color={colors.info} />
                    <View className="ml-3">
                      <Text className="text-white text-sm font-medium">Configure Routing</Text>
                      <Text className="text-gray-500 text-xs capitalize">
                        Mode: {printer.routingMode}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-blue-400 text-sm">Edit</Text>
                </TouchableOpacity>
              </>
            )}

            {/* Active toggle */}
            <View className="flex-row items-center justify-between py-2">
              <View className="flex-1 pr-4">
                <Text className="text-white text-sm font-medium">Active</Text>
                <Text className="text-gray-500 text-xs">Enable or disable this printer</Text>
              </View>
              <Switch
                checked={printer.isActive}
                onCheckedChange={(v) =>
                  handleUpdatePrinter(printer.id, { isActive: v })
                }
              />
            </View>

            {isSavingPrinter && (
              <View className="items-center py-2 mt-2">
                <ActivityIndicator size="small" color={colors.info} />
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  // ---------------------------------------------------------------------------
  // MAIN RENDER
  // ---------------------------------------------------------------------------

  return (
    <View className="flex-1 bg-panel">
      {/* Tab Bar */}
      <View className="flex-row px-4 pt-4 pb-2">
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            className={`px-5 py-2.5 rounded-lg mr-2 ${
              activeTab === tab.key ? "bg-blue-600" : "bg-surface"
            }`}
          >
            <Text
              className={`text-sm font-medium ${
                activeTab === tab.key ? "text-white" : "text-gray-400"
              }`}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab Content */}
      <ScrollView
        className="flex-1 px-4 pb-4"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handlePullToRefresh}
            tintColor={colors.info}
          />
        }
      >
        {/* ============================================================== */}
        {/* PRINTER LIST TAB                                                */}
        {/* ============================================================== */}
        {activeTab === "printers" && (
          <View>
            {/* Status line + Scan button */}
            <View className="flex-row items-center justify-between py-3">
              <View className="flex-row items-center">
                <View className={`w-3 h-3 rounded-full mr-2 ${connectedCount === totalActive && totalActive > 0 ? "bg-green-400" : connectedCount > 0 ? "bg-amber-400" : "bg-red-400"}`} />
                <Text className="text-white font-medium text-sm">
                  {connectedCount}/{totalActive} printer{totalActive !== 1 ? "s" : ""} connected
                </Text>
                {connectedCount < totalActive && (
                  <Text className="text-gray-400 text-xs ml-2">
                    {totalActive - connectedCount} offline
                  </Text>
                )}
              </View>
              <TouchableOpacity
                onPress={handleScanStarPrinters}
                disabled={isScanningStar}
                className="bg-blue-600/20 px-3 py-1.5 rounded-lg flex-row items-center"
              >
                {isScanningStar ? (
                  <ActivityIndicator size="small" color={colors.info} />
                ) : (
                  <>
                    <Wifi size={14} color={colors.info} />
                    <Text className="text-blue-400 font-medium ml-1.5 text-sm">Scan Network</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* Print Queue Banner */}
            {(queuedJobCount > 0 || failedJobCount > 0) && (
              <View className="flex-row items-center bg-surface border border-gray-600 rounded-lg px-4 py-2.5 mb-3">
                <Zap size={14} color={colors.info} />
                <Text className="text-gray-300 ml-2 text-sm">Queue:</Text>
                {queuedJobCount > 0 && (
                  <View className="flex-row items-center ml-3">
                    <View className="w-2 h-2 rounded-full bg-blue-400 mr-1.5" />
                    <Text className="text-blue-400 text-sm font-medium">{queuedJobCount} queued</Text>
                  </View>
                )}
                {failedJobCount > 0 && (
                  <View className="flex-row items-center ml-3">
                    <View className="w-2 h-2 rounded-full bg-red-400 mr-1.5" />
                    <Text className="text-red-400 text-sm font-medium">{failedJobCount} failed</Text>
                  </View>
                )}
              </View>
            )}

            {/* ── RECEIPT PRINTERS SECTION ── */}
            <SectionHeader title="Receipt Printers" />
            {receiptPrinters.length === 0 && addingForRole !== "receipt" && (
              <View className="bg-surface rounded-lg px-3 py-3 mb-2">
                <Text className="text-gray-500 text-sm">No receipt printers configured</Text>
              </View>
            )}
            {receiptPrinters.map(renderPrinterCard)}
            {addingForRole === "receipt" ? (
              renderAddPrinterPanel("receipt")
            ) : (
              <TouchableOpacity
                onPress={() => handleStartAdding("receipt")}
                className="border border-dashed border-blue-600/40 bg-blue-600/5 rounded-xl p-4 mb-3 flex-row items-center justify-center"
              >
                <Plus size={18} color="#3b82f6" />
                <Text className="text-blue-400 font-medium ml-2 text-sm">Add Receipt Printer</Text>
              </TouchableOpacity>
            )}

            {/* ── KITCHEN & BAR PRINTERS SECTION ── */}
            <SectionHeader title="Kitchen & Bar Printers" />
            {kitchenPrinters.length === 0 && addingForRole !== "kitchen" && (
              <View className="bg-surface rounded-lg px-3 py-3 mb-2">
                <Text className="text-gray-500 text-sm">No kitchen printers configured</Text>
              </View>
            )}
            {kitchenPrinters.map(renderPrinterCard)}
            {addingForRole === "kitchen" ? (
              renderAddPrinterPanel("kitchen")
            ) : (
              <TouchableOpacity
                onPress={() => handleStartAdding("kitchen")}
                className="border border-dashed border-orange-600/40 bg-orange-600/5 rounded-xl p-4 mb-3 flex-row items-center justify-center"
              >
                <Plus size={18} color="#f97316" />
                <Text className="text-orange-400 font-medium ml-2 text-sm">Add Kitchen Printer</Text>
              </TouchableOpacity>
            )}

            {/* Test Print Type Selector */}
            <View className="mt-2 mb-4">
              <Text className="text-gray-400 text-xs mb-2">Test print type (per-printer buttons):</Text>
              <View className="flex-row bg-surface rounded-lg border border-gray-600 overflow-hidden">
                {([
                  { key: "test_page" as const, label: "Test Page" },
                  { key: "receipt" as const, label: "Receipt" },
                  { key: "kitchen" as const, label: "Kitchen" },
                ]).map(({ key, label }) => (
                  <TouchableOpacity
                    key={key}
                    onPress={() => setTestPrintType(key)}
                    className={`flex-1 py-2.5 items-center ${testPrintType === key ? "bg-blue-600" : ""}`}
                  >
                    <Text className={`text-sm font-medium ${testPrintType === key ? "text-white" : "text-gray-400"}`}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
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
            <View className="bg-surface rounded-lg px-3 py-2">
              <Text className="text-gray-400 text-xs mb-1">Footer Message</Text>
              <TextInput
                value={receiptSettings.footerMessage}
                onChangeText={(t) => setReceiptSettings((prev) => ({ ...prev, footerMessage: t }))}
                className="text-white text-sm py-1"
                placeholder="Thank you message"
                placeholderTextColor={colors.muted}
              />
            </View>

            <SectionHeader title="Test Print" />
            <View className="flex-row items-center justify-between bg-surface rounded-lg px-3 py-3">
              <View className="flex-row bg-card rounded-lg border border-gray-600 overflow-hidden flex-1 mr-3">
                {([
                  { key: "test_page" as const, label: "Test Page" },
                  { key: "receipt" as const, label: "Receipt" },
                  { key: "kitchen" as const, label: "Kitchen" },
                ]).map(({ key, label }) => (
                  <TouchableOpacity
                    key={key}
                    onPress={() => setTestPrintType(key)}
                    className={`flex-1 py-2 items-center ${testPrintType === key ? "bg-blue-600" : ""}`}
                  >
                    <Text className={`text-xs font-medium ${testPrintType === key ? "text-white" : "text-gray-400"}`}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                onPress={() => PrinterService.printTestPage()}
                className="bg-green-600 px-4 py-2 rounded-lg flex-row items-center"
              >
                <Printer size={16} color="white" />
                <Text className="text-white font-medium ml-2 text-sm">Print</Text>
              </TouchableOpacity>
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
              <View className="bg-surface rounded-lg px-3 py-3 mb-2">
                <View className="flex-row justify-between items-center">
                  <Text className="text-gray-300 text-sm">Auto-fire delay</Text>
                  <View className="flex-row items-center gap-2">
                    <TouchableOpacity
                      onPress={() =>
                        setKitchenSettings((prev) => ({
                          ...prev,
                          autoFireDelay: Math.max(0, prev.autoFireDelay - 1),
                        }))
                      }
                      className="bg-card px-3 py-1.5 rounded-lg"
                    >
                      <Minus size={16} color="white" />
                    </TouchableOpacity>
                    <Text className="text-blue-400 font-bold text-base w-12 text-center">
                      {kitchenSettings.autoFireDelay}s
                    </Text>
                    <TouchableOpacity
                      onPress={() =>
                        setKitchenSettings((prev) => ({
                          ...prev,
                          autoFireDelay: Math.min(120, prev.autoFireDelay + 1),
                        }))
                      }
                      className="bg-card px-3 py-1.5 rounded-lg"
                    >
                      <Plus size={16} color="white" />
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
              onToggle={() => setKitchenSettings((prev) => ({ ...prev, showModifiers: !prev.showModifiers }))}
            />
            <ToggleRow
              label="Show Course Number"
              value={kitchenSettings.showCourseNumber}
              onToggle={() => setKitchenSettings((prev) => ({ ...prev, showCourseNumber: !prev.showCourseNumber }))}
            />
            <ToggleRow
              label="Show Server Name"
              value={kitchenSettings.showServerName}
              onToggle={() => setKitchenSettings((prev) => ({ ...prev, showServerName: !prev.showServerName }))}
            />
            <ToggleRow
              label="Large Font"
              value={kitchenSettings.largeFont}
              onToggle={() => setKitchenSettings((prev) => ({ ...prev, largeFont: !prev.largeFont }))}
            />
          </View>
        )}

        {/* ============================================================== */}
        {/* KDS & ROUTING TAB                                               */}
        {/* ============================================================== */}
        {activeTab === "kds" && (
          <View>
            <SectionHeader title="KDS Auto-Fire" />
            <ToggleRow
              label="Auto-Fire Pending Courses"
              value={kdsAutoFireEnabled}
              onToggle={(v) => updateField("kdsAutoFireEnabled", v)}
            />
            {kdsAutoFireEnabled && (
              <View className="bg-surface rounded-lg px-3 py-3 mb-2">
                <View className="flex-row justify-between items-center">
                  <Text className="text-gray-300 text-sm">Delay before auto-fire</Text>
                  <View className="flex-row items-center gap-2">
                    <TouchableOpacity
                      onPress={() =>
                        updateField("kdsAutoFireDelayMinutes", Math.max(1, kdsAutoFireDelayMinutes - 1))
                      }
                      className="bg-card px-3 py-1.5 rounded-lg"
                    >
                      <Minus size={16} color="white" />
                    </TouchableOpacity>
                    <Text className="text-blue-400 font-bold text-base w-16 text-center">
                      {kdsAutoFireDelayMinutes} min
                    </Text>
                    <TouchableOpacity
                      onPress={() =>
                        updateField("kdsAutoFireDelayMinutes", Math.min(30, kdsAutoFireDelayMinutes + 1))
                      }
                      className="bg-card px-3 py-1.5 rounded-lg"
                    >
                      <Plus size={16} color="white" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            <SectionHeader title="Sound Notifications" />
            {!kdsDisplayId ? (
              <View className="bg-surface p-4 rounded-xl border border-gray-600 mb-2">
                <Text className="text-gray-400 text-xs">
                  No KDS display configured for this station. Sound settings are per-display.
                </Text>
              </View>
            ) : (
              <View>
                <ToggleRow
                  label="Sound on New Order"
                  value={soundOnNewOrder}
                  onToggle={handleSoundToggle}
                />
                {soundOnNewOrder && (
                  <View className="bg-surface rounded-xl border border-gray-600 p-3 mb-2">
                    <SoundPresetRow
                      label="POS Orders"
                      value={soundConfig.pos}
                      onChange={(v) => handleSoundPresetChange("pos", v)}
                      onTest={(v) => soundServicePreview.playPreview(v)}
                    />
                    <SoundPresetRow
                      label="Online Orders"
                      value={soundConfig.online}
                      onChange={(v) => handleSoundPresetChange("online", v)}
                      onTest={(v) => soundServicePreview.playPreview(v)}
                    />
                    <SoundPresetRow
                      label="Kiosk Orders"
                      value={soundConfig.kiosk}
                      onChange={(v) => handleSoundPresetChange("kiosk", v)}
                      onTest={(v) => soundServicePreview.playPreview(v)}
                    />
                    <SoundPresetRow
                      label="Third-party Orders"
                      value={soundConfig.third_party}
                      onChange={(v) => handleSoundPresetChange("third_party", v)}
                      onTest={(v) => soundServicePreview.playPreview(v)}
                    />
                    <SoundPresetRow
                      label="Default (Unknown)"
                      value={soundConfig.default}
                      onChange={(v) => handleSoundPresetChange("default", v)}
                      onTest={(v) => soundServicePreview.playPreview(v)}
                    />
                    {isSavingSound && (
                      <ActivityIndicator size="small" color={colors.info} style={{ marginTop: 8 }} />
                    )}
                  </View>
                )}
              </View>
            )}

            <SectionHeader title="Printer Routing" />
            <View className="bg-surface p-4 rounded-xl border border-gray-600">
              <View className="flex-row items-center mb-2">
                <Route size={16} color={colors.info} />
                <Text className="text-white font-medium ml-2">Per-Printer Routing</Text>
              </View>
              <Text className="text-gray-400 text-xs mb-3">
                Routing is now configured per-printer. Open a kitchen/bar printer's settings and tap "Configure Routing" to set up category, item, and order type rules.
              </Text>
              {kitchenPrinters.length > 0 ? (
                kitchenPrinters.map((kp) => (
                  <TouchableOpacity
                    key={kp.id}
                    onPress={() => setRoutingModalPrinter(kp)}
                    className="flex-row items-center justify-between py-2.5 px-3 bg-card rounded-lg mb-1.5 border border-gray-700"
                  >
                    <View className="flex-row items-center flex-1">
                      <Printer size={14} color={kp.printerRole === "bar" ? "#a78bfa" : "#f97316"} />
                      <Text className="text-white text-sm ml-2">{kp.printerName}</Text>
                      <Text className="text-gray-500 text-xs ml-2 capitalize">({kp.routingMode})</Text>
                    </View>
                    <Text className="text-blue-400 text-xs">Configure</Text>
                  </TouchableOpacity>
                ))
              ) : (
                <Text className="text-gray-500 text-xs">No kitchen/bar printers configured</Text>
              )}
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
