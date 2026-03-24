import { Switch } from "@/components/ui/switch";
import { usePaymentTerminal } from "@/hooks/usePaymentTerminal";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { colors } from "@/lib/theme";
import { toastService } from "@/lib/toastService";
import { useKDSStore } from "@/stores/useKDSStore";
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
    <View style={{ flex: 1, backgroundColor: colors.screen, paddingHorizontal: 14, paddingVertical: 10 }}>
      <View style={{ marginBottom: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: "700", color: colors.heading }}>Payment Systems</Text>
        <Text style={{ fontSize: 11, color: colors.label, marginTop: 2 }}>
          Advanced payment features, kitchen operations, and compliance tools.
        </Text>
      </View>

      <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 16 }} />

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* PAYMENT TERMINAL */}
        <View style={{ backgroundColor: colors.panel, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 12, overflow: "hidden" }}>
          {renderSectionHeader(
            "Payment Terminal",
            <Radio size={20} color={colors.teal} />,
            "terminal"
          )}
          {expandedSections.terminal && (
            <View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
              {/* ---- Register form view ---- */}
              {showRegisterForm ? (
                <View>
                  {/* Header */}
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Plus size={16} color={colors.teal} />
                      <Text style={{ color: colors.heading, fontWeight: "700", fontSize: 13 }}>Add Terminal</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => { setShowRegisterForm(false); setQuickTestStatus("idle"); }}
                      style={{ padding: 4 }}
                    >
                      <X size={18} color={colors.muted} />
                    </TouchableOpacity>
                  </View>

                  {/* Terminal type selector — card style */}
                  <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
                    <TouchableOpacity
                      onPress={() => setRegisterFormType("castles")}
                      style={{
                        flex: 1,
                        borderRadius: 8,
                        borderWidth: 1,
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        alignItems: "center",
                        backgroundColor: registerFormType === "castles" ? colors.teal + "20" : "transparent",
                        borderColor: registerFormType === "castles" ? colors.teal + "50" : colors.border,
                      }}
                    >
                      <Wifi size={18} color={registerFormType === "castles" ? colors.teal : colors.muted} />
                      <Text style={{ fontWeight: "700", fontSize: 12, marginTop: 6, color: registerFormType === "castles" ? colors.teal : colors.muted }}>
                        Castles
                      </Text>
                      <Text style={{ fontSize: 10, marginTop: 2, textAlign: "center", color: registerFormType === "castles" ? colors.label : colors.muted }}>
                        Local TCP / IP
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setRegisterFormType("dejavoo")}
                      style={{
                        flex: 1,
                        borderRadius: 8,
                        borderWidth: 1,
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        alignItems: "center",
                        backgroundColor: registerFormType === "dejavoo" ? colors.teal + "20" : "transparent",
                        borderColor: registerFormType === "dejavoo" ? colors.teal + "50" : colors.border,
                      }}
                    >
                      <CreditCard size={18} color={registerFormType === "dejavoo" ? colors.teal : colors.muted} />
                      <Text style={{ fontWeight: "700", fontSize: 12, marginTop: 6, color: registerFormType === "dejavoo" ? colors.teal : colors.muted }}>
                        Dejavoo
                      </Text>
                      <Text style={{ fontSize: 10, marginTop: 2, textAlign: "center", color: registerFormType === "dejavoo" ? colors.label : colors.muted }}>
                        Cloud / SPIN API
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* ── CASTLES FLOW ─────────────────────────────────── */}
                  {registerFormType === "castles" && (
                    <>
                      {/* Step 1: Connection */}
                      <View style={{ marginBottom: 16 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.teal + "20", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.teal + "50" }}>
                            <Text style={{ color: colors.teal, fontSize: 10, fontWeight: "bold" }}>1</Text>
                          </View>
                          <Text style={{ color: colors.label, fontSize: 13, fontWeight: "600" }}>Connection</Text>
                        </View>
                        <View style={{ flexDirection: "row", gap: 8 }}>
                          <View style={{ flex: 3 }}>
                            <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>IP Address *</Text>
                            <TextInput
                              value={registerForm.ipAddress}
                              onChangeText={(v) => {
                                setRegisterForm((f) => ({ ...f, ipAddress: v }));
                                setQuickTestStatus("idle");
                              }}
                              placeholder="192.168.1.100"
                              placeholderTextColor={colors.muted}
                              keyboardType="decimal-pad"
                              style={{ backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: colors.heading, fontSize: 13 }}
                            />
                          </View>
                          <View style={{ flex: 1.2 }}>
                            <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>Port</Text>
                            <TextInput
                              value={registerForm.port}
                              onChangeText={(v) => setRegisterForm((f) => ({ ...f, port: v }))}
                              placeholder="8080"
                              placeholderTextColor={colors.muted}
                              keyboardType="number-pad"
                              style={{ backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: colors.heading, fontSize: 13 }}
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
                          style={{
                            marginTop: 8,
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "center",
                            paddingVertical: 10,
                            borderRadius: 8,
                            borderWidth: 1,
                            backgroundColor: quickTestStatus === "online"
                              ? colors.success + "15"
                              : quickTestStatus === "offline"
                                ? colors.danger + "15"
                                : registerForm.ipAddress.trim()
                                  ? colors.teal + "15"
                                  : colors.screen,
                            borderColor: quickTestStatus === "online"
                              ? colors.success + "50"
                              : quickTestStatus === "offline"
                                ? colors.danger + "50"
                                : registerForm.ipAddress.trim()
                                  ? colors.teal + "50"
                                  : colors.border,
                            opacity: !registerForm.ipAddress.trim() ? 0.5 : 1,
                          }}
                        >
                          {quickTestStatus === "testing" ? (
                            <>
                              <ActivityIndicator size="small" color={colors.teal} />
                              <Text style={{ color: colors.teal, fontSize: 13, marginLeft: 8 }}>Testing connection…</Text>
                            </>
                          ) : quickTestStatus === "online" ? (
                            <>
                              <Check size={15} color={colors.success} />
                              <Text style={{ color: colors.success, fontSize: 13, fontWeight: "600", marginLeft: 8 }}>Connected — terminal reachable</Text>
                            </>
                          ) : quickTestStatus === "offline" ? (
                            <>
                              <WifiOff size={15} color={colors.danger} />
                              <Text style={{ color: colors.danger, fontSize: 13, marginLeft: 8 }}>No response — check IP &amp; network</Text>
                            </>
                          ) : (
                            <>
                              <Wifi size={15} color={colors.teal} />
                              <Text style={{ color: colors.teal, fontSize: 13, marginLeft: 8 }}>Test Connection</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      </View>

                      {/* Step 2: Name */}
                      <View style={{ marginBottom: 20 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.teal + "20", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.teal + "50" }}>
                            <Text style={{ color: colors.teal, fontSize: 10, fontWeight: "bold" }}>2</Text>
                          </View>
                          <Text style={{ color: colors.label, fontSize: 13, fontWeight: "600" }}>Label</Text>
                        </View>
                        <TextInput
                          value={registerForm.name}
                          onChangeText={(v) => setRegisterForm((f) => ({ ...f, name: v }))}
                          placeholder="e.g. Front Counter, Bar"
                          placeholderTextColor={colors.muted}
                          style={{ backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: colors.heading, fontSize: 13 }}
                        />
                        <View style={{ marginTop: 8 }}>
                          <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>Model (optional)</Text>
                          <TextInput
                            value={registerForm.model}
                            onChangeText={(v) => setRegisterForm((f) => ({ ...f, model: v }))}
                            placeholder="e.g. S1F2"
                            placeholderTextColor={colors.muted}
                            style={{ backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: colors.heading, fontSize: 13 }}
                          />
                        </View>
                      </View>
                    </>
                  )}

                  {/* ── DEJAVOO FLOW ─────────────────────────────────── */}
                  {registerFormType === "dejavoo" && (
                    <>
                      <View style={{ marginBottom: 12 }}>
                        <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>Terminal Name *</Text>
                        <TextInput
                          value={registerForm.name}
                          onChangeText={(v) => setRegisterForm((f) => ({ ...f, name: v }))}
                          placeholder="e.g. Front Counter"
                          placeholderTextColor={colors.muted}
                          style={{ backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: colors.heading, fontSize: 13 }}
                        />
                      </View>
                      <View style={{ marginBottom: 12 }}>
                        <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>Model (optional)</Text>
                        <TextInput
                          value={registerForm.model}
                          onChangeText={(v) => setRegisterForm((f) => ({ ...f, model: v }))}
                          placeholder="e.g. QD4"
                          placeholderTextColor={colors.muted}
                          style={{ backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: colors.heading, fontSize: 13 }}
                        />
                      </View>
                      <View style={{ marginBottom: 12 }}>
                        <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>TPN *</Text>
                        <TextInput
                          value={registerForm.tpn}
                          onChangeText={(v) => setRegisterForm((f) => ({ ...f, tpn: v }))}
                          placeholder="Terminal Point Number"
                          placeholderTextColor={colors.muted}
                          style={{ backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: colors.heading, fontSize: 13 }}
                        />
                      </View>
                      <View style={{ marginBottom: 12 }}>
                        <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>Auth Key *</Text>
                        <TextInput
                          value={registerForm.authKey}
                          onChangeText={(v) => setRegisterForm((f) => ({ ...f, authKey: v }))}
                          placeholder="Authentication Key"
                          placeholderTextColor={colors.muted}
                          secureTextEntry
                          style={{ backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: colors.heading, fontSize: 13 }}
                        />
                      </View>
                      <View style={{ marginBottom: 20 }}>
                        <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 6 }}>Environment</Text>
                        <View style={{ flexDirection: "row", backgroundColor: colors.screen, borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
                          <TouchableOpacity
                            onPress={() => setRegisterForm((f) => ({ ...f, environment: "sandbox" }))}
                            style={{ flex: 1, paddingVertical: 10, alignItems: "center", backgroundColor: registerForm.environment === "sandbox" ? colors.teal + "20" : "transparent" }}
                          >
                            <Text style={{ fontSize: 13, fontWeight: "500", color: registerForm.environment === "sandbox" ? colors.teal : colors.muted }}>
                              Sandbox
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => setRegisterForm((f) => ({ ...f, environment: "production" }))}
                            style={{ flex: 1, paddingVertical: 10, alignItems: "center", backgroundColor: registerForm.environment === "production" ? colors.teal + "20" : "transparent" }}
                          >
                            <Text style={{ fontSize: 13, fontWeight: "500", color: registerForm.environment === "production" ? colors.teal : colors.muted }}>
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
                      <ActivityIndicator size="small" color={colors.teal} />
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
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                    <Text style={{ color: colors.heading, fontWeight: "bold", fontSize: 14 }}>
                      Available Terminals
                    </Text>
                    <TouchableOpacity
                      onPress={() => setShowTerminalPicker(false)}
                    >
                      <Text style={{ color: colors.teal }}>Cancel</Text>
                    </TouchableOpacity>
                  </View>

                  {terminals.length === 0 ? (
                    <Text style={{ color: colors.muted, textAlign: "center", paddingVertical: 16 }}>
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
                          style={{
                            backgroundColor: isCurrent ? colors.teal + "10" : colors.screen,
                            paddingHorizontal: 12,
                            paddingVertical: 12,
                            borderRadius: 8,
                            marginBottom: 8,
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                            borderWidth: 1,
                            borderColor: isCurrent ? colors.teal + "50" : isOtherStation ? colors.border : colors.border,
                            opacity: isOtherStation ? 0.5 : 1,
                          }}
                        >
                          <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                            <View
                              style={{
                                width: 12,
                                height: 12,
                                borderRadius: 6,
                                marginRight: 12,
                                backgroundColor: t.isConnected ? colors.success : colors.muted,
                              }}
                            />
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: colors.heading, fontWeight: "500" }}>
                                {t.name}
                              </Text>
                              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                                <View
                                  style={{
                                    paddingHorizontal: 6,
                                    paddingVertical: 2,
                                    borderRadius: 4,
                                    marginRight: 8,
                                    backgroundColor: t.terminalType === "castles" ? colors.teal + "30" : colors.teal + "30",
                                  }}
                                >
                                  <Text
                                    style={{
                                      fontSize: 11,
                                      fontWeight: "500",
                                      color: colors.teal,
                                    }}
                                  >
                                    {t.terminalType === "castles"
                                      ? "Castles"
                                      : "Dejavoo"}
                                  </Text>
                                </View>
                                {t.model && (
                                  <Text style={{ color: colors.muted, fontSize: 11 }}>
                                    {t.model}
                                  </Text>
                                )}
                              </View>
                            </View>
                          </View>
                          {isCurrent && (
                            <View style={{ backgroundColor: colors.teal + "20", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, borderWidth: 1, borderColor: colors.teal + "50" }}>
                              <Text style={{ fontSize: 11, color: colors.teal, fontWeight: "700" }}>
                                Current
                              </Text>
                            </View>
                          )}
                          {isOtherStation && (
                            <View style={{ backgroundColor: colors.border, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 }}>
                              <Text style={{ color: colors.label, fontSize: 11, fontWeight: "bold" }}>
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
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 8, paddingVertical: 8 }}
                  >
                    <Plus size={16} color={colors.teal} />
                    <Text style={{ color: colors.teal, fontWeight: "500", marginLeft: 4 }}>
                      Register New Terminal
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : isEditingTerminal && currentTerminal ? (
                /* ---- Edit terminal form ---- */
                <View>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Pencil size={16} color={colors.teal} />
                      <Text style={{ color: colors.heading, fontWeight: "bold", fontSize: 14 }}>Edit Terminal</Text>
                      <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, backgroundColor: colors.teal + "30" }}>
                        <Text style={{ fontSize: 11, fontWeight: "bold", color: colors.teal }}>
                          {currentTerminal.terminal_type === "castles" ? "Castles" : "Dejavoo"}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity onPress={() => setIsEditingTerminal(false)} style={{ padding: 4 }}>
                      <X size={18} color={colors.muted} />
                    </TouchableOpacity>
                  </View>

                  {/* Name */}
                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>Terminal Name *</Text>
                    <TextInput
                      value={editForm.name}
                      onChangeText={(v) => setEditForm((f) => ({ ...f, name: v }))}
                      placeholder="e.g. Front Counter"
                      placeholderTextColor={colors.muted}
                      style={{ backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: colors.heading, fontSize: 13 }}
                    />
                  </View>
                  <View style={{ marginBottom: 16 }}>
                    <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>Model (optional)</Text>
                    <TextInput
                      value={editForm.model}
                      onChangeText={(v) => setEditForm((f) => ({ ...f, model: v }))}
                      placeholder="e.g. QD4"
                      placeholderTextColor={colors.muted}
                      style={{ backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: colors.heading, fontSize: 13 }}
                    />
                  </View>

                  {/* Castles: IP + Port + inline test */}
                  {currentTerminal.terminal_type === "castles" && (
                    <>
                      <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "600", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>Connection</Text>
                      <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
                        <View style={{ flex: 3 }}>
                          <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>IP Address *</Text>
                          <TextInput
                            value={editForm.ipAddress}
                            onChangeText={(v) => setEditForm((f) => ({ ...f, ipAddress: v }))}
                            placeholder="192.168.1.100"
                            placeholderTextColor={colors.muted}
                            keyboardType="decimal-pad"
                            style={{ backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: colors.heading, fontSize: 13 }}
                          />
                        </View>
                        <View style={{ flex: 1.2 }}>
                          <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>Port</Text>
                          <TextInput
                            value={editForm.port}
                            onChangeText={(v) => setEditForm((f) => ({ ...f, port: v }))}
                            placeholder="8080"
                            placeholderTextColor={colors.muted}
                            keyboardType="number-pad"
                            style={{ backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: colors.heading, fontSize: 13 }}
                          />
                        </View>
                      </View>
                      {/* Inline test */}
                      <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
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
                          style={{
                            flex: 1,
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "center",
                            paddingVertical: 10,
                            borderRadius: 8,
                            borderWidth: 1,
                            backgroundColor: quickTestStatus === "online"
                              ? colors.success + "15"
                              : quickTestStatus === "offline"
                                ? colors.danger + "15"
                                : colors.screen,
                            borderColor: quickTestStatus === "online"
                              ? colors.success + "50"
                              : quickTestStatus === "offline"
                                ? colors.danger + "50"
                                : colors.border,
                          }}
                        >
                          {quickTestStatus === "testing" ? (
                            <ActivityIndicator size="small" color={colors.teal} />
                          ) : quickTestStatus === "online" ? (
                            <><Check size={14} color={colors.success} /><Text style={{ color: colors.success, fontSize: 13, marginLeft: 6, fontWeight: "500" }}>Reachable</Text></>
                          ) : quickTestStatus === "offline" ? (
                            <><WifiOff size={14} color={colors.danger} /><Text style={{ color: colors.danger, fontSize: 13, marginLeft: 6, fontWeight: "500" }}>Unreachable</Text></>
                          ) : (
                            <><Wifi size={14} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 13, marginLeft: 6 }}>Test IP</Text></>
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={handleDiagnoseCastles}
                          style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.teal + "50", backgroundColor: colors.teal + "20" }}
                        >
                          <RefreshCw size={14} color={colors.teal} />
                          <Text style={{ color: colors.teal, fontSize: 13, marginLeft: 6, fontWeight: "500" }}>Diagnose</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}

                  {/* Dejavoo: TPN + AuthKey */}
                  {currentTerminal.terminal_type !== "castles" && (
                    <>
                      <View style={{ marginBottom: 12 }}>
                        <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>TPN *</Text>
                        <TextInput
                          value={editForm.tpn}
                          onChangeText={(v) => setEditForm((f) => ({ ...f, tpn: v }))}
                          placeholder="Terminal Point Number"
                          placeholderTextColor={colors.muted}
                          style={{ backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: colors.heading, fontSize: 13 }}
                        />
                      </View>
                      <View style={{ marginBottom: 20 }}>
                        <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>Auth Key</Text>
                        <TextInput
                          value={editForm.authKey}
                          onChangeText={(v) => setEditForm((f) => ({ ...f, authKey: v }))}
                          placeholder="Leave blank to keep current"
                          placeholderTextColor={colors.muted}
                          secureTextEntry
                          style={{ backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: colors.heading, fontSize: 13 }}
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
                  <View style={{
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: currentTerminal.is_connected ? colors.success + "40" : colors.border,
                    marginBottom: 12,
                    overflow: "hidden",
                  }}>
                    {/* Top: name + type badge */}
                    <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 10 }}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Text style={{ color: colors.heading, fontWeight: "700", fontSize: 13 }}>
                            {currentTerminal.terminal_name}
                          </Text>
                          <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: colors.teal + "20" }}>
                            <Text style={{ fontSize: 9, fontWeight: "700", color: colors.teal }}>
                              {currentTerminal.terminal_type === "castles" ? "CASTLES" : "DEJAVOO"}
                            </Text>
                          </View>
                        </View>
                        <View style={{ marginTop: 4, gap: 2 }}>
                          {currentTerminal.terminal_model && (
                            <Text style={{ color: colors.muted, fontSize: 10 }}>{currentTerminal.terminal_model}</Text>
                          )}
                          {currentTerminal.terminal_type === "castles" && currentTerminal.ip_address ? (
                            <Text style={{ color: colors.muted, fontSize: 9, fontFamily: "monospace" }}>
                              {currentTerminal.ip_address}:{currentTerminal.port || 8080}
                            </Text>
                          ) : currentTerminal.register_id ? (
                            <Text style={{ color: colors.muted, fontSize: 9 }}>TPN: {currentTerminal.register_id}</Text>
                          ) : null}
                          {currentTerminal.last_connection_test_at && (
                            <Text style={{ color: colors.muted, fontSize: 8 }}>
                              {new Date(currentTerminal.last_connection_test_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })}
                            </Text>
                          )}
                        </View>
                      </View>
                      {/* Status dot */}
                      <View style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 6,
                        backgroundColor: currentTerminal.is_connected ? colors.success + "15" : colors.danger + "15",
                      }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: currentTerminal.is_connected ? colors.success : colors.danger }} />
                        <Text style={{ fontSize: 10, fontWeight: "600", color: currentTerminal.is_connected ? colors.success : colors.danger }}>
                          {currentTerminal.is_connected ? "Online" : "Offline"}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Action row */}
                  <View style={{ flexDirection: "row", gap: 6, paddingHorizontal: 12, paddingVertical: 8 }}>
                    <TouchableOpacity
                      onPress={handleTestConnection}
                      disabled={isTestingConnection}
                      style={{
                        flex: 1,
                        paddingVertical: 8,
                        borderRadius: 8,
                        alignItems: "center",
                        flexDirection: "row",
                        justifyContent: "center",
                        borderWidth: 1,
                        backgroundColor: currentTerminal.is_connected ? colors.success + "20" : colors.teal + "20",
                        borderColor: currentTerminal.is_connected ? colors.success + "50" : colors.teal + "50",
                      }}
                    >
                      {isTestingConnection ? (
                        <ActivityIndicator size="small" color={colors.teal} />
                      ) : (
                        <>
                          <RefreshCw size={13} color={currentTerminal.is_connected ? colors.success : colors.teal} />
                          <Text style={{ fontWeight: "600", marginLeft: 4, fontSize: 11, color: currentTerminal.is_connected ? colors.success : colors.teal }}>
                            Test
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleStartEdit}
                      style={{ flex: 1, backgroundColor: colors.teal + "20", borderWidth: 1, borderColor: colors.teal + "50", paddingVertical: 8, borderRadius: 8, alignItems: "center", flexDirection: "row", justifyContent: "center" }}
                    >
                      <Pencil size={13} color={colors.teal} />
                      <Text style={{ color: colors.teal, fontWeight: "600", marginLeft: 4, fontSize: 11 }}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setShowTerminalPicker(true)}
                      style={{ flex: 1, backgroundColor: colors.teal + "20", borderWidth: 1, borderColor: colors.teal + "50", paddingVertical: 8, borderRadius: 8, alignItems: "center", flexDirection: "row", justifyContent: "center" }}
                    >
                      <CreditCard size={13} color={colors.teal} />
                      <Text style={{ color: colors.teal, fontWeight: "600", marginLeft: 4, fontSize: 11 }}>Switch</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => { setShowRegisterForm(true); setQuickTestStatus("idle"); }}
                      style={{ flex: 1, backgroundColor: colors.teal + "20", borderWidth: 1, borderColor: colors.teal + "50", paddingVertical: 8, borderRadius: 8, alignItems: "center", flexDirection: "row", justifyContent: "center" }}
                    >
                      <Plus size={13} color={colors.teal} />
                      <Text style={{ color: colors.teal, fontWeight: "600", marginLeft: 4, fontSize: 11 }}>Add</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                /* ---- Empty state (no terminal) ---- */
                <View>
                  {/* Quick IP tester */}
                  <View style={{ backgroundColor: colors.screen, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 16, marginBottom: 16 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <Wifi size={16} color={colors.teal} />
                      <Text style={{ color: colors.heading, fontWeight: "600", fontSize: 13 }}>Quick Connect Test</Text>
                      <Text style={{ color: colors.muted, fontSize: 11, marginLeft: 4 }}>— no setup required</Text>
                    </View>
                    <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 12 }}>
                      Enter your terminal's IP address to verify it's reachable on this network before registering.
                    </Text>
                    <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
                      <View style={{ flex: 3 }}>
                        <TextInput
                          value={quickTestIp}
                          onChangeText={(v) => { setQuickTestIp(v); setQuickTestStatus("idle"); }}
                          placeholder="192.168.1.100"
                          placeholderTextColor={colors.muted}
                          keyboardType="decimal-pad"
                          style={{ backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: colors.heading, fontSize: 13, fontFamily: "monospace" }}
                        />
                      </View>
                      <View style={{ flex: 1.2 }}>
                        <TextInput
                          value={quickTestPort}
                          onChangeText={(v) => setQuickTestPort(v)}
                          placeholder="8080"
                          placeholderTextColor={colors.muted}
                          keyboardType="number-pad"
                          style={{ backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: colors.heading, fontSize: 13 }}
                        />
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={handleQuickTest}
                      disabled={!quickTestIp.trim() || quickTestStatus === "testing"}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        paddingVertical: 10,
                        borderRadius: 8,
                        borderWidth: 1,
                        backgroundColor: quickTestStatus === "online"
                          ? colors.success + "15"
                          : quickTestStatus === "offline"
                            ? colors.danger + "15"
                            : quickTestIp.trim()
                              ? colors.teal + "15"
                              : colors.panel,
                        borderColor: quickTestStatus === "online"
                          ? colors.success + "50"
                          : quickTestStatus === "offline"
                            ? colors.danger + "50"
                            : quickTestIp.trim()
                              ? colors.teal + "50"
                              : colors.border,
                        opacity: !quickTestIp.trim() && quickTestStatus !== "testing" ? 0.4 : 1,
                      }}
                    >
                      {quickTestStatus === "testing" ? (
                        <><ActivityIndicator size="small" color={colors.teal} /><Text style={{ color: colors.teal, fontSize: 13, marginLeft: 8 }}>Testing…</Text></>
                      ) : quickTestStatus === "online" ? (
                        <><Check size={15} color={colors.success} /><Text style={{ color: colors.success, fontSize: 13, fontWeight: "600", marginLeft: 8 }}>Terminal reachable — ready to register</Text></>
                      ) : quickTestStatus === "offline" ? (
                        <><WifiOff size={15} color={colors.danger} /><Text style={{ color: colors.danger, fontSize: 13, marginLeft: 8 }}>No response — check IP address &amp; network</Text></>
                      ) : (
                        <><Wifi size={15} color={colors.teal} /><Text style={{ color: colors.teal, fontSize: 13, marginLeft: 8 }}>Test Connection</Text></>
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
                        style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 8, marginTop: 8, borderRadius: 8, backgroundColor: colors.success + "20" }}
                      >
                        <ChevronRight size={14} color={colors.success} />
                        <Text style={{ color: colors.success, fontSize: 13, fontWeight: "600", marginLeft: 4 }}>Register this terminal</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* CTA buttons */}
                  <View style={{ flexDirection: "row", gap: 12 }}>
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
            <MessageSquare size={20} color={colors.teal} />,
            "text"
          )}
          {expandedSections.text && (
            <View style={{ paddingHorizontal: 20, paddingVertical: 20 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 16 }}>
                <View style={{ flex: 1, paddingRight: 16 }}>
                  <Text style={{ color: colors.heading, fontWeight: "500" }}>
                    Enable SMS Payment Links
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 13 }}>
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
                  <View style={{ backgroundColor: colors.screen, paddingHorizontal: 16, paddingVertical: 16, borderRadius: 8, borderWidth: 1, borderColor: colors.border, marginBottom: 16 }}>
                    <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 8 }}>
                      SMS Preview
                    </Text>
                    <View style={{ backgroundColor: colors.panel, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 8 }}>
                      <Text style={{ color: colors.heading, fontSize: 13 }}>
                        "Hi [Name], your order at Dexa POS is ready! Pay
                        securely here: https://pay.dexa.app/abc123"
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    onPress={() => setTextToPayTestSent(true)}
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, marginBottom: 12, backgroundColor: textToPayTestSent ? colors.success + "20" : colors.teal + "20", borderColor: textToPayTestSent ? colors.success + "50" : colors.teal + "50" }}
                  >
                    {textToPayTestSent ? (
                      <>
                        <Check size={14} color={colors.success} />
                        <Text style={{ color: colors.success, fontWeight: "600", fontSize: 12, marginLeft: 6 }}>
                          Test Sent Successfully!
                        </Text>
                      </>
                    ) : (
                      <>
                        <Send size={14} color={colors.teal} />
                        <Text style={{ color: colors.teal, fontWeight: "600", fontSize: 12, marginLeft: 6 }}>
                          Send Test SMS
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <View style={{ flexDirection: "row", gap: 16 }}>
                    <View style={{ backgroundColor: colors.screen, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 8, flex: 1, borderWidth: 1, borderColor: colors.border }}>
                      <Text style={{ color: colors.muted, fontSize: 11, textTransform: "uppercase", fontWeight: "600" }}>
                        Paid via Text
                      </Text>
                      <Text style={{ color: colors.heading, fontSize: 18, fontWeight: "bold", marginTop: 4 }}>328</Text>
                    </View>
                    <View style={{ backgroundColor: colors.screen, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 8, flex: 1, borderWidth: 1, borderColor: colors.border }}>
                      <Text style={{ color: colors.muted, fontSize: 11, textTransform: "uppercase", fontWeight: "600" }}>
                        Avg. Pay Time
                      </Text>
                      <Text style={{ color: colors.heading, fontSize: 18, fontWeight: "bold", marginTop: 4 }}>
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
            <Gauge size={20} color={colors.teal} />,
            "throttle"
          )}
          {expandedSections.throttle && (
            <View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 12 }}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={{ color: colors.heading, fontWeight: "700", fontSize: 13 }}>Auto-Throttle</Text>
                  <Text style={{ color: colors.muted, fontSize: 11 }}>
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
                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ color: colors.label, fontWeight: "700", fontSize: 11, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      Throttle Threshold: {throttling.capacity}%
                    </Text>
                    <View style={{ flexDirection: "row", gap: 4, marginBottom: 10 }}>
                      {[50, 60, 70, 75, 80, 90].map((val) => (
                        <TouchableOpacity
                          key={val}
                          onPress={() => setThrottling({ capacity: val })}
                          style={{
                            flex: 1,
                            paddingVertical: 6,
                            borderRadius: 6,
                            backgroundColor: throttling.capacity === val ? colors.teal + "20" : colors.screen,
                            borderWidth: 1,
                            borderColor: throttling.capacity === val ? colors.teal + "50" : colors.border,
                          }}
                        >
                          <Text
                            style={{
                              textAlign: "center",
                              fontSize: 11,
                              fontWeight: "700",
                              color: throttling.capacity === val ? colors.teal : colors.muted,
                            }}
                          >
                            {val}%
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {/* Heat line */}
                    <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.screen, overflow: "hidden", marginBottom: 4 }}>
                      <View
                        style={{
                          position: "absolute",
                          left: 0,
                          top: 0,
                          width: `${throttling.currentLoad}%`,
                          height: "100%",
                          borderRadius: 2,
                          backgroundColor:
                            throttling.currentLoad >= throttling.capacity
                              ? colors.danger
                              : throttling.currentLoad >= throttling.capacity * 0.8
                                ? colors.warning
                                : colors.teal,
                        }}
                      />
                      {/* Threshold marker */}
                      <View
                        style={{
                          position: "absolute",
                          left: `${throttling.capacity}%`,
                          top: -2,
                          width: 2,
                          height: 8,
                          backgroundColor: colors.heading,
                          borderRadius: 1,
                          marginLeft: -1,
                        }}
                      />
                    </View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                      <Text style={{ fontSize: 8, color: colors.muted }}>0%</Text>
                      <Text style={{ fontSize: 8, color: colors.muted }}>Threshold: {throttling.capacity}%</Text>
                      <Text style={{ fontSize: 8, color: colors.muted }}>100%</Text>
                    </View>
                  </View>

                  <View
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderRadius: 8,
                      borderWidth: 1,
                      marginBottom: 12,
                      backgroundColor: colors.screen,
                      borderColor:
                        throttling.currentLoad >= throttling.capacity
                          ? colors.danger + "40"
                          : throttling.currentLoad >= throttling.capacity * 0.8
                            ? colors.warning + "40"
                            : colors.border,
                    }}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.heading, fontWeight: "700", fontSize: 13 }}>
                          Current Load
                        </Text>
                        <Text style={{ color: colors.muted, fontSize: 10, marginTop: 2 }}>
                          12 active • 3 pending
                        </Text>
                      </View>
                      <Text
                        style={{
                          fontSize: 18,
                          fontWeight: "700",
                          color:
                            throttling.currentLoad >= throttling.capacity
                              ? colors.danger
                              : throttling.currentLoad >= throttling.capacity * 0.8
                                ? colors.warning
                                : colors.teal,
                          marginLeft: 8,
                        }}
                      >
                        {throttling.currentLoad}%
                      </Text>
                    </View>
                  </View>

                  <Text style={{ color: colors.label, fontWeight: "700", fontSize: 11, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Actions When Threshold Reached
                  </Text>
                  <View style={{ backgroundColor: colors.screen, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border, gap: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 }}>
                      <Text style={{ color: colors.heading, fontSize: 12 }}>Pause online orders</Text>
                      <Switch
                        checked={throttling.pauseOnline}
                        onCheckedChange={(v) =>
                          setThrottling({ pauseOnline: v })
                        }
                      />
                    </View>
                    <View style={{ height: 1, backgroundColor: colors.border }} />
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 }}>
                      <Text style={{ color: colors.heading, fontSize: 12 }}>Increase prep times</Text>
                      <Switch
                        checked={throttling.increasePrepTime}
                        onCheckedChange={(v) =>
                          setThrottling({ increasePrepTime: v })
                        }
                      />
                    </View>
                    <View style={{ height: 1, backgroundColor: colors.border }} />
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 }}>
                      <Text style={{ color: colors.heading, fontSize: 12 }}>Alert manager</Text>
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

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
};

export default PaymentSystemsScreen;
