import {
  AlertTriangle,
  ArrowRight,
  Bluetooth,
  CheckCircle2,
  ChefHat,
  ChevronDown,
  ChevronUp,
  Cpu,
  CreditCard,
  FileText,
  Minus,
  Monitor,
  Plus,
  Printer,
  Receipt,
  RefreshCw,
  Settings2,
  Smartphone,
  Usb,
  Wifi,
  XCircle,
  Zap,
} from "lucide-react-native";
import { colors, spinnerColor } from "@/lib/theme";
import { PrinterService } from "@/services/printing/PrinterService";
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
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";

// ---------------------------------------------------------------------------
// LOCAL TYPES (settings only — not printers)
// ---------------------------------------------------------------------------

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

interface PrinterRoute {
  id: string;
  category: string;
  printerId: string;
  isEnabled: boolean;
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
  if (!iso) return "—";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "—";
  }
}

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------

const PrintersKitchenScreen = () => {
  const supabase = useSupabaseClient();

  // KDS settings from store
  const kdsAutoFireEnabled = useStoreSettingsStore((s) => s.kdsAutoFireEnabled);
  const kdsAutoFireDelayMinutes = useStoreSettingsStore((s) => s.kdsAutoFireDelayMinutes);
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

  // Edit panel state
  const [editingPrinterId, setEditingPrinterId] = useState<string | null>(null);
  const [isSavingPrinter, setIsSavingPrinter] = useState(false);

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

  // Derived
  const paymentTerminal = selectedStation?.payment_terminal ?? null;
  const hasDejavooPrinter = storedPrinters.some((p) => p.printerType === "dejavoo_spin_p");
  const dejavooPrinter = storedPrinters.find((p) => p.printerType === "dejavoo_spin_p") ?? null;
  const builtinPrinter = storedPrinters.find((p) => p.printerType === "builtin_landi") ?? null;
  const kitchenPrinters = storedPrinters.filter(
    (p) => p.printerRole === "kitchen" || p.printerRole === "bar",
  );

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

  // Printer routing state
  const [printerRoutes, setPrinterRoutes] = useState<PrinterRoute[]>([]);

  // Categories from the app
  const categories = ["Main Course", "Appetizers", "Sides", "Drinks", "Desserts", "Specials"];
  const availableCategories = categories.filter(
    (c) => !printerRoutes.map((r) => r.category).includes(c),
  );

  // Expanded sections state
  const [expandedSections, setExpandedSections] = useState({
    devices: true,
    printers: true,
    receipt: true,
    kitchen: true,
    routing: true,
  });

  // Route Modal State
  const [routeModalVisible, setRouteModalVisible] = useState(false);
  const [newRouteData, setNewRouteData] = useState({
    category: "",
    printerId: "",
    isEnabled: true,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const toggleRoute = (id: string) => {
    setPrinterRoutes((prev) => prev.map((r) => (r.id === id ? { ...r, isEnabled: !r.isEnabled } : r)));
  };

  const updateRoutePrinter = (routeId: string, printerId: string) => {
    setPrinterRoutes((prev) => prev.map((r) => (r.id === routeId ? { ...r, printerId } : r)));
  };

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

  const handleProvisionStar = async (discovered: DiscoveredStarPrinter) => {
    if (!selectedStation || !selectedStore) return;
    setProvisioningStarIp(discovered.ipAddress);
    try {
      const printerId = await provisionStarPrinter(
        supabase,
        selectedStation.id,
        selectedStore.id,
        selectedStore.merchant_id,
        discovered,
        starRoleOverrides[discovered.ipAddress] ?? discovered.capabilities.suggestedRole,
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

  // Route Modal Helpers
  const openRouteModal = () => {
    setNewRouteData({
      category: availableCategories[0] || "",
      printerId: kitchenPrinters[0]?.id || "",
      isEnabled: true,
    });
    setRouteModalVisible(true);
  };

  const closeRouteModal = () => {
    setRouteModalVisible(false);
    setNewRouteData({ category: "", printerId: "", isEnabled: true });
  };

  const handleAddRoute = () => {
    if (!newRouteData.category || !newRouteData.printerId) return;
    const newRoute: PrinterRoute = {
      id: Date.now().toString(),
      category: newRouteData.category,
      printerId: newRouteData.printerId,
      isEnabled: newRouteData.isEnabled,
    };
    setPrinterRoutes((prev) => [...prev, newRoute]);
    closeRouteModal();
  };

  // ---------------------------------------------------------------------------
  // RENDER HELPERS
  // ---------------------------------------------------------------------------

  const renderToggleRow = (label: string, description: string, value: boolean, onToggle: () => void) => (
    <View className="flex-row items-center justify-between py-3 border-b border-gray-700">
      <View className="flex-1 pr-4">
        <Text className="text-white font-medium">{label}</Text>
        <Text className="text-gray-400 text-sm">{description}</Text>
      </View>
      <Switch checked={value} onCheckedChange={onToggle} />
    </View>
  );

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
              </View>
            </View>
          </View>
          <View className="flex-row items-center">
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

  const renderSectionHeader = (title: string, icon: React.ReactNode, section: keyof typeof expandedSections) => (
    <TouchableOpacity
      onPress={() => toggleSection(section)}
      className="flex-row items-center justify-between p-4 bg-surface rounded-t-xl border-b border-gray-700"
    >
      <View className="flex-row items-center">
        <View className="w-8 h-8 bg-card rounded-lg items-center justify-center mr-3">{icon}</View>
        <Text className="text-white font-bold text-lg">{title}</Text>
      </View>
      {expandedSections[section] ? (
        <ChevronUp size={20} color={colors.label} />
      ) : (
        <ChevronDown size={20} color={colors.label} />
      )}
    </TouchableOpacity>
  );

  // ---------------------------------------------------------------------------
  // MAIN RENDER
  // ---------------------------------------------------------------------------

  return (
    <View className="flex-1 bg-screen p-6">
      {/* Page Header */}
      <View className="mb-6">
        <Text className="text-3xl font-bold text-white">Printers & Kitchen</Text>
        <Text className="text-gray-400 mt-2">
          Configure receipt printers, kitchen display systems, and ticket routing.
        </Text>
      </View>

      <View className="h-px w-full bg-gray-700 mb-6" />

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* ================================================================ */}
        {/* CONNECTED DEVICES SECTION                                        */}
        {/* ================================================================ */}
        <View className="bg-panel rounded-xl border border-gray-700 mb-6">
          {renderSectionHeader("Connected Devices", <Smartphone size={20} color={colors.info} />, "devices")}
          {expandedSections.devices && (
            <View className="p-5">
              {/* Station Identity */}
              <View className="flex-row items-center justify-between mb-4">
                <View>
                  <Text className="text-white font-bold text-base">
                    {selectedStation?.station_name || "No Station"}
                  </Text>
                  <Text className="text-gray-400 text-sm">
                    {selectedStation?.station_type
                      ? selectedStation.station_type.charAt(0).toUpperCase() +
                        selectedStation.station_type.slice(1)
                      : "Not connected"}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={handleRefreshCapabilities}
                  disabled={isRefreshingCapabilities}
                  className="p-2.5 bg-surface rounded-lg"
                >
                  {isRefreshingCapabilities ? (
                    <ActivityIndicator size="small" color={colors.info} />
                  ) : (
                    <RefreshCw size={18} color={colors.info} />
                  )}
                </TouchableOpacity>
              </View>

              {/* Device Capabilities */}
              {deviceCapabilities && (
                <View className="bg-surface p-4 rounded-xl border border-gray-600 mb-4">
                  <Text className="text-gray-300 text-xs mb-2">
                    {deviceCapabilities.manufacturer} {deviceCapabilities.model}
                  </Text>
                  <View className="flex-row flex-wrap">
                    {renderCapBadge("Printer", deviceCapabilities.hasBuiltinPrinter)}
                    {renderCapBadge("NFC", deviceCapabilities.hasNfc)}
                    {renderCapBadge("Scanner", deviceCapabilities.hasBarcodeScanner)}
                    {renderCapBadge("Cash Drawer", deviceCapabilities.hasCashDrawerPort)}
                    {renderCapBadge("CFD", deviceCapabilities.hasBuiltinCfd)}
                  </View>
                </View>
              )}

              {/* Built-in Printer Card */}
              {builtinPrinter && (
                <View className="bg-surface p-4 rounded-xl border border-gray-600 mb-4">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center flex-1">
                      <Cpu size={18} color={colors.success} />
                      <Text className="text-white font-medium ml-2">Built-in Printer</Text>
                      <View className="flex-row items-center ml-3">
                        {getPrinterStatusIcon(builtinPrinter)}
                        <Text className={`ml-1 text-xs ${getPrinterStatusColor(builtinPrinter)}`}>
                          {getPrinterStatusLabel(builtinPrinter)}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleTestPrint(builtinPrinter)}
                      disabled={testPrintingId === builtinPrinter.id}
                      className="p-2 bg-green-600/20 rounded-lg"
                    >
                      {testPrintingId === builtinPrinter.id ? (
                        <ActivityIndicator size="small" color={colors.success} />
                      ) : (
                        <Printer size={16} color={colors.success} />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Payment Terminal Card */}
              {paymentTerminal ? (
                <View className="bg-surface p-4 rounded-xl border border-gray-600">
                  <View className="flex-row items-center mb-3">
                    <CreditCard size={18} color="#a78bfa" />
                    <Text className="text-white font-medium ml-2">
                      {paymentTerminal.terminal_name}
                    </Text>
                    <View className={`ml-3 w-2 h-2 rounded-full ${paymentTerminal.is_connected ? "bg-green-400" : "bg-gray-500"}`} />
                  </View>
                  <View className="flex-row flex-wrap mb-2">
                    <Text className="text-gray-400 text-xs mr-4">
                      Type: {paymentTerminal.terminal_type}
                    </Text>
                    {paymentTerminal.terminal_model && (
                      <Text className="text-gray-400 text-xs mr-4">
                        Model: {paymentTerminal.terminal_model}
                      </Text>
                    )}
                    <Text className="text-gray-400 text-xs">
                      Status: {paymentTerminal.last_connection_status || "Unknown"}
                    </Text>
                  </View>

                  {/* Dejavoo printer provisioning / status */}
                  {paymentTerminal.terminal_type === "dejavoo" && !hasDejavooPrinter && (
                    <View className="mt-3 pt-3 border-t border-gray-600">
                      <Text className="text-gray-300 text-sm mb-2">
                        This terminal has a built-in printer that hasn't been set up yet.
                      </Text>
                      <TouchableOpacity
                        onPress={handleProvisionDejavoo}
                        disabled={isProvisioning}
                        className="bg-blue-600 px-4 py-2.5 rounded-lg flex-row items-center justify-center"
                      >
                        {isProvisioning ? (
                          <ActivityIndicator size="small" color="white" />
                        ) : (
                          <>
                            <Plus size={16} color="white" />
                            <Text className="text-white font-medium ml-2">Provision Printer</Text>
                          </>
                        )}
                      </TouchableOpacity>
                      {provisioningError && (
                        <Text className="text-red-400 text-xs mt-2">{provisioningError}</Text>
                      )}
                    </View>
                  )}

                  {paymentTerminal.terminal_type === "dejavoo" && dejavooPrinter && (
                    <View className="mt-3 pt-3 border-t border-gray-600">
                      <View className="flex-row items-center justify-between">
                        <View className="flex-row items-center">
                          <Printer size={16} color="#a78bfa" />
                          <Text className="text-gray-300 text-sm ml-2">Terminal Printer</Text>
                          <View className="flex-row items-center ml-3">
                            {getPrinterStatusIcon(dejavooPrinter)}
                            <Text className={`ml-1 text-xs ${getPrinterStatusColor(dejavooPrinter)}`}>
                              {getPrinterStatusLabel(dejavooPrinter)}
                            </Text>
                          </View>
                        </View>
                        <TouchableOpacity
                          onPress={() => handleTestPrint(dejavooPrinter)}
                          disabled={testPrintingId === dejavooPrinter.id}
                          className="p-2 bg-green-600/20 rounded-lg"
                        >
                          {testPrintingId === dejavooPrinter.id ? (
                            <ActivityIndicator size="small" color={colors.success} />
                          ) : (
                            <Printer size={16} color={colors.success} />
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              ) : (
                <View className="bg-surface p-4 rounded-xl border border-dashed border-gray-600 items-center">
                  <CreditCard size={24} color={colors.muted} />
                  <Text className="text-gray-500 text-sm mt-2">No payment terminal linked</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* ================================================================ */}
        {/* STAR PRINTER DISCOVERY SECTION                                   */}
        {/* ================================================================ */}
        <View className="bg-panel rounded-xl border border-gray-700 mb-6">
          <View className="flex-row items-center justify-between p-4 bg-surface rounded-t-xl border-b border-gray-700">
            <View className="flex-row items-center">
              <View className="w-8 h-8 bg-card rounded-lg items-center justify-center mr-3">
                <Wifi size={20} color={colors.warning} />
              </View>
              <Text className="text-white font-bold text-lg">Star Printers</Text>
            </View>
            <TouchableOpacity
              onPress={handleScanStarPrinters}
              disabled={isScanningStar}
              className="bg-blue-600 px-4 py-2 rounded-lg flex-row items-center"
            >
              {isScanningStar ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <RefreshCw size={14} color="white" />
                  <Text className="text-white font-medium ml-2 text-sm">Scan Network</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          <View className="p-5">
            {isScanningStar && (
              <View className="items-center py-6">
                <ActivityIndicator size="large" color={colors.warning} />
                <Text className="text-gray-400 text-sm mt-3">Scanning for Star printers...</Text>
                <Text className="text-gray-500 text-xs mt-1">This may take up to 10 seconds</Text>
              </View>
            )}

            {starScanError && (
              <View className="bg-red-600/10 border border-red-600/30 rounded-xl p-3 mb-3">
                <Text className="text-red-400 text-sm">{starScanError}</Text>
              </View>
            )}

            {!isScanningStar && discoveredStarPrinters.length === 0 && !starScanError && (
              <View className="items-center py-6">
                <Wifi size={32} color={colors.muted} />
                <Text className="text-gray-500 text-sm mt-3">No Star printers discovered</Text>
                <Text className="text-gray-600 text-xs mt-1">
                  Tap "Scan Network" to search for printers on this network
                </Text>
              </View>
            )}

            {/* Manual IP Entry Card */}
            <View className="bg-surface p-4 rounded-xl border border-gray-600 mb-4">
              <View className="flex-row items-center mb-3">
                <Plus size={16} color={colors.warning} />
                <Text className="text-white font-bold ml-2">Add Printer by IP Address</Text>
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
              {/* Role Toggle */}
              <View className="flex-row rounded-lg overflow-hidden border border-gray-600 mb-3">
                <TouchableOpacity
                  onPress={() => setManualIpRole("receipt")}
                  disabled={isProbing}
                  className={`flex-1 py-2 items-center ${manualIpRole === "receipt" ? "bg-blue-600" : "bg-card"}`}
                >
                  <Text className={`text-sm font-medium ${manualIpRole === "receipt" ? "text-white" : "text-gray-400"}`}>
                    Receipt
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setManualIpRole("kitchen")}
                  disabled={isProbing}
                  className={`flex-1 py-2 items-center ${manualIpRole === "kitchen" ? "bg-orange-600" : "bg-card"}`}
                >
                  <Text className={`text-sm font-medium ${manualIpRole === "kitchen" ? "text-white" : "text-gray-400"}`}>
                    Kitchen
                  </Text>
                </TouchableOpacity>
              </View>
              {manualIpError && (
                <View className="bg-red-600/10 border border-red-600/30 rounded-lg p-2.5 mb-3">
                  <Text className="text-red-400 text-xs">{manualIpError}</Text>
                </View>
              )}
              <TouchableOpacity
                onPress={handleManualIpAdd}
                disabled={isProbing || !manualIp.trim()}
                className={`py-2.5 rounded-lg flex-row items-center justify-center ${
                  isProbing || !manualIp.trim() ? "bg-gray-600" : "bg-blue-600"
                }`}
              >
                {isProbing ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <>
                    <Wifi size={16} color="white" />
                    <Text className="text-white font-medium ml-2 text-sm">Connect Printer</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {discoveredStarPrinters.map((dp) => {
              const alreadyAdded = storedPrinters.some(
                (p) => p.printerType === "star_micronics" && p.networkAddress === dp.ipAddress,
              );
              const isProvisioningThis = provisioningStarIp === dp.ipAddress;

              return (
                <View
                  key={dp.ipAddress}
                  className="bg-surface p-4 rounded-xl border border-gray-600 mb-3"
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1">
                      <View className="flex-row items-center">
                        <Printer size={18} color={colors.warning} />
                        <Text className="text-white font-bold ml-2">{dp.modelName}</Text>
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
                      <View className="flex-row flex-wrap mt-2">
                        <View className="bg-gray-700/50 px-2 py-0.5 rounded mr-2 mb-1">
                          <Text className="text-gray-400 text-[10px]">
                            {dp.capabilities.paperWidth}mm paper
                          </Text>
                        </View>
                        <View className="bg-gray-700/50 px-2 py-0.5 rounded mr-2 mb-1">
                          <Text className="text-gray-400 text-[10px]">
                            {dp.capabilities.maxCharsPerLine} chars/line
                          </Text>
                        </View>
                        <View className="bg-gray-700/50 px-2 py-0.5 rounded mr-2 mb-1">
                          <Text className="text-gray-400 text-[10px]">
                            {dp.capabilities.supportsAutoCut ? "Auto-cut" : "Tear-off"}
                          </Text>
                        </View>
                        {dp.capabilities.graphicsOnly && (
                          <View className="bg-amber-700/50 px-2 py-0.5 rounded mr-2 mb-1">
                            <Text className="text-amber-400 text-[10px]">
                              Graphics-only
                            </Text>
                          </View>
                        )}
                        {/* Role toggle – pre-set to suggested, user can switch */}
                        {(() => {
                          const selectedRole = starRoleOverrides[dp.ipAddress] ?? dp.capabilities.suggestedRole;
                          return (
                            <View className="flex-row rounded overflow-hidden mr-2 mb-1">
                              <TouchableOpacity
                                onPress={() =>
                                  setStarRoleOverrides((prev) => ({ ...prev, [dp.ipAddress]: "receipt" }))
                                }
                                className={`px-2 py-0.5 ${selectedRole === "receipt" ? "bg-blue-600/30" : "bg-gray-700/30"}`}
                              >
                                <Text
                                  className={`text-[10px] font-medium ${selectedRole === "receipt" ? "text-blue-400" : "text-gray-500"}`}
                                >
                                  Receipt
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() =>
                                  setStarRoleOverrides((prev) => ({ ...prev, [dp.ipAddress]: "kitchen" }))
                                }
                                className={`px-2 py-0.5 ${selectedRole === "kitchen" ? "bg-orange-600/30" : "bg-gray-700/30"}`}
                              >
                                <Text
                                  className={`text-[10px] font-medium ${selectedRole === "kitchen" ? "text-orange-400" : "text-gray-500"}`}
                                >
                                  Kitchen
                                </Text>
                              </TouchableOpacity>
                            </View>
                          );
                        })()}
                      </View>
                    </View>
                    {!alreadyAdded && (
                      <TouchableOpacity
                        onPress={() => handleProvisionStar(dp)}
                        disabled={isProvisioningThis}
                        className="ml-3 bg-blue-600 px-4 py-2.5 rounded-lg"
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
          </View>
        </View>

        {/* ================================================================ */}
        {/* PRINTER MANAGEMENT SECTION                                       */}
        {/* ================================================================ */}
        <View className="bg-panel rounded-xl border border-gray-700 mb-6">
          {renderSectionHeader("Printer Management", <Printer size={20} color={colors.info} />, "printers")}
          {expandedSections.printers && (
            <View className="p-5">
              {/* Print Queue Banner */}
              {(queuedJobCount > 0 || failedJobCount > 0) && (
                <View className="flex-row items-center bg-surface border border-gray-600 rounded-xl px-4 py-3 mb-4">
                  <Zap size={16} color={colors.info} />
                  <Text className="text-gray-300 ml-2 text-sm">Print Queue:</Text>
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

              <View className="flex-row justify-between items-center mb-4">
                <Text className="text-gray-400 text-sm">
                  {storedPrinters.length} printer{storedPrinters.length !== 1 ? "s" : ""} configured
                </Text>
                <TouchableOpacity
                  onPress={() => PrinterService.printTestPage()}
                  className="bg-green-600 px-4 py-2 rounded-lg flex-row items-center"
                >
                  <Printer size={16} color="white" />
                  <Text className="text-white font-medium ml-2">Test Print</Text>
                </TouchableOpacity>
              </View>

              {/* Test Print Type Selector */}
              <View className="mb-4">
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

              {storedPrinters.length === 0 ? (
                <View className="items-center py-8">
                  <Printer size={40} color={colors.muted} />
                  <Text className="text-gray-500 text-sm mt-3">No printers configured</Text>
                  <Text className="text-gray-600 text-xs mt-1">
                    Printers are auto-provisioned when hardware is detected
                  </Text>
                </View>
              ) : (
                storedPrinters.map(renderPrinterCard)
              )}
            </View>
          )}
        </View>

        {/* ================================================================ */}
        {/* RECEIPT SETTINGS                                                 */}
        {/* ================================================================ */}
        <View className="bg-panel rounded-xl border border-gray-700 mb-6">
          {renderSectionHeader("Receipt Settings", <Receipt size={20} color={colors.success} />, "receipt")}
          {expandedSections.receipt && (
            <View className="p-5">
              {renderToggleRow("Show Tax Breakdown", "Display itemized tax on receipts", receiptSettings.showTaxBreakdown, () => setReceiptSettings((prev) => ({ ...prev, showTaxBreakdown: !prev.showTaxBreakdown })))}
              {renderToggleRow("Show Itemized List", "Display individual items on receipts", receiptSettings.showItemizedList, () => setReceiptSettings((prev) => ({ ...prev, showItemizedList: !prev.showItemizedList })))}
              {renderToggleRow("Show Tip Options", "Print suggested tip amounts", receiptSettings.showTips, () => setReceiptSettings((prev) => ({ ...prev, showTips: !prev.showTips })))}
              <View className="mt-4">
                <Text className="text-gray-300 font-medium mb-2">Footer Message</Text>
                <TextInput
                  value={receiptSettings.footerMessage}
                  onChangeText={(t) => setReceiptSettings((prev) => ({ ...prev, footerMessage: t }))}
                  className="bg-surface border border-gray-600 rounded-lg p-3 text-white"
                  placeholder="Thank you message"
                  placeholderTextColor={colors.muted}
                />
              </View>
            </View>
          )}
        </View>

        {/* ================================================================ */}
        {/* KITCHEN TICKET SETTINGS                                          */}
        {/* ================================================================ */}
        <View className="bg-panel rounded-xl border border-gray-700 mb-6">
          {renderSectionHeader("Kitchen Ticket Settings", <ChefHat size={20} color={colors.warning} />, "kitchen")}
          {expandedSections.kitchen && (
            <View className="p-5">
              {renderToggleRow("Auto-Fire Tickets", "Automatically send to kitchen when order is placed", kitchenSettings.autoFire, () => setKitchenSettings((prev) => ({ ...prev, autoFire: !prev.autoFire })))}
              {renderToggleRow("Print Void Tickets", "Print ticket when items are voided", kitchenSettings.printVoidTickets, () => setKitchenSettings((prev) => ({ ...prev, printVoidTickets: !prev.printVoidTickets })))}
              {renderToggleRow("Show Guest Count", "Display number of guests on ticket", kitchenSettings.showGuestCount, () => setKitchenSettings((prev) => ({ ...prev, showGuestCount: !prev.showGuestCount })))}
              {renderToggleRow("Show Modifiers", "Display modifiers on kitchen tickets", kitchenSettings.showModifiers, () => setKitchenSettings((prev) => ({ ...prev, showModifiers: !prev.showModifiers })))}
              {renderToggleRow("Show Course Number", "Display course number on tickets", kitchenSettings.showCourseNumber, () => setKitchenSettings((prev) => ({ ...prev, showCourseNumber: !prev.showCourseNumber })))}
              {renderToggleRow("Show Server Name", "Display server name on tickets", kitchenSettings.showServerName, () => setKitchenSettings((prev) => ({ ...prev, showServerName: !prev.showServerName })))}
              {renderToggleRow("Large Font", "Use larger font size for better visibility", kitchenSettings.largeFont, () => setKitchenSettings((prev) => ({ ...prev, largeFont: !prev.largeFont })))}
            </View>
          )}
        </View>

        {/* ================================================================ */}
        {/* PRINTER ROUTING                                                  */}
        {/* ================================================================ */}
        <View className="bg-panel rounded-xl border border-gray-700 mb-6">
          {renderSectionHeader("Printer Routing", <Settings2 size={20} color="#a78bfa" />, "routing")}
          {expandedSections.routing && (
            <View className="p-5">
              <Text className="text-gray-400 text-sm mb-4">
                Route menu categories to specific kitchen printers.
              </Text>
              {printerRoutes.map((route) => {
                const assignedPrinter = storedPrinters.find((p) => p.id === route.printerId);
                return (
                  <View
                    key={route.id}
                    className={`bg-surface p-3 rounded-xl border border-gray-600 mb-2 ${!route.isEnabled ? "opacity-50" : ""}`}
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center flex-1">
                        <Switch checked={route.isEnabled} onCheckedChange={() => toggleRoute(route.id)} />
                        <Text className="text-white font-medium ml-3">{route.category}</Text>
                        <ArrowRight size={16} color={colors.muted} className="mx-2" />
                        <View className="flex-1 ml-2">
                          <Select
                            value={
                              assignedPrinter
                                ? { value: assignedPrinter.id, label: assignedPrinter.printerName }
                                : undefined
                            }
                            onValueChange={(option) =>
                              updateRoutePrinter(route.id, option?.value || "")
                            }
                          >
                            <SelectTrigger className="bg-card border-gray-600">
                              <SelectValue placeholder="Select printer" className="text-white" />
                            </SelectTrigger>
                            <SelectContent className="bg-surface border-gray-600">
                              {kitchenPrinters.map((printer) => (
                                <SelectItem
                                  key={printer.id}
                                  value={printer.id}
                                  label={printer.printerName}
                                >
                                  {printer.printerName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </View>
                      </View>
                      {assignedPrinter && (
                        <View className="flex-row items-center ml-2">
                          {getPrinterStatusIcon(assignedPrinter)}
                          <Text className={`ml-1 text-sm ${getPrinterStatusColor(assignedPrinter)}`}>
                            {getPrinterStatusLabel(assignedPrinter)}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
              <TouchableOpacity
                onPress={openRouteModal}
                className="bg-surface p-4 rounded-xl border border-dashed border-gray-600 flex-row items-center justify-center"
              >
                <Plus size={20} color={colors.info} />
                <Text className="text-blue-400 font-medium ml-2">Add Category Route</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ================================================================ */}
        {/* KDS AUTO-FIRE SECTION                                            */}
        {/* ================================================================ */}
        <View className="bg-panel rounded-xl border border-gray-700 mb-6">
          <View className="flex-row items-center justify-between p-4 bg-surface rounded-t-xl border-b border-gray-700">
            <View className="flex-row items-center">
              <View className="w-8 h-8 bg-card rounded-lg items-center justify-center mr-3">
                <Monitor size={20} color={colors.info} />
              </View>
              <Text className="text-white font-bold text-lg">Kitchen Display (KDS)</Text>
            </View>
          </View>
          <View className="p-5">
            <View className="flex-row items-center justify-between py-3 border-b border-gray-700">
              <View className="flex-1 pr-4">
                <Text className="text-white font-medium">Auto-Fire Pending Courses</Text>
                <Text className="text-gray-400 text-sm mt-1">
                  Automatically move items from Pending to Cooking after a set time
                </Text>
              </View>
              <Switch
                checked={kdsAutoFireEnabled}
                onCheckedChange={(v) => updateField("kdsAutoFireEnabled", v)}
              />
            </View>

            {kdsAutoFireEnabled && (
              <View className="mt-4 bg-black/20 p-4 rounded-lg border border-gray-700">
                <View className="flex-row justify-between items-center mb-3">
                  <Text className="text-gray-300 font-medium">Delay before auto-fire</Text>
                  <Text className="text-blue-400 font-bold text-lg">
                    {kdsAutoFireDelayMinutes} min
                  </Text>
                </View>
                <View className="flex-row gap-2 justify-end">
                  <TouchableOpacity
                    onPress={() =>
                      updateField("kdsAutoFireDelayMinutes", Math.max(1, kdsAutoFireDelayMinutes - 1))
                    }
                    className="bg-gray-700 px-4 py-2 rounded-lg"
                  >
                    <Minus size={18} color="white" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() =>
                      updateField("kdsAutoFireDelayMinutes", Math.min(30, kdsAutoFireDelayMinutes + 1))
                    }
                    className="bg-gray-700 px-4 py-2 rounded-lg"
                  >
                    <Plus size={18} color="white" />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>

        <View className="h-6" />
      </ScrollView>
    </View>
  );
};

export default PrintersKitchenScreen;
