import { Switch } from "@/components/ui/switch";
import { usePaymentTerminal } from "@/hooks/usePaymentTerminal";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { colors } from "@/lib/theme";
import { toastService } from "@/lib/toastService";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import type { StationPaymentTerminal } from "@/types/station";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  CreditCard,
  DollarSign,
  Gauge,
  Lock,
  MessageSquare,
  Minus,
  Monitor,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  Send,
  Shield,
  Trash2,
  Wifi,
  WifiOff,
  X,
  Zap,
} from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

interface SavedCard {
  id: string;
  last4: string;
  brand: string;
  expiry: string;
  customerName: string;
}

interface KDSDisplay {
  id: string;
  name: string;
  ip: string;
  status: "online" | "offline";
  activeOrders: number;
}

const PaymentSystemsScreen = () => {
  // Zustand store
  const {
    dualPricing,
    setDualPricing,
    surcharging,
    setSurcharging,
    funding,
    setFunding,
    tokenizationEnabled,
    textToPayEnabled,
    throttling,
    setThrottling,
    kdsEnabled,
    prepCategories,
    adjustPrepTime,
    showPrepTimesToCustomers,
    autoAdjustPrepTimes,
    updateDiningSettings,
  } = useSettingsStore();

  // Payment terminal stores & hooks
  const supabase = useSupabaseClient();
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const selectedStation = useStoreSettingsStore((s) => s.selectedStation);
  const setSelectedStation = useStoreSettingsStore(
    (s) => s.setSelectedStation
  );
  const {
    terminals,
    isTestingConnection,
    loadTerminals,
    setActiveTerminal,
    testConnection,
    testConnectionWithConfig,
    diagnoseCastlesConnection,
    registerTerminal,
  } = usePaymentTerminal();

  // Terminal UI state
  const [showTerminalPicker, setShowTerminalPicker] = useState(false);
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [registerFormType, setRegisterFormType] = useState<
    "dejavoo" | "castles"
  >("dejavoo");
  const [registerForm, setRegisterForm] = useState({
    name: "",
    tpn: "",
    authKey: "",
    model: "",
    environment: "sandbox" as "sandbox" | "production",
    ipAddress: "",
    port: "8080",
  });
  const [isAssigning, setIsAssigning] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isEditingTerminal, setIsEditingTerminal] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    model: "",
    tpn: "",
    authKey: "",
    ipAddress: "",
    port: "8080",
  });
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Quick IP tester — inline test without saving
  const [quickTestIp, setQuickTestIp] = useState("");
  const [quickTestPort, setQuickTestPort] = useState("8080");
  const [quickTestStatus, setQuickTestStatus] = useState<"idle" | "testing" | "online" | "offline">("idle");

  const handleQuickTest = async () => {
    const ip = quickTestIp.trim();
    if (!ip) return;
    setQuickTestStatus("testing");
    try {
      const ok = await testConnectionWithConfig({
        terminalId: currentTerminal?.id ?? "quick-test",
        terminalType: "castles",
        ipAddress: ip,
        port: parseInt(quickTestPort, 10) || 8080,
      });
      setQuickTestStatus(ok.success ? "online" : "offline");
    } catch {
      setQuickTestStatus("offline");
    }
  };

  // Derive current terminal from selectedStation
  const currentTerminal = selectedStation?.payment_terminal ?? null;

  // Load terminals on mount
  useEffect(() => {
    if (selectedStore?.id) {
      loadTerminals(selectedStore.id);
    }
  }, [selectedStore?.id, loadTerminals]);

  // Local state for features not fully in store yet
  const [textToPayTestSent, setTextToPayTestSent] = useState(false);
  const [currentPrepAdjustment] = useState(5);

  // Local UI state
  const [calculatorAmount, setCalculatorAmount] = useState("100");
  const [savedCards] = useState<SavedCard[]>([
    {
      id: "1",
      last4: "4242",
      brand: "Visa",
      expiry: "12/25",
      customerName: "John Smith",
    },
    {
      id: "2",
      last4: "5555",
      brand: "Mastercard",
      expiry: "03/26",
      customerName: "Sarah Johnson",
    },
    {
      id: "3",
      last4: "0005",
      brand: "Amex",
      expiry: "08/24",
      customerName: "Mike Davis",
    },
  ]);
  const [kdsDisplays] = useState<KDSDisplay[]>([
    {
      id: "1",
      name: "Hot Line Display",
      ip: "192.168.1.50",
      status: "online",
      activeOrders: 12,
    },
    {
      id: "2",
      name: "Cold Line Display",
      ip: "192.168.1.51",
      status: "online",
      activeOrders: 5,
    },
    {
      id: "3",
      name: "Expo Display",
      ip: "192.168.1.52",
      status: "offline",
      activeOrders: 0,
    },
  ]);

  const [expandedSections, setExpandedSections] = useState({
    terminal: true,
    dual: false,
    surcharge: false,
    funding: false,
    token: false,
    text: false,
    throttle: false,
    kds: false,
    prep: false,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const getCapacityColor = (value: number) => {
    if (value < 60) return { bg: "bg-green-600", text: "text-green-400" };
    if (value < 80) return { bg: "bg-yellow-600", text: "text-yellow-400" };
    return { bg: "bg-red-600", text: "text-red-400" };
  };

  const stateCompliance: Record<string, boolean> = {
    California: true,
    "New York": true,
    Texas: true,
    Florida: true,
    Colorado: false,
    Connecticut: false,
    Kansas: false,
    Maine: false,
    Massachusetts: false,
    Oklahoma: false,
  };

  // ---- Terminal handlers ----

  const handleTestConnection = async () => {
    const online = await testConnection();

    // Sync status to station store so terminal info card re-renders immediately
    if (currentTerminal && selectedStation) {
      setSelectedStation({
        ...selectedStation,
        payment_terminal: {
          ...currentTerminal,
          is_connected: online,
          last_connection_status: online ? "Online" : "Offline",
          last_connection_test_at: new Date().toISOString(),
        },
      });
    }

    toastService.show({
      title: online ? "Terminal Online" : "Terminal Offline",
      message: online
        ? "Connection to terminal verified."
        : "Could not reach the terminal. Check network.",
      type: online ? "success" : "error",
    });
  };

  const handleDiagnoseCastles = async () => {
    toastService.show({ title: 'Running TCP Diagnostics...', message: 'Check console for detailed output. Testing 4 delimiter formats (~35s).', type: 'warning' });
    const result = await diagnoseCastlesConnection();
    console.log('[CastlesDiag] Full result:', JSON.stringify(result, null, 2));
    if (result.dataReceived) {
      toastService.show({ title: 'Diagnosis: Data Received!', message: `Delimiter: ${result.delimiterUsed}. Response: ${result.rawResponse?.slice(0, 100)}`, type: 'success' });
    } else if (result.tcpConnected) {
      toastService.show({ title: 'Diagnosis: TCP OK, No Response', message: result.error ?? 'Terminal did not respond to any delimiter', type: 'warning' });
    } else {
      toastService.show({ title: 'Diagnosis: TCP Failed', message: result.error ?? 'Could not establish TCP connection', type: 'error' });
    }
  };

  const handleAssignTerminal = async (terminal: (typeof terminals)[number]) => {
    if (!selectedStation || !selectedStore) return;
    setIsAssigning(true);
    try {
      // Deactivate current active terminal for this station
      const { error: deactivateErr } = await supabase
        .from("payment_terminals")
        .update({ is_active: false })
        .eq("station_id", selectedStation.id)
        .eq("is_active", true);
      if (deactivateErr) throw deactivateErr;

      // Activate the new terminal and assign it to this station
      const { error: activateErr } = await supabase
        .from("payment_terminals")
        .update({ is_active: true, station_id: selectedStation.id })
        .eq("id", terminal.id);
      if (activateErr) throw activateErr;

      // Update payment terminal store
      setActiveTerminal(terminal.id);

      // Build StationPaymentTerminal and update station store
      const newTerminalData: StationPaymentTerminal = {
        id: terminal.id,
        terminal_name: terminal.name,
        register_id: null,
        auth_key: null,
        terminal_type: (terminal.terminalType as StationPaymentTerminal["terminal_type"]) || "dejavoo",
        terminal_model: terminal.model || null,
        is_connected: terminal.isConnected,
        ip_address: terminal.ipAddress,
        port: terminal.port,
        last_connection_status: terminal.lastConnectionStatus || null,
        last_connection_test_at: terminal.lastConnectionTest || null,
      };

      setSelectedStation({
        ...selectedStation,
        payment_terminal: newTerminalData,
      });

      toastService.show({
        title: "Terminal Switched",
        message: `Now using ${terminal.name}.`,
        type: "success",
      });
      setShowTerminalPicker(false);
    } catch (err) {
      console.error("[PaymentSystems] assignTerminal error:", err);
      toastService.show({
        title: "Assignment Failed",
        message:
          err instanceof Error ? err.message : "Failed to switch terminal.",
        type: "error",
      });
    } finally {
      setIsAssigning(false);
    }
  };

  const handleRegisterTerminal = async () => {
    if (!selectedStore || !selectedStation) return;
    setIsRegistering(true);
    let newTerminalId: string | undefined;

    try {
      if (registerFormType === "dejavoo") {
        // Use the hook's registerTerminal (calls register_payment_terminal RPC)
        const result = await registerTerminal({
          locationId: selectedStore.id,
          merchantId: selectedStore.merchant_id,
          stationId: selectedStation.id,
          terminalName: registerForm.name,
          tpn: registerForm.tpn,
          authKey: registerForm.authKey,
          terminalModel: registerForm.model || undefined,
          environment: registerForm.environment,
        });

        if (!result.success) throw new Error(result.error);

        // Update station store with the new terminal
        newTerminalId = result.terminalId;
        if (result.terminalId) {
          setActiveTerminal(result.terminalId);
          const newTerminalData: StationPaymentTerminal = {
            id: result.terminalId,
            terminal_name: registerForm.name,
            register_id: registerForm.tpn,
            auth_key: null,
            terminal_type: "dejavoo",
            terminal_model: registerForm.model || null,
            is_connected: false,
            last_connection_status: null,
            last_connection_test_at: null,
          };
          setSelectedStation({
            ...selectedStation,
            payment_terminal: newTerminalData,
          });
        }
      } else {
        // Castles path — direct inserts (RPC validates Dejavoo-specific fields)
        const { data: terminalRow, error: termErr } = await supabase
          .from("payment_terminals")
          .insert({
            location_id: selectedStore.id,
            merchant_id: selectedStore.merchant_id,
            station_id: selectedStation.id,
            terminal_name: registerForm.name,
            terminal_type: "castles",
            terminal_model: registerForm.model || null,
            register_id: "CASTLES",
            auth_key: "CASTLES",
            local_ip_address: registerForm.ipAddress,
            local_port: parseInt(registerForm.port, 10) || 8080,
            is_active: true,
            is_connected: false,
            api_environment: "production",
          })
          .select("id")
          .single();

        if (termErr) throw termErr;
        newTerminalId = terminalRow.id;

        // Deactivate any other active terminals for this station
        await supabase
          .from("payment_terminals")
          .update({ is_active: false })
          .eq("station_id", selectedStation.id)
          .eq("is_active", true)
          .neq("id", terminalRow.id);

        // Reload and update stores
        await loadTerminals(selectedStore.id);
        setActiveTerminal(terminalRow.id);

        const newTerminalData: StationPaymentTerminal = {
          id: terminalRow.id,
          terminal_name: registerForm.name,
          register_id: null,
          auth_key: null,
          terminal_type: "castles",
          terminal_model: registerForm.model || null,
          is_connected: false,
          ip_address: registerForm.ipAddress,
          port: parseInt(registerForm.port, 10) || 8080,
          last_connection_status: null,
          last_connection_test_at: null,
        };
        setSelectedStation({
          ...selectedStation,
          payment_terminal: newTerminalData,
        });
      }

      // Run connection test after registration
      const testTargetId = newTerminalId || currentTerminal?.id;

      if (testTargetId) {
        const online = await testConnection(testTargetId);

        // Sync status to station store so info card shows result
        if (selectedStation?.payment_terminal) {
          setSelectedStation({
            ...selectedStation,
            payment_terminal: {
              ...selectedStation.payment_terminal,
              is_connected: online,
              last_connection_status: online ? "Online" : "Offline",
              last_connection_test_at: new Date().toISOString(),
            },
          });
        }

        toastService.show({
          title: online ? "Terminal Online" : "Terminal Registered (Offline)",
          message: online
            ? `${registerForm.name} is connected and ready.`
            : `${registerForm.name} registered but could not connect. Check settings.`,
          type: online ? "success" : "warning",
        });
      } else {
        toastService.show({
          title: "Terminal Registered",
          message: `${registerForm.name} has been registered and assigned.`,
          type: "success",
        });
      }

      // Reset form
      setShowRegisterForm(false);
      setRegisterForm({
        name: "",
        tpn: "",
        authKey: "",
        model: "",
        environment: "sandbox",
        ipAddress: "",
        port: "8080",
      });
    } catch (err) {
      console.error("[PaymentSystems] registerTerminal error:", err);
      toastService.show({
        title: "Registration Failed",
        message:
          err instanceof Error ? err.message : "Failed to register terminal.",
        type: "error",
      });
    } finally {
      setIsRegistering(false);
    }
  };

  const isRegisterFormValid =
    registerFormType === "dejavoo"
      ? registerForm.name.trim() &&
        registerForm.tpn.trim() &&
        registerForm.authKey.trim()
      : registerForm.name.trim() && registerForm.ipAddress.trim();

  const isEditFormValid =
    currentTerminal?.terminal_type === "castles"
      ? editForm.name.trim() && editForm.ipAddress.trim()
      : editForm.name.trim() && editForm.tpn.trim();

  const handleStartEdit = () => {
    if (!currentTerminal) return;
    setEditForm({
      name: currentTerminal.terminal_name || "",
      model: currentTerminal.terminal_model || "",
      tpn: currentTerminal.register_id || "",
      authKey: "", // Never pre-fill auth key
      ipAddress: currentTerminal.ip_address || "",
      port: String(currentTerminal.port || 8080),
    });
    setIsEditingTerminal(true);
  };

  const handleSaveEdit = async () => {
    if (!currentTerminal || !selectedStore || !selectedStation) return;
    setIsSavingEdit(true);

    try {
      // 1. Test connection with new config
      const testResult = await testConnectionWithConfig({
        terminalId: currentTerminal.id,
        terminalType: currentTerminal.terminal_type as "castles" | "dejavoo",
        ipAddress: editForm.ipAddress || undefined,
        port: editForm.port ? parseInt(editForm.port, 10) : undefined,
        tpn: editForm.tpn || undefined,
        authKey: editForm.authKey || undefined,
      });

      toastService.show({
        title: testResult.success ? "Terminal Online" : "Terminal Offline",
        message: testResult.success
          ? "Connection verified with new settings."
          : `Could not connect: ${testResult.error || "Check settings."}. Settings will still be saved.`,
        type: testResult.success ? "success" : "warning",
      });

      // 2. Build DB update payload
      const updatePayload: Record<string, any> = {
        terminal_name: editForm.name.trim(),
        terminal_model: editForm.model.trim() || null,
      };

      if (currentTerminal.terminal_type === "castles") {
        updatePayload.local_ip_address = editForm.ipAddress.trim();
        updatePayload.local_port = parseInt(editForm.port, 10) || 8080;
      } else {
        updatePayload.tpn = editForm.tpn.trim();
        updatePayload.register_id = editForm.tpn.trim();
        if (editForm.authKey.trim()) {
          updatePayload.auth_key = editForm.authKey.trim();
        }
      }

      // 3. Update DB
      const { error: dbErr } = await supabase
        .from("payment_terminals")
        .update(updatePayload)
        .eq("id", currentTerminal.id);

      if (dbErr) throw dbErr;

      // 4. Update stores
      const updatedTerminalData: StationPaymentTerminal = {
        ...currentTerminal,
        terminal_name: editForm.name.trim(),
        terminal_model: editForm.model.trim() || null,
        ...(currentTerminal.terminal_type === "castles"
          ? {
              ip_address: editForm.ipAddress.trim(),
              port: parseInt(editForm.port, 10) || 8080,
            }
          : {
              register_id: editForm.tpn.trim(),
            }),
        is_connected: testResult.success,
        last_connection_status: testResult.success ? "Online" : "Offline",
        last_connection_test_at: new Date().toISOString(),
      };

      setSelectedStation({
        ...selectedStation,
        payment_terminal: updatedTerminalData,
      });

      // Reload terminal list
      await loadTerminals(selectedStore.id);

      setIsEditingTerminal(false);
    } catch (err) {
      console.error("[PaymentSystems] saveEdit error:", err);
      toastService.show({
        title: "Save Failed",
        message: err instanceof Error ? err.message : "Failed to save changes.",
        type: "error",
      });
    } finally {
      setIsSavingEdit(false);
    }
  };

  // ---- Section rendering ----

  const renderSectionHeader = (
    title: string,
    icon: React.ReactNode,
    section: keyof typeof expandedSections
  ) => (
    <TouchableOpacity
      onPress={() => toggleSection(section)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        padding: 14,
        backgroundColor: colors.panel,
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        borderBottomWidth: expandedSections[section] ? 1 : 0,
        borderBottomColor: colors.border,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ width: 32, height: 32, backgroundColor: colors.teal + "15", borderRadius: 8, alignItems: "center", justifyContent: "center", marginRight: 10 }}>
          {icon}
        </View>
        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.heading }}>{title}</Text>
      </View>
      {expandedSections[section] ? (
        <ChevronUp size={16} color={colors.label} />
      ) : (
        <ChevronDown size={16} color={colors.label} />
      )}
    </TouchableOpacity>
  );

  const cardTotal =
    parseFloat(calculatorAmount || "0") *
    (1 + parseFloat(dualPricing.discount || "0") / 100);

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen, padding: 20 }}>
      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontSize: 15, fontWeight: "700", color: colors.heading }}>Payment Systems</Text>
        <Text style={{ fontSize: 12, color: colors.label, marginTop: 2 }}>
          Advanced payment features, kitchen operations, and compliance tools.
        </Text>
      </View>

      <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 16 }} />

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* PAYMENT TERMINAL */}
        <View style={{ backgroundColor: colors.panel, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 12, overflow: "hidden" }}>
          {renderSectionHeader(
            "Payment Terminal",
            <Radio size={20} color={colors.info} />,
            "terminal"
          )}
          {expandedSections.terminal && (
            <View className="p-5">
              {/* ---- Register form view ---- */}
              {showRegisterForm ? (
                <View>
                  {/* Header */}
                  <View className="flex-row items-center justify-between mb-4">
                    <View className="flex-row items-center gap-2">
                      <Plus size={18} color={colors.info} />
                      <Text className="text-white font-bold text-base">Add Terminal</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => { setShowRegisterForm(false); setQuickTestStatus("idle"); }}
                      className="p-1"
                    >
                      <X size={18} color={colors.muted} />
                    </TouchableOpacity>
                  </View>

                  {/* Terminal type selector — card style */}
                  <View className="flex-row gap-3 mb-5">
                    <TouchableOpacity
                      onPress={() => setRegisterFormType("castles")}
                      className={`flex-1 rounded-xl border p-3 items-center ${
                        registerFormType === "castles"
                          ? "bg-purple-600/20 border-purple-500"
                          : "bg-surface border-gray-700"
                      }`}
                    >
                      <Wifi size={22} color={registerFormType === "castles" ? "#a78bfa" : colors.muted} />
                      <Text className={`font-bold text-sm mt-1.5 ${registerFormType === "castles" ? "text-purple-300" : "text-gray-400"}`}>
                        Castles
                      </Text>
                      <Text className={`text-[10px] mt-0.5 text-center ${registerFormType === "castles" ? "text-purple-400" : "text-gray-600"}`}>
                        Local TCP / IP
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setRegisterFormType("dejavoo")}
                      className={`flex-1 rounded-xl border p-3 items-center ${
                        registerFormType === "dejavoo"
                          ? "bg-teal-600/20 border-teal-500"
                          : "bg-surface border-gray-700"
                      }`}
                    >
                      <CreditCard size={22} color={registerFormType === "dejavoo" ? colors.info : colors.muted} />
                      <Text style={{ fontWeight: "700", fontSize: 14, marginTop: 6, color: registerFormType === "dejavoo" ? colors.teal : colors.muted }}>
                        Dejavoo
                      </Text>
                      <Text style={{ fontSize: 10, marginTop: 2, textAlign: "center", color: registerFormType === "dejavoo" ? colors.teal : colors.muted }}>
                        Cloud / SPIN API
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* ── CASTLES FLOW ─────────────────────────────────── */}
                  {registerFormType === "castles" && (
                    <>
                      {/* Step 1: Connection */}
                      <View className="mb-4">
                        <View className="flex-row items-center gap-2 mb-2">
                          <View className="w-5 h-5 rounded-full bg-purple-600 items-center justify-center">
                            <Text className="text-white text-[10px] font-bold">1</Text>
                          </View>
                          <Text className="text-gray-300 text-sm font-semibold">Connection</Text>
                        </View>
                        <View className="flex-row gap-2">
                          <View className="flex-[3]">
                            <Text className="text-gray-500 text-xs mb-1">IP Address *</Text>
                            <TextInput
                              value={registerForm.ipAddress}
                              onChangeText={(v) => {
                                setRegisterForm((f) => ({ ...f, ipAddress: v }));
                                setQuickTestStatus("idle");
                              }}
                              placeholder="192.168.1.100"
                              placeholderTextColor={colors.muted}
                              keyboardType="decimal-pad"
                              className="bg-surface border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm"
                            />
                          </View>
                          <View className="flex-[1.2]">
                            <Text className="text-gray-500 text-xs mb-1">Port</Text>
                            <TextInput
                              value={registerForm.port}
                              onChangeText={(v) => setRegisterForm((f) => ({ ...f, port: v }))}
                              placeholder="8080"
                              placeholderTextColor={colors.muted}
                              keyboardType="number-pad"
                              className="bg-surface border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm"
                            />
                          </View>
                        </View>
                        {/* Inline test button */}
                        <TouchableOpacity
                          onPress={async () => {
                            if (!registerForm.ipAddress.trim()) return;
                            setQuickTestStatus("testing");
                            try {
                              const ok = await testConnectionWithConfig({
                                terminalId: "quick-test",
                                terminalType: "castles",
                                ipAddress: registerForm.ipAddress.trim(),
                                port: parseInt(registerForm.port, 10) || 8080,
                              });
                              setQuickTestStatus(ok.success ? "online" : "offline");
                            } catch {
                              setQuickTestStatus("offline");
                            }
                          }}
                          disabled={!registerForm.ipAddress.trim() || quickTestStatus === "testing"}
                          className={`mt-2 flex-row items-center justify-center py-2.5 rounded-lg border ${
                            quickTestStatus === "online"
                              ? "bg-green-600/15 border-green-600/50"
                              : quickTestStatus === "offline"
                                ? "bg-red-600/15 border-red-600/50"
                                : registerForm.ipAddress.trim()
                                  ? "bg-purple-600/15 border-purple-500/50"
                                  : "bg-surface border-gray-700 opacity-50"
                          }`}
                        >
                          {quickTestStatus === "testing" ? (
                            <>
                              <ActivityIndicator size="small" color="#a78bfa" />
                              <Text className="text-purple-300 text-sm ml-2">Testing connection…</Text>
                            </>
                          ) : quickTestStatus === "online" ? (
                            <>
                              <Check size={15} color={colors.success} />
                              <Text className="text-green-400 text-sm font-semibold ml-2">Connected — terminal reachable</Text>
                            </>
                          ) : quickTestStatus === "offline" ? (
                            <>
                              <WifiOff size={15} color={colors.danger} />
                              <Text className="text-red-400 text-sm ml-2">No response — check IP &amp; network</Text>
                            </>
                          ) : (
                            <>
                              <Wifi size={15} color="#a78bfa" />
                              <Text className="text-purple-300 text-sm ml-2">Test Connection</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      </View>

                      {/* Step 2: Name */}
                      <View className="mb-5">
                        <View className="flex-row items-center gap-2 mb-2">
                          <View className="w-5 h-5 rounded-full bg-purple-600 items-center justify-center">
                            <Text className="text-white text-[10px] font-bold">2</Text>
                          </View>
                          <Text className="text-gray-300 text-sm font-semibold">Label</Text>
                        </View>
                        <TextInput
                          value={registerForm.name}
                          onChangeText={(v) => setRegisterForm((f) => ({ ...f, name: v }))}
                          placeholder="e.g. Front Counter, Bar"
                          placeholderTextColor={colors.muted}
                          className="bg-surface border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm"
                        />
                        <View className="mt-2">
                          <Text className="text-gray-500 text-xs mb-1">Model (optional)</Text>
                          <TextInput
                            value={registerForm.model}
                            onChangeText={(v) => setRegisterForm((f) => ({ ...f, model: v }))}
                            placeholder="e.g. S1F2"
                            placeholderTextColor={colors.muted}
                            className="bg-surface border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm"
                          />
                        </View>
                      </View>
                    </>
                  )}

                  {/* ── DEJAVOO FLOW ─────────────────────────────────── */}
                  {registerFormType === "dejavoo" && (
                    <>
                      <View className="mb-3">
                        <Text className="text-gray-500 text-xs mb-1">Terminal Name *</Text>
                        <TextInput
                          value={registerForm.name}
                          onChangeText={(v) => setRegisterForm((f) => ({ ...f, name: v }))}
                          placeholder="e.g. Front Counter"
                          placeholderTextColor={colors.muted}
                          className="bg-surface border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm"
                        />
                      </View>
                      <View className="mb-3">
                        <Text className="text-gray-500 text-xs mb-1">Model (optional)</Text>
                        <TextInput
                          value={registerForm.model}
                          onChangeText={(v) => setRegisterForm((f) => ({ ...f, model: v }))}
                          placeholder="e.g. QD4"
                          placeholderTextColor={colors.muted}
                          className="bg-surface border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm"
                        />
                      </View>
                      <View className="mb-3">
                        <Text className="text-gray-500 text-xs mb-1">TPN *</Text>
                        <TextInput
                          value={registerForm.tpn}
                          onChangeText={(v) => setRegisterForm((f) => ({ ...f, tpn: v }))}
                          placeholder="Terminal Point Number"
                          placeholderTextColor={colors.muted}
                          className="bg-surface border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm"
                        />
                      </View>
                      <View className="mb-3">
                        <Text className="text-gray-500 text-xs mb-1">Auth Key *</Text>
                        <TextInput
                          value={registerForm.authKey}
                          onChangeText={(v) => setRegisterForm((f) => ({ ...f, authKey: v }))}
                          placeholder="Authentication Key"
                          placeholderTextColor={colors.muted}
                          secureTextEntry
                          className="bg-surface border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm"
                        />
                      </View>
                      <View className="mb-5">
                        <Text className="text-gray-500 text-xs mb-1.5">Environment</Text>
                        <View className="flex-row bg-surface rounded-lg overflow-hidden border border-gray-600">
                          <TouchableOpacity
                            onPress={() => setRegisterForm((f) => ({ ...f, environment: "sandbox" }))}
                            className={`flex-1 py-2.5 items-center ${registerForm.environment === "sandbox" ? "bg-yellow-600" : ""}`}
                          >
                            <Text className={`text-sm font-medium ${registerForm.environment === "sandbox" ? "text-white" : "text-gray-400"}`}>
                              Sandbox
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => setRegisterForm((f) => ({ ...f, environment: "production" }))}
                            className={`flex-1 py-2.5 items-center ${registerForm.environment === "production" ? "bg-green-600" : ""}`}
                          >
                            <Text className={`text-sm font-medium ${registerForm.environment === "production" ? "text-white" : "text-gray-400"}`}>
                              Production
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </>
                  )}

                  {/* Register button */}
                  <TouchableOpacity
                    onPress={handleRegisterTerminal}
                    disabled={!isRegisterFormValid || isRegistering}
                    style={{
                      paddingVertical: 12,
                      borderRadius: 10,
                      alignItems: "center",
                      flexDirection: "row",
                      justifyContent: "center",
                      backgroundColor: isRegisterFormValid && !isRegistering ? colors.teal + "20" : colors.screen,
                      borderWidth: 1,
                      borderColor: isRegisterFormValid && !isRegistering ? colors.teal + "50" : colors.border,
                    }}
                  >
                    {isRegistering ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <>
                        <Check size={15} color={isRegisterFormValid ? colors.teal : colors.muted} />
                        <Text style={{ fontSize: 13, color: isRegisterFormValid ? colors.teal : colors.muted, fontWeight: "700", marginLeft: 6 }}>
                          {registerFormType === "castles" ? "Save & Connect" : "Register Terminal"}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ) : showTerminalPicker ? (
                /* ---- Terminal picker view ---- */
                <View>
                  <View className="flex-row items-center justify-between mb-4">
                    <Text className="text-white font-bold text-base">
                      Available Terminals
                    </Text>
                    <TouchableOpacity
                      onPress={() => setShowTerminalPicker(false)}
                    >
                      <Text style={{ color: colors.teal }}>Cancel</Text>
                    </TouchableOpacity>
                  </View>

                  {terminals.length === 0 ? (
                    <Text className="text-gray-400 text-center py-4">
                      No terminals found for this location.
                    </Text>
                  ) : (
                    terminals.map((t) => {
                      const isCurrent = t.id === currentTerminal?.id;
                      const isOtherStation =
                        t.isActive &&
                        t.stationId &&
                        t.stationId !== selectedStation?.id;
                      return (
                        <TouchableOpacity
                          key={t.id}
                          onPress={() =>
                            !isCurrent &&
                            !isOtherStation &&
                            handleAssignTerminal(t)
                          }
                          disabled={
                            isCurrent || isAssigning || !!isOtherStation
                          }
                          className={`bg-surface p-3 rounded-lg border mb-2 flex-row items-center justify-between ${
                            isCurrent
                              ? "border-teal-500 bg-teal-600/10"
                              : isOtherStation
                                ? "border-gray-700 opacity-50"
                                : "border-gray-600"
                          }`}
                        >
                          <View className="flex-row items-center flex-1">
                            <View
                              className={`w-3 h-3 rounded-full mr-3 ${
                                t.isConnected ? "bg-green-500" : "bg-gray-500"
                              }`}
                            />
                            <View className="flex-1">
                              <Text className="text-white font-medium">
                                {t.name}
                              </Text>
                              <View className="flex-row items-center mt-0.5">
                                <View
                                  className={`px-1.5 py-0.5 rounded mr-2 ${
                                    t.terminalType === "castles"
                                      ? "bg-purple-600/30"
                                      : "bg-teal-600/30"
                                  }`}
                                >
                                  <Text
                                    className={`text-xs font-medium ${
                                      t.terminalType === "castles"
                                        ? "text-purple-300"
                                        : "text-teal-300"
                                    }`}
                                  >
                                    {t.terminalType === "castles"
                                      ? "Castles"
                                      : "Dejavoo"}
                                  </Text>
                                </View>
                                {t.model && (
                                  <Text className="text-gray-500 text-xs">
                                    {t.model}
                                  </Text>
                                )}
                              </View>
                            </View>
                          </View>
                          {isCurrent && (
                            <View style={{ backgroundColor: colors.teal + "20", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: colors.teal + "50" }}>
                              <Text style={{ fontSize: 11, color: colors.teal, fontWeight: "700" }}>
                                Current
                              </Text>
                            </View>
                          )}
                          {isOtherStation && (
                            <View className="bg-gray-600 px-2 py-1 rounded">
                              <Text className="text-gray-300 text-xs font-bold">
                                In Use
                              </Text>
                            </View>
                          )}
                          {isAssigning && !isCurrent && (
                            <ActivityIndicator
                              size="small"
                              color={colors.label}
                            />
                          )}
                        </TouchableOpacity>
                      );
                    })
                  )}

                  <TouchableOpacity
                    onPress={() => {
                      setShowTerminalPicker(false);
                      setShowRegisterForm(true);
                    }}
                    className="flex-row items-center justify-center mt-2 py-2"
                  >
                    <Plus size={16} color={colors.info} />
                    <Text style={{ color: colors.teal, fontWeight: "500", marginLeft: 4 }}>
                      Register New Terminal
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : isEditingTerminal && currentTerminal ? (
                /* ---- Edit terminal form ---- */
                <View>
                  <View className="flex-row items-center justify-between mb-4">
                    <View className="flex-row items-center gap-2">
                      <Pencil size={16} color={colors.label} />
                      <Text className="text-white font-bold text-base">Edit Terminal</Text>
                      <View className={`px-2 py-0.5 rounded ${currentTerminal.terminal_type === "castles" ? "bg-purple-600/30" : "bg-teal-600/30"}`}>
                        <Text className={`text-xs font-bold ${currentTerminal.terminal_type === "castles" ? "text-purple-300" : "text-teal-300"}`}>
                          {currentTerminal.terminal_type === "castles" ? "Castles" : "Dejavoo"}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity onPress={() => setIsEditingTerminal(false)} className="p-1">
                      <X size={18} color={colors.muted} />
                    </TouchableOpacity>
                  </View>

                  {/* Name */}
                  <View className="mb-3">
                    <Text className="text-gray-500 text-xs mb-1">Terminal Name *</Text>
                    <TextInput
                      value={editForm.name}
                      onChangeText={(v) => setEditForm((f) => ({ ...f, name: v }))}
                      placeholder="e.g. Front Counter"
                      placeholderTextColor={colors.muted}
                      className="bg-surface border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm"
                    />
                  </View>
                  <View className="mb-4">
                    <Text className="text-gray-500 text-xs mb-1">Model (optional)</Text>
                    <TextInput
                      value={editForm.model}
                      onChangeText={(v) => setEditForm((f) => ({ ...f, model: v }))}
                      placeholder="e.g. QD4"
                      placeholderTextColor={colors.muted}
                      className="bg-surface border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm"
                    />
                  </View>

                  {/* Castles: IP + Port + inline test */}
                  {currentTerminal.terminal_type === "castles" && (
                    <>
                      <Text className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">Connection</Text>
                      <View className="flex-row gap-2 mb-2">
                        <View className="flex-[3]">
                          <Text className="text-gray-500 text-xs mb-1">IP Address *</Text>
                          <TextInput
                            value={editForm.ipAddress}
                            onChangeText={(v) => setEditForm((f) => ({ ...f, ipAddress: v }))}
                            placeholder="192.168.1.100"
                            placeholderTextColor={colors.muted}
                            keyboardType="decimal-pad"
                            className="bg-surface border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm"
                          />
                        </View>
                        <View className="flex-[1.2]">
                          <Text className="text-gray-500 text-xs mb-1">Port</Text>
                          <TextInput
                            value={editForm.port}
                            onChangeText={(v) => setEditForm((f) => ({ ...f, port: v }))}
                            placeholder="8080"
                            placeholderTextColor={colors.muted}
                            keyboardType="number-pad"
                            className="bg-surface border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm"
                          />
                        </View>
                      </View>
                      {/* Inline test */}
                      <View className="flex-row gap-2 mb-4">
                        <TouchableOpacity
                          onPress={async () => {
                            if (!editForm.ipAddress.trim()) return;
                            setQuickTestStatus("testing");
                            try {
                              const ok = await testConnectionWithConfig({
                                terminalId: currentTerminal.id,
                                terminalType: "castles",
                                ipAddress: editForm.ipAddress.trim(),
                                port: parseInt(editForm.port, 10) || 8080,
                              });
                              setQuickTestStatus(ok.success ? "online" : "offline");
                            } catch {
                              setQuickTestStatus("offline");
                            }
                          }}
                          disabled={!editForm.ipAddress.trim() || quickTestStatus === "testing"}
                          className={`flex-1 flex-row items-center justify-center py-2.5 rounded-lg border ${
                            quickTestStatus === "online"
                              ? "bg-green-600/15 border-green-600/50"
                              : quickTestStatus === "offline"
                                ? "bg-red-600/15 border-red-600/50"
                                : "bg-surface border-gray-600"
                          }`}
                        >
                          {quickTestStatus === "testing" ? (
                            <ActivityIndicator size="small" color="#a78bfa" />
                          ) : quickTestStatus === "online" ? (
                            <><Check size={14} color={colors.success} /><Text className="text-green-400 text-sm ml-1.5">Reachable</Text></>
                          ) : quickTestStatus === "offline" ? (
                            <><WifiOff size={14} color={colors.danger} /><Text className="text-red-400 text-sm ml-1.5">Unreachable</Text></>
                          ) : (
                            <><Wifi size={14} color={colors.muted} /><Text className="text-gray-400 text-sm ml-1.5">Test IP</Text></>
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={handleDiagnoseCastles}
                          className="flex-row items-center justify-center px-3 py-2.5 rounded-lg border border-gray-600 bg-surface"
                        >
                          <RefreshCw size={14} color={colors.warning} />
                          <Text className="text-yellow-400 text-sm ml-1.5">Diagnose</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}

                  {/* Dejavoo: TPN + AuthKey */}
                  {currentTerminal.terminal_type !== "castles" && (
                    <>
                      <View className="mb-3">
                        <Text className="text-gray-500 text-xs mb-1">TPN *</Text>
                        <TextInput
                          value={editForm.tpn}
                          onChangeText={(v) => setEditForm((f) => ({ ...f, tpn: v }))}
                          placeholder="Terminal Point Number"
                          placeholderTextColor={colors.muted}
                          className="bg-surface border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm"
                        />
                      </View>
                      <View className="mb-5">
                        <Text className="text-gray-500 text-xs mb-1">Auth Key</Text>
                        <TextInput
                          value={editForm.authKey}
                          onChangeText={(v) => setEditForm((f) => ({ ...f, authKey: v }))}
                          placeholder="Leave blank to keep current"
                          placeholderTextColor={colors.muted}
                          secureTextEntry
                          className="bg-surface border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm"
                        />
                      </View>
                    </>
                  )}

                  {/* Save button */}
                  <TouchableOpacity
                    onPress={handleSaveEdit}
                    disabled={!isEditFormValid || isSavingEdit}
                    style={{
                      paddingVertical: 12,
                      borderRadius: 10,
                      alignItems: "center",
                      flexDirection: "row",
                      justifyContent: "center",
                      backgroundColor: isEditFormValid && !isSavingEdit ? colors.teal + "20" : colors.screen,
                      borderWidth: 1,
                      borderColor: isEditFormValid && !isSavingEdit ? colors.teal + "50" : colors.border,
                    }}
                  >
                    {isSavingEdit ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <>
                        <Check size={15} color={isEditFormValid ? colors.teal : colors.muted} />
                        <Text style={{ fontSize: 13, color: isEditFormValid ? colors.teal : colors.muted, fontWeight: "700", marginLeft: 6 }}>Save Changes</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ) : currentTerminal ? (
                /* ---- Terminal info card (assigned) ---- */
                <View>
                  {/* Main card */}
                  <View className={`rounded-xl border mb-3 overflow-hidden ${
                    currentTerminal.is_connected ? "border-green-600/40" : "border-gray-700"
                  }`}>
                    {/* Top: name + type badge */}
                    <View className="flex-row items-center justify-between px-4 pt-4 pb-3">
                      <View className="flex-1">
                        <View className="flex-row items-center gap-2">
                          <Text className="text-white font-bold text-base">
                            {currentTerminal.terminal_name}
                          </Text>
                          <View className={`px-2 py-0.5 rounded ${
                            currentTerminal.terminal_type === "castles" ? "bg-purple-600/30" : "bg-teal-600/30"
                          }`}>
                            <Text className={`text-[10px] font-bold ${
                              currentTerminal.terminal_type === "castles" ? "text-purple-300" : "text-teal-300"
                            }`}>
                              {currentTerminal.terminal_type === "castles" ? "Castles" : "Dejavoo"}
                            </Text>
                          </View>
                        </View>
                        {currentTerminal.terminal_model ? (
                          <Text className="text-gray-500 text-xs mt-0.5">{currentTerminal.terminal_model}</Text>
                        ) : null}
                      </View>
                      {/* Status dot */}
                      <View className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg ${
                        currentTerminal.is_connected ? "bg-green-600/15" : "bg-gray-700"
                      }`}>
                        <View className={`w-2 h-2 rounded-full ${currentTerminal.is_connected ? "bg-green-400" : "bg-gray-500"}`} />
                        <Text className={`text-xs font-semibold ${currentTerminal.is_connected ? "text-green-400" : "text-gray-400"}`}>
                          {currentTerminal.is_connected ? "Online" : "Offline"}
                        </Text>
                      </View>
                    </View>

                    {/* Connection detail row */}
                    <View className="flex-row items-center justify-between px-4 py-2.5 bg-surface/50 border-t border-gray-700/60">
                      {currentTerminal.terminal_type === "castles" && currentTerminal.ip_address ? (
                        <View className="flex-row items-center gap-1.5">
                          <Wifi size={13} color={colors.muted} />
                          <Text className="text-gray-400 text-sm font-mono">
                            {currentTerminal.ip_address}:{currentTerminal.port || 8080}
                          </Text>
                        </View>
                      ) : currentTerminal.register_id ? (
                        <View className="flex-row items-center gap-1.5">
                          <CreditCard size={13} color={colors.muted} />
                          <Text className="text-gray-400 text-sm">TPN: {currentTerminal.register_id}</Text>
                        </View>
                      ) : (
                        <View />
                      )}
                      {currentTerminal.last_connection_test_at && (
                        <View className="flex-row items-center gap-1">
                          <Clock size={11} color={colors.muted} />
                          <Text className="text-gray-600 text-xs">
                            {new Date(currentTerminal.last_connection_test_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Action row */}
                  <View className="flex-row gap-2">
                    <TouchableOpacity
                      onPress={handleTestConnection}
                      disabled={isTestingConnection}
                      className={`flex-1 py-2.5 rounded-xl items-center flex-row justify-center border ${
                        currentTerminal.is_connected
                          ? "bg-green-600/15 border-green-600/40"
                          : "bg-surface border-gray-600"
                      }`}
                    >
                      {isTestingConnection ? (
                        <ActivityIndicator size="small" color={colors.info} />
                      ) : (
                        <>
                          <RefreshCw size={15} color={currentTerminal.is_connected ? colors.success : colors.info} />
                          <Text style={{ fontWeight: "500", marginLeft: 6, fontSize: 13, color: currentTerminal.is_connected ? colors.success : colors.teal }}>
                            Test
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleStartEdit}
                      className="flex-1 bg-surface border border-gray-600 py-2.5 rounded-xl items-center flex-row justify-center"
                    >
                      <Pencil size={15} color={colors.label} />
                      <Text className="text-gray-300 font-medium ml-1.5 text-sm">Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setShowTerminalPicker(true)}
                      className="flex-1 bg-surface border border-gray-600 py-2.5 rounded-xl items-center flex-row justify-center"
                    >
                      <CreditCard size={15} color={colors.label} />
                      <Text className="text-gray-300 font-medium ml-1.5 text-sm">Switch</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => { setShowRegisterForm(true); setQuickTestStatus("idle"); }}
                      className="flex-1 bg-surface border border-gray-600 py-2.5 rounded-xl items-center flex-row justify-center"
                    >
                      <Plus size={15} color={colors.success} />
                      <Text className="text-green-400 font-medium ml-1.5 text-sm">Add</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                /* ---- Empty state (no terminal) ---- */
                <View>
                  {/* Quick IP tester */}
                  <View className="bg-surface rounded-xl border border-gray-700 p-4 mb-4">
                    <View className="flex-row items-center gap-2 mb-3">
                      <Wifi size={16} color="#a78bfa" />
                      <Text className="text-white font-semibold text-sm">Quick Connect Test</Text>
                      <Text className="text-gray-600 text-xs ml-1">— no setup required</Text>
                    </View>
                    <Text className="text-gray-500 text-xs mb-3">
                      Enter your terminal's IP address to verify it's reachable on this network before registering.
                    </Text>
                    <View className="flex-row gap-2 mb-2">
                      <View className="flex-[3]">
                        <TextInput
                          value={quickTestIp}
                          onChangeText={(v) => { setQuickTestIp(v); setQuickTestStatus("idle"); }}
                          placeholder="192.168.1.100"
                          placeholderTextColor={colors.muted}
                          keyboardType="decimal-pad"
                          className="bg-panel border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm font-mono"
                        />
                      </View>
                      <View className="flex-[1.2]">
                        <TextInput
                          value={quickTestPort}
                          onChangeText={(v) => setQuickTestPort(v)}
                          placeholder="8080"
                          placeholderTextColor={colors.muted}
                          keyboardType="number-pad"
                          className="bg-panel border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm"
                        />
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={handleQuickTest}
                      disabled={!quickTestIp.trim() || quickTestStatus === "testing"}
                      className={`flex-row items-center justify-center py-2.5 rounded-lg border ${
                        quickTestStatus === "online"
                          ? "bg-green-600/15 border-green-600/50"
                          : quickTestStatus === "offline"
                            ? "bg-red-600/15 border-red-600/50"
                            : quickTestIp.trim()
                              ? "bg-purple-600/15 border-purple-500/50"
                              : "bg-panel border-gray-700 opacity-40"
                      }`}
                    >
                      {quickTestStatus === "testing" ? (
                        <><ActivityIndicator size="small" color="#a78bfa" /><Text className="text-purple-300 text-sm ml-2">Testing…</Text></>
                      ) : quickTestStatus === "online" ? (
                        <><Check size={15} color={colors.success} /><Text className="text-green-400 text-sm font-semibold ml-2">Terminal reachable — ready to register</Text></>
                      ) : quickTestStatus === "offline" ? (
                        <><WifiOff size={15} color={colors.danger} /><Text className="text-red-400 text-sm ml-2">No response — check IP address &amp; network</Text></>
                      ) : (
                        <><Wifi size={15} color="#a78bfa" /><Text className="text-purple-300 text-sm ml-2">Test Connection</Text></>
                      )}
                    </TouchableOpacity>
                    {/* Auto-fill button if test passed */}
                    {quickTestStatus === "online" && (
                      <TouchableOpacity
                        onPress={() => {
                          setRegisterForm((f) => ({ ...f, ipAddress: quickTestIp, port: quickTestPort }));
                          setShowRegisterForm(true);
                          setRegisterFormType("castles");
                        }}
                        className="flex-row items-center justify-center py-2 mt-2 rounded-lg bg-green-600/20"
                      >
                        <ChevronRight size={14} color={colors.success} />
                        <Text className="text-green-400 text-sm font-semibold ml-1">Register this terminal</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* CTA buttons */}
                  <View className="flex-row gap-3">
                    {terminals.length > 0 && (
                      <TouchableOpacity
                        onPress={() => setShowTerminalPicker(true)}
                        style={{ flex: 1, backgroundColor: colors.teal + "20", paddingVertical: 12, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.teal + "50" }}
                      >
                        <CreditCard size={15} color={colors.teal} />
                        <Text style={{ fontSize: 13, color: colors.teal, fontWeight: "700", marginLeft: 6 }}>Assign Existing</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      onPress={() => { setShowRegisterForm(true); setQuickTestStatus("idle"); }}
                      style={{ flex: 1, backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border, paddingVertical: 12, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center" }}
                    >
                      <Plus size={15} color={colors.teal} />
                      <Text style={{ fontSize: 13, color: colors.teal, fontWeight: "700", marginLeft: 6 }}>Register New</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}
        </View>

        {/* TEXT-TO-PAY */}
        <View style={{ backgroundColor: colors.panel, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 12, overflow: "hidden" }}>
          {renderSectionHeader(
            "Text-to-Pay",
            <MessageSquare size={20} color="#a78bfa" />,
            "text"
          )}
          {expandedSections.text && (
            <View className="p-5">
              <View className="flex-row items-center justify-between py-3 border-b border-gray-700 mb-4">
                <View className="flex-1 pr-4">
                  <Text className="text-white font-medium">
                    Enable SMS Payment Links
                  </Text>
                  <Text className="text-gray-400 text-sm">
                    Send payment links via text
                  </Text>
                </View>
                <Switch
                  checked={textToPayEnabled}
                  onCheckedChange={(v) =>
                    updateDiningSettings({ textToPayEnabled: v })
                  }
                />
              </View>

              {textToPayEnabled && (
                <>
                  <View className="bg-surface p-4 rounded-lg border border-gray-600 mb-4">
                    <Text className="text-gray-400 text-xs mb-2">
                      SMS Preview
                    </Text>
                    <View className="bg-panel p-3 rounded-lg">
                      <Text className="text-white text-sm">
                        "Hi [Name], your order at Dexa POS is ready! Pay
                        securely here: https://pay.dexa.app/abc123"
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    onPress={() => setTextToPayTestSent(true)}
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: 8, borderWidth: 1, marginBottom: 14, backgroundColor: textToPayTestSent ? colors.success + "20" : "transparent", borderColor: textToPayTestSent ? colors.success : colors.teal }}
                  >
                    {textToPayTestSent ? (
                      <>
                        <Check size={18} color={colors.success} />
                        <Text className="text-green-400 font-medium ml-2">
                          Test Sent Successfully!
                        </Text>
                      </>
                    ) : (
                      <>
                        <Send size={18} color={colors.info} />
                        <Text style={{ color: colors.teal, fontWeight: "500", marginLeft: 8 }}>
                          Send Test SMS
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <View className="flex-row gap-4">
                    <View className="bg-surface p-3 rounded-lg flex-1 border border-gray-600">
                      <Text className="text-gray-400 text-xs uppercase">
                        Paid via Text
                      </Text>
                      <Text className="text-white text-xl font-bold">328</Text>
                    </View>
                    <View className="bg-surface p-3 rounded-lg flex-1 border border-gray-600">
                      <Text className="text-gray-400 text-xs uppercase">
                        Avg. Pay Time
                      </Text>
                      <Text className="text-white text-xl font-bold">
                        2.3 min
                      </Text>
                    </View>
                  </View>
                </>
              )}
            </View>
          )}
        </View>

        {/* KITCHEN THROTTLING */}
        <View style={{ backgroundColor: colors.panel, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 12, overflow: "hidden" }}>
          {renderSectionHeader(
            "Smart Kitchen Throttling",
            <Gauge size={20} color={colors.warning} />,
            "throttle"
          )}
          {expandedSections.throttle && (
            <View className="p-5">
              <View className="flex-row items-center justify-between py-3 border-b border-gray-700 mb-4">
                <View className="flex-1 pr-4">
                  <Text className="text-white font-medium">Auto-Throttle</Text>
                  <Text className="text-gray-400 text-sm">
                    Automatically manage kitchen capacity
                  </Text>
                </View>
                <Switch
                  checked={throttling.enabled}
                  onCheckedChange={(v) => setThrottling({ enabled: v })}
                />
              </View>

              {throttling.enabled && (
                <>
                  <View className="mb-4">
                    <Text className="text-gray-300 font-medium mb-2">
                      Throttle Threshold: {throttling.capacity}%
                    </Text>
                    <View className="flex-row gap-1 mb-2">
                      {[50, 60, 70, 75, 80, 90].map((val) => (
                        <TouchableOpacity
                          key={val}
                          onPress={() => setThrottling({ capacity: val })}
                          className={`flex-1 py-2 rounded ${throttling.capacity === val ? getCapacityColor(val).bg : "bg-surface"}`}
                        >
                          <Text
                            className={`text-center text-sm font-bold ${throttling.capacity === val ? "text-white" : "text-gray-500"}`}
                          >
                            {val}%
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View className="flex-row h-3 rounded-full overflow-hidden">
                      <View className="flex-[60] bg-green-600" />
                      <View className="flex-[20] bg-yellow-600" />
                      <View className="flex-[20] bg-red-600" />
                    </View>
                  </View>

                  <View
                    className={`p-4 rounded-lg border mb-4 ${getCapacityColor(throttling.currentLoad).bg}/10 border-${getCapacityColor(throttling.currentLoad).bg}/30`}
                  >
                    <View className="flex-row justify-between items-center">
                      <Text className="text-white font-bold">
                        Current Kitchen Load
                      </Text>
                      <Text
                        className={`text-2xl font-bold ${getCapacityColor(throttling.currentLoad).text}`}
                      >
                        {throttling.currentLoad}%
                      </Text>
                    </View>
                    <Text className="text-gray-400 text-sm mt-1">
                      12 active orders • 3 pending fire
                    </Text>
                  </View>

                  <Text className="text-gray-300 font-medium mb-2">
                    Actions When Threshold Reached
                  </Text>
                  <View className="bg-surface p-3 rounded-lg border border-gray-600">
                    <View className="flex-row items-center justify-between py-2 border-b border-gray-700">
                      <Text className="text-white">Pause online orders</Text>
                      <Switch
                        checked={throttling.pauseOnline}
                        onCheckedChange={(v) =>
                          setThrottling({ pauseOnline: v })
                        }
                      />
                    </View>
                    <View className="flex-row items-center justify-between py-2 border-b border-gray-700">
                      <Text className="text-white">Increase prep times</Text>
                      <Switch
                        checked={throttling.increasePrepTime}
                        onCheckedChange={(v) =>
                          setThrottling({ increasePrepTime: v })
                        }
                      />
                    </View>
                    <View className="flex-row items-center justify-between py-2">
                      <Text className="text-white">Alert manager</Text>
                      <Switch
                        checked={throttling.alertManager}
                        onCheckedChange={(v) =>
                          setThrottling({ alertManager: v })
                        }
                      />
                    </View>
                  </View>
                </>
              )}
            </View>
          )}
        </View>

        <View className="h-10" />
      </ScrollView>
    </View>
  );
};

export default PaymentSystemsScreen;
