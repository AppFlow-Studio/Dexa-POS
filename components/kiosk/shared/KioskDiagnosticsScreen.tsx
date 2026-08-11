import appJson from "@/app.json";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { usePaymentTerminal } from "@/hooks/usePaymentTerminal";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { useTerminalStatus } from "@/hooks/useTerminalStatus";
import { getDeviceId } from "@/lib/deviceId";
import { replaceRoute } from "@/lib/rootNavigation";
import { toastService } from "@/lib/toastService";
import { clearStationData } from "@/services/cacheService";
import { KioskProfileEditor } from "@/components/kiosk/shared/KioskProfileEditor";
import {
    useKioskDeviceSettingsStore,
    type KioskMenuColumns,
} from "@/stores/useKioskDeviceSettingsStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useTerminalConnectionStore } from "@/stores/useTerminalConnectionStore";
import type { KioskConfig } from "@/types/kiosk";
import type { StationPaymentTerminal } from "@/types/station";
import {
    Check,
    ChevronDown,
    ChevronUp,
    CreditCard,
    LogOut,
    Pencil,
    Plus,
    RefreshCw,
    Usb,
    Wifi,
    WifiOff,
    X,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

/**
 * Read-only kiosk diagnostics / settings overview. Reached by holding the
 * logo on the attract screen and entering a manager PIN. Shows the resolved
 * kiosk profile, station/location wiring, and live connectivity — enough for
 * staff to confirm "is this kiosk configured correctly and online" without
 * leaving the device.
 */
export function KioskDiagnosticsScreen({
  config,
  onClose,
  onRefreshKioskConfig,
}: {
  config: KioskConfig;
  onClose: () => void;
  onRefreshKioskConfig?: () => void | Promise<unknown>;
}) {
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const selectedStation = useStoreSettingsStore((s) => s.selectedStation);
  const { isOnline, rawIsOnline, quality, pendingSyncCount } =
    useNetworkStatus();

  // ── Menu layout (device-local) ──
  const menuColumns = useKioskDeviceSettingsStore((s) => s.menuColumns);
  const setMenuColumns = useKioskDeviceSettingsStore((s) => s.setMenuColumns);

  // ── Payment Terminal ──────────────────────────────────────────────
  const supabase = useSupabaseClient();
  const setSelectedStation = useStoreSettingsStore((s) => s.setSelectedStation);
  const {
    terminals,
    isTestingConnection,
    loadTerminals,
    setActiveTerminal,
    testConnection,
    testConnectionWithConfig,
    registerTerminal,
  } = usePaymentTerminal();

  const terminalConnectActivity = useTerminalConnectionStore(
    (s) => s.connectActivity,
  );

  const currentTerminal = selectedStation?.payment_terminal ?? null;
  const { status: terminalStatus } = useTerminalStatus(
    currentTerminal?.id ?? undefined,
    currentTerminal ?? undefined,
  );

  // Terminal UI state
  const [expandedTerminal, setExpandedTerminal] = useState(true);
  const [showTerminalPicker, setShowTerminalPicker] = useState(false);
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [registerFormType, setRegisterFormType] = useState<
    "dejavoo" | "castles"
  >("castles");
  const [registerForm, setRegisterForm] = useState({
    name: "",
    tpn: "",
    authKey: "",
    model: "",
    environment: "sandbox" as "sandbox" | "production",
    ipAddress: "",
    port: "8080",
    connectionType: "local_socket" as "local_socket" | "usb",
    serialNumber: "",
  });
  const [isEditingTerminal, setIsEditingTerminal] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    model: "",
    tpn: "",
    authKey: "",
    ipAddress: "",
    port: "8080",
    connectionType: "local_socket" as "local_socket" | "usb",
  });
  const [isAssigning, setIsAssigning] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  useEffect(() => {
    if (selectedStore?.id) {
      loadTerminals(selectedStore.id);
    }
  }, [selectedStore?.id]);

  // ── Terminal Handlers ──

  const handleTestConnection = async () => {
    const online = await testConnection();
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
        ? "Connection verified."
        : "Could not reach terminal. Check network.",
      type: online ? "success" : "error",
    });
  };

  const handleAssignTerminal = async (terminal: (typeof terminals)[number]) => {
    if (!selectedStation || !selectedStore) return;

    const boundElsewhere =
      terminal.isActive &&
      !!terminal.stationId &&
      terminal.stationId !== selectedStation.id;
    if (boundElsewhere) {
      const confirmed = await new Promise<boolean>((resolve) => {
        Alert.alert(
          "Move terminal to this station?",
          `${terminal.name} is currently in use at another station. Moving it here disconnects it from that station.`,
          [
            { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
            { text: "Move here", onPress: () => resolve(true) },
          ],
        );
      });
      if (!confirmed) return;
    }

    setIsAssigning(true);
    try {
      await supabase
        .from("payment_terminals")
        .update({ station_id: null })
        .eq("station_id", selectedStation.id)
        .neq("id", terminal.id);
      await supabase
        .from("payment_terminals")
        .update({ is_active: true, station_id: selectedStation.id })
        .eq("id", terminal.id);
      // Also update the kiosk profile so paymentTerminalId stays in sync
      await supabase
        .from("kiosk_profiles")
        .update({ payment_terminal_id: terminal.id })
        .eq("id", config.id);
      onRefreshKioskConfig?.();
      setActiveTerminal(terminal.id);
      const newTerminalData: StationPaymentTerminal = {
        id: terminal.id,
        terminal_name: terminal.name,
        register_id: null,
        auth_key: null,
        terminal_type:
          (terminal.terminalType as StationPaymentTerminal["terminal_type"]) ||
          "dejavoo",
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
        newTerminalId = result.terminalId;
        if (result.terminalId) {
          // Update kiosk profile so paymentTerminalId stays in sync
          await supabase
            .from("kiosk_profiles")
            .update({ payment_terminal_id: result.terminalId })
            .eq("id", config.id);
          onRefreshKioskConfig?.();
          setActiveTerminal(result.terminalId);
          setSelectedStation({
            ...selectedStation,
            payment_terminal: {
              id: result.terminalId,
              terminal_name: registerForm.name,
              register_id: registerForm.tpn,
              auth_key: null,
              terminal_type: "dejavoo",
              terminal_model: registerForm.model || null,
              is_connected: false,
              last_connection_status: null,
              last_connection_test_at: null,
            },
          });
        }
      } else {
        const connectionType =
          registerForm.connectionType === "usb" ? "usb" : "local";
        const localIp =
          registerForm.connectionType === "local_socket"
            ? registerForm.ipAddress
            : null;
        const localPort =
          registerForm.connectionType === "local_socket"
            ? parseInt(registerForm.port, 10) || 8080
            : null;

        let discoveredSN: string | undefined;
        if (
          registerForm.connectionType === "local_socket" &&
          registerForm.ipAddress
        ) {
          const preTest = await testConnectionWithConfig({
            terminalId: `provisional-${selectedStation.id}`,
            terminalType: "castles",
            ipAddress: registerForm.ipAddress,
            port: localPort ?? 8080,
          });
          discoveredSN = preTest.serialNumber;
        } else if (
          registerForm.connectionType === "usb" &&
          registerForm.serialNumber
        ) {
          discoveredSN = registerForm.serialNumber;
        }

        let existingId: string | null = null;
        if (discoveredSN) {
          const { data: existing } = await supabase
            .from("payment_terminals")
            .select("id")
            .eq("location_id", selectedStore.id)
            .eq("serial_number", discoveredSN)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          existingId = existing?.id ?? null;
        }

        if (existingId) {
          await supabase
            .from("payment_terminals")
            .update({
              terminal_name: registerForm.name,
              terminal_model: registerForm.model || null,
              local_ip_address: localIp,
              local_port: localPort,
              connection_type: connectionType,
              station_id: selectedStation.id,
              is_active: true,
              ...(discoveredSN ? { serial_number: discoveredSN } : {}),
            })
            .eq("id", existingId);
          newTerminalId = existingId;
        } else {
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
              local_ip_address: localIp,
              local_port: localPort,
              connection_type: connectionType,
              is_active: true,
              is_connected: false,
              api_environment: "production",
              serial_number: discoveredSN ?? null,
            })
            .select("id")
            .single();
          if (termErr) throw termErr;
          newTerminalId = terminalRow.id;
        }

        await supabase
          .from("payment_terminals")
          .update({ is_active: false })
          .eq("station_id", selectedStation.id)
          .eq("is_active", true)
          .neq("id", newTerminalId);
        // Update kiosk profile so paymentTerminalId stays in sync
        await supabase
          .from("kiosk_profiles")
          .update({ payment_terminal_id: newTerminalId })
          .eq("id", config.id);
        onRefreshKioskConfig?.();
        await loadTerminals(selectedStore.id);
        setActiveTerminal(newTerminalId!);
        setSelectedStation({
          ...selectedStation,
          payment_terminal: {
            id: newTerminalId!,
            terminal_name: registerForm.name,
            register_id: null,
            auth_key: null,
            terminal_type: "castles",
            terminal_model: registerForm.model || null,
            is_connected: false,
            ip_address:
              registerForm.connectionType === "local_socket"
                ? registerForm.ipAddress
                : undefined,
            port:
              registerForm.connectionType === "local_socket"
                ? parseInt(registerForm.port, 10) || 8080
                : undefined,
            connection_type:
              registerForm.connectionType === "usb" ? "usb" : "local_socket",
            serial_number: discoveredSN ?? null,
            last_connection_status: null,
            last_connection_test_at: null,
          },
        });
      }

      const testTargetId = newTerminalId || currentTerminal?.id;
      if (testTargetId) {
        const online = await testConnection(testTargetId);
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
            ? `${registerForm.name} is connected.`
            : `${registerForm.name} registered but offline.`,
          type: online ? "success" : "warning",
        });
      }

      setShowRegisterForm(false);
      setRegisterForm({
        name: "",
        tpn: "",
        authKey: "",
        model: "",
        environment: "sandbox",
        ipAddress: "",
        port: "8080",
        connectionType: "local_socket",
        serialNumber: "",
      });
    } catch (err) {
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

  const handleStartEdit = () => {
    if (!currentTerminal) return;
    setEditForm({
      name: currentTerminal.terminal_name || "",
      model: currentTerminal.terminal_model || "",
      tpn: currentTerminal.register_id || "",
      authKey: "",
      ipAddress: currentTerminal.ip_address || "",
      port: String(currentTerminal.port || 8080),
      connectionType: (currentTerminal.connection_type === "usb"
        ? "usb"
        : "local_socket") as "local_socket" | "usb",
    });
    setIsEditingTerminal(true);
  };

  const handleSaveEdit = async () => {
    if (!currentTerminal || !selectedStore || !selectedStation) return;
    setIsSavingEdit(true);
    try {
      const testResult = await testConnectionWithConfig({
        terminalId: currentTerminal.id,
        terminalType: currentTerminal.terminal_type as "castles" | "dejavoo",
        ipAddress: editForm.ipAddress || undefined,
        port: editForm.port ? parseInt(editForm.port, 10) : undefined,
        tpn: editForm.tpn || undefined,
        authKey: editForm.authKey || undefined,
      });

      const updatePayload: Record<string, any> = {
        terminal_name: editForm.name.trim(),
        terminal_model: editForm.model.trim() || null,
      };
      if (currentTerminal.terminal_type === "castles") {
        updatePayload.connection_type =
          editForm.connectionType === "usb" ? "usb" : "local";
        updatePayload.local_ip_address =
          editForm.connectionType === "local_socket"
            ? editForm.ipAddress.trim()
            : null;
        updatePayload.local_port =
          editForm.connectionType === "local_socket"
            ? parseInt(editForm.port, 10) || 8080
            : null;
        if (testResult.serialNumber)
          updatePayload.serial_number = testResult.serialNumber;
      } else {
        updatePayload.tpn = editForm.tpn.trim();
        updatePayload.register_id = editForm.tpn.trim();
        if (editForm.authKey.trim())
          updatePayload.auth_key = editForm.authKey.trim();
      }

      const { error: dbErr } = await supabase
        .from("payment_terminals")
        .update(updatePayload)
        .eq("id", currentTerminal.id);
      if (dbErr) throw dbErr;

      setSelectedStation({
        ...selectedStation,
        payment_terminal: {
          ...currentTerminal,
          terminal_name: editForm.name.trim(),
          terminal_model: editForm.model.trim() || null,
          ...(currentTerminal.terminal_type === "castles"
            ? {
                ip_address:
                  editForm.connectionType === "local_socket"
                    ? editForm.ipAddress.trim()
                    : undefined,
                port:
                  editForm.connectionType === "local_socket"
                    ? parseInt(editForm.port, 10) || 8080
                    : undefined,
                connection_type:
                  editForm.connectionType === "usb"
                    ? ("usb" as const)
                    : ("local_socket" as const),
              }
            : { register_id: editForm.tpn.trim() }),
          is_connected: testResult.success,
          last_connection_status: testResult.success ? "Online" : "Offline",
          last_connection_test_at: new Date().toISOString(),
        },
      });

      await loadTerminals(selectedStore.id);
      setIsEditingTerminal(false);
      toastService.show({
        title: testResult.success ? "Saved & Online" : "Saved (Offline)",
        message: testResult.success
          ? "Settings saved, terminal connected."
          : "Settings saved but terminal unreachable.",
        type: testResult.success ? "success" : "warning",
      });
    } catch (err) {
      toastService.show({
        title: "Save Failed",
        message: err instanceof Error ? err.message : "Failed to save.",
        type: "error",
      });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const isRegisterFormValid =
    registerFormType === "dejavoo"
      ? !!(
          registerForm.name.trim() &&
          registerForm.tpn.trim() &&
          registerForm.authKey.trim()
        )
      : !!(
          registerForm.name.trim() &&
          (registerForm.connectionType === "usb" ||
            registerForm.ipAddress.trim())
        );

  const isEditFormValid =
    currentTerminal?.terminal_type === "castles"
      ? !!(
          editForm.name.trim() &&
          (editForm.connectionType === "usb" || editForm.ipAddress.trim())
        )
      : !!(editForm.name.trim() && editForm.tpn.trim());

  // ── Hydrate station terminal with IP/port/serial from full terminal record ──
  useEffect(() => {
    if (!currentTerminal || !terminals.length || !selectedStation) return;
    const needsHydration =
      !currentTerminal.ip_address || !currentTerminal.serial_number;
    if (!needsHydration) return;
    const fullRecord = terminals.find((t) => t.id === currentTerminal.id);
    if (!fullRecord) return;
    const hydratedIp = currentTerminal.ip_address ?? fullRecord.ipAddress;
    const hydratedSerial = currentTerminal.serial_number ?? null;
    if (
      hydratedIp === currentTerminal.ip_address &&
      hydratedSerial === currentTerminal.serial_number
    )
      return;
    setSelectedStation({
      ...selectedStation,
      payment_terminal: {
        ...currentTerminal,
        ip_address: hydratedIp,
        port: currentTerminal.port ?? fullRecord.port,
        connection_type:
          currentTerminal.connection_type ?? fullRecord.connectionType,
        serial_number: hydratedSerial,
      },
    });
  }, [terminals, currentTerminal?.id, currentTerminal?.serial_number]);

  // ── End Station Session ────────────────────────────────────────────
  const stationSessionId = useStoreSettingsStore((s) => s.stationSessionId);
  const clearStationSession = useStoreSettingsStore(
    (s) => s.clearStationSession,
  );

  const [showConfirm, setShowConfirm] = useState(false);
  const [isEnding, setIsEnding] = useState(false);

  const endStationSessionOnServer = async () => {
    if (!stationSessionId || !selectedStore) return;
    try {
      await supabase.rpc("pos_staff_logout", {
        p_session_id: stationSessionId,
        p_location_id: selectedStore.id,
        p_pin_code: "",
        p_device_id: getDeviceId(),
        p_clock_out: false,
      });
    } catch {
      // Non-blocking
    }
  };

  const handleEndSession = async () => {
    if (isEnding) return;
    setIsEnding(true);
    try {
      await endStationSessionOnServer();
      clearStationSession();
      clearStationData();
      setShowConfirm(false);
      onClose();
      toastService.show({
        title: "Session Ended",
        message: "Station session has been ended.",
        type: "success",
      });
      replaceRoute("(auth)", "station-select");
    } catch {
      toastService.show({
        title: "Error",
        message: "Failed to end session. Please try again.",
        type: "error",
      });
    } finally {
      setIsEnding(false);
    }
  };

  return (
    <View className="flex-1 bg-white">
      <View className="flex-row items-center justify-between px-6 pt-14 pb-4 border-b border-gray-200">
        <Text className="text-2xl font-bold text-black">Kiosk Diagnostics</Text>
        <Pressable
          onPress={onClose}
          className="w-11 h-11 rounded-full bg-gray-100 items-center justify-center"
        >
          <X size={22} color="#0A0A0A" />
        </Pressable>
      </View>

      <ScrollView
        className="flex-1 px-6 py-4"
        contentContainerStyle={{ gap: 16 }}
      >
        <Section title="Connectivity">
          <Row
            label="Network"
            value={rawIsOnline ? "Online" : "Offline"}
            icon={
              rawIsOnline ? (
                <Wifi size={18} color="#16A34A" />
              ) : (
                <WifiOff size={18} color="#DC2626" />
              )
            }
          />
          <Row label="Connection quality" value={quality} />
          <Row
            label="Effective status"
            value={isOnline ? "Online" : "Degraded / Offline"}
          />
          <Row label="Pending syncs" value={String(pendingSyncCount)} />
        </Section>

        <Section title="Station">
          <Row label="Location" value={selectedStore?.name ?? "—"} />
          <Row label="Station" value={selectedStation?.station_name ?? "—"} />
          <Row label="Station ID" value={selectedStation?.id ?? "—"} mono />
        </Section>

        {/* Editable kiosk profile — same options as the web dashboard, with
            Sync (pull) + Save (push) to kiosk_profiles. */}
        <KioskProfileEditor
          config={config}
          onRefreshKioskConfig={onRefreshKioskConfig}
        />

        {/* ── Menu Layout (device-local) ── */}
        <View style={{ gap: 8 }}>
          <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Menu Layout
          </Text>
          <View className="rounded-2xl border border-gray-200 px-4 py-3">
            <Text className="text-base text-gray-600 mb-1">
              Items per row
            </Text>
            <Text className="text-xs text-gray-400 mb-3">
              How many menu items show across each row. “Auto” uses the
              template default ({config.orientation === "vertical" ? "3" : "4"}{" "}
              for this orientation).
            </Text>
            <View className="flex-row bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
              {(["auto", 2, 3, 4] as KioskMenuColumns[]).map((opt) => {
                const active = menuColumns === opt;
                return (
                  <TouchableOpacity
                    key={String(opt)}
                    onPress={() => setMenuColumns(opt)}
                    className={`flex-1 py-2.5 items-center ${
                      active ? "bg-teal-100" : ""
                    }`}
                  >
                    <Text
                      className={`text-sm font-semibold ${
                        active ? "text-teal-600" : "text-gray-400"
                      }`}
                    >
                      {opt === "auto" ? "Auto" : opt}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

        {/* ── Payment Terminal ── */}
        <View style={{ gap: 8 }}>
          <Pressable
            onPress={() => setExpandedTerminal((p) => !p)}
            className="flex-row items-center justify-between"
          >
            <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              Payment Terminal
            </Text>
            {expandedTerminal ? (
              <ChevronUp size={18} color="#9CA3AF" />
            ) : (
              <ChevronDown size={18} color="#9CA3AF" />
            )}
          </Pressable>
          {expandedTerminal && (
            <View className="rounded-2xl border border-gray-200 overflow-hidden">
              {showRegisterForm ? (
                <View className="px-4 py-3">
                  <View className="flex-row items-center justify-between mb-3">
                    <View className="flex-row items-center gap-2">
                      <Plus size={16} color="#0D9488" />
                      <Text className="text-sm font-bold text-black">
                        {registerFormType === "castles"
                          ? "Add Castles Terminal"
                          : "Register Dejavoo Terminal"}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => {
                        setShowRegisterForm(false);
                      }}
                    >
                      <X size={18} color="#9CA3AF" />
                    </TouchableOpacity>
                  </View>

                  {registerFormType === "castles" ? (
                    <>
                      <View className="mb-2">
                        <Text className="text-xs text-gray-500 mb-1.5">
                          Connection
                        </Text>
                        <View className="flex-row bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                          {[
                            {
                              id: "local_socket" as const,
                              label: "TCP / WiFi",
                              Icon: Wifi,
                            },
                            {
                              id: "usb" as const,
                              label: "USB (wired)",
                              Icon: Usb,
                            },
                          ].map((opt) => {
                            const active =
                              registerForm.connectionType === opt.id;
                            const Icon = opt.Icon;
                            return (
                              <TouchableOpacity
                                key={opt.id}
                                onPress={() =>
                                  setRegisterForm((f) => ({
                                    ...f,
                                    connectionType: opt.id,
                                  }))
                                }
                                className={`flex-1 py-2.5 flex-row items-center justify-center gap-1.5 ${
                                  active ? "bg-teal-100" : ""
                                }`}
                              >
                                <Icon
                                  size={13}
                                  color={active ? "#0D9488" : "#9CA3AF"}
                                />
                                <Text
                                  className={`text-xs font-semibold ${
                                    active ? "text-teal-600" : "text-gray-400"
                                  }`}
                                >
                                  {opt.label}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>

                      {registerForm.connectionType === "local_socket" ? (
                        <View className="flex-row gap-2 mb-2">
                          <View className="flex-[3]">
                            <Text className="text-xs text-gray-500 mb-1">
                              IP Address *
                            </Text>
                            <TextInput
                              value={registerForm.ipAddress}
                              onChangeText={(v) =>
                                setRegisterForm((f) => ({
                                  ...f,
                                  ipAddress: v,
                                }))
                              }
                              placeholder="192.168.1.100"
                              placeholderTextColor="#9CA3AF"
                              keyboardType="decimal-pad"
                              className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-black"
                            />
                          </View>
                          <View className="flex-[1.2]">
                            <Text className="text-xs text-gray-500 mb-1">
                              Port
                            </Text>
                            <TextInput
                              value={registerForm.port}
                              onChangeText={(v) =>
                                setRegisterForm((f) => ({ ...f, port: v }))
                              }
                              placeholder="8080"
                              placeholderTextColor="#9CA3AF"
                              keyboardType="number-pad"
                              className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-black"
                            />
                          </View>
                        </View>
                      ) : (
                        <View className="p-2.5 mb-2 rounded-xl border border-teal-200 bg-teal-50 flex-row items-center gap-2">
                          <Usb size={14} color="#0D9488" />
                          <Text className="flex-1 text-xs text-gray-600">
                            USB — no IP needed. The terminal is identified by
                            USB device serial.
                          </Text>
                        </View>
                      )}

                      <View className="mb-3">
                        <Text className="text-xs text-gray-500 mb-1">
                          Terminal Name *
                        </Text>
                        <TextInput
                          value={registerForm.name}
                          onChangeText={(v) =>
                            setRegisterForm((f) => ({ ...f, name: v }))
                          }
                          placeholder="e.g. Front Counter"
                          placeholderTextColor="#9CA3AF"
                          className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-black"
                        />
                      </View>
                    </>
                  ) : (
                    <>
                      {[
                        {
                          key: "name",
                          label: "Terminal Name *",
                          placeholder: "e.g. Front Counter",
                        },
                        {
                          key: "tpn",
                          label: "TPN *",
                          placeholder: "Terminal Point Number",
                        },
                        {
                          key: "authKey",
                          label: "Auth Key *",
                          placeholder: "Authentication Key",
                          secure: true,
                        },
                      ].map((field) => (
                        <View key={field.key} className="mb-2">
                          <Text className="text-xs text-gray-500 mb-1">
                            {field.label}
                          </Text>
                          <TextInput
                            value={(registerForm as any)[field.key]}
                            onChangeText={(v) =>
                              setRegisterForm((f) => ({
                                ...f,
                                [field.key]: v,
                              }))
                            }
                            placeholder={field.placeholder}
                            placeholderTextColor="#9CA3AF"
                            secureTextEntry={field.secure}
                            className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-black"
                          />
                        </View>
                      ))}
                      <View className="mb-3">
                        <Text className="text-xs text-gray-500 mb-1.5">
                          Environment
                        </Text>
                        <View className="flex-row bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                          {(["sandbox", "production"] as const).map((env) => (
                            <TouchableOpacity
                              key={env}
                              onPress={() =>
                                setRegisterForm((f) => ({
                                  ...f,
                                  environment: env,
                                }))
                              }
                              className={`flex-1 py-2.5 items-center ${
                                registerForm.environment === env
                                  ? "bg-teal-100"
                                  : ""
                              }`}
                            >
                              <Text
                                className={`text-sm font-medium capitalize ${
                                  registerForm.environment === env
                                    ? "text-teal-600"
                                    : "text-gray-400"
                                }`}
                              >
                                {env}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    </>
                  )}

                  <TouchableOpacity
                    onPress={handleRegisterTerminal}
                    disabled={!isRegisterFormValid || isRegistering}
                    className={`py-3 rounded-xl items-center flex-row justify-center border ${
                      isRegisterFormValid && !isRegistering
                        ? "bg-teal-50 border-teal-300"
                        : "bg-gray-50 border-gray-200"
                    }`}
                  >
                    {isRegistering ? (
                      <ActivityIndicator size="small" color="#0D9488" />
                    ) : (
                      <>
                        <Check
                          size={15}
                          color={isRegisterFormValid ? "#0D9488" : "#9CA3AF"}
                        />
                        <Text
                          className={`text-sm font-bold ml-1.5 ${
                            isRegisterFormValid
                              ? "text-teal-600"
                              : "text-gray-400"
                          }`}
                        >
                          {registerFormType === "castles"
                            ? "Save & Connect"
                            : "Register Terminal"}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ) : showTerminalPicker ? (
                <View className="px-4 py-3">
                  <View className="flex-row items-center justify-between mb-4">
                    <Text className="text-sm font-bold text-black">
                      Available Terminals
                    </Text>
                    <TouchableOpacity
                      onPress={() => setShowTerminalPicker(false)}
                    >
                      <Text className="text-sm text-teal-600">Cancel</Text>
                    </TouchableOpacity>
                  </View>
                  {terminals.length === 0 ? (
                    <Text className="text-sm text-gray-400 text-center py-4">
                      No terminals found.
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
                          onPress={() => !isCurrent && handleAssignTerminal(t)}
                          disabled={isCurrent || isAssigning}
                          className={`px-3 py-3 rounded-xl mb-2 border ${
                            isCurrent
                              ? "bg-teal-50 border-teal-300"
                              : "bg-gray-50 border-gray-200"
                          }`}
                        >
                          <View className="flex-row items-center">
                            <View
                              className={`w-2.5 h-2.5 rounded-full mr-2.5 ${
                                t.isConnected ? "bg-green-500" : "bg-gray-300"
                              }`}
                            />
                            <View className="flex-1">
                              <Text className="text-sm font-medium text-black">
                                {t.name}
                              </Text>
                              <View className="flex-row items-center mt-0.5 flex-wrap gap-1">
                                <View className="px-1.5 py-0.5 rounded bg-teal-100">
                                  <Text className="text-[10px] font-medium text-teal-600">
                                    {t.terminalType === "castles"
                                      ? "Castles"
                                      : "Dejavoo"}
                                  </Text>
                                </View>
                                {t.terminalType === "castles" && (
                                  <View className="px-1.5 py-0.5 rounded bg-gray-100 flex-row items-center gap-0.5">
                                    {t.connectionType === "usb" ? (
                                      <Usb size={9} color="#D97706" />
                                    ) : (
                                      <Wifi size={9} color="#9CA3AF" />
                                    )}
                                    <Text className="text-[10px] font-semibold text-gray-500">
                                      {t.connectionType === "usb"
                                        ? "USB"
                                        : "TCP"}
                                    </Text>
                                  </View>
                                )}
                                {t.model && (
                                  <Text className="text-[10px] text-gray-400">
                                    {t.model}
                                  </Text>
                                )}
                              </View>
                            </View>
                            {isCurrent && (
                              <View className="px-2 py-0.5 rounded border border-teal-300 bg-teal-50">
                                <Text className="text-[10px] font-bold text-teal-600">
                                  Current
                                </Text>
                              </View>
                            )}
                            {isOtherStation && (
                              <View className="px-2 py-0.5 rounded bg-amber-50">
                                <Text className="text-[10px] font-bold text-amber-600">
                                  Tap to move here
                                </Text>
                              </View>
                            )}
                          </View>
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
                    <Plus size={16} color="#0D9488" />
                    <Text className="text-sm font-medium text-teal-600 ml-1">
                      Register New Terminal
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : isEditingTerminal && currentTerminal ? (
                <View className="px-4 py-3">
                  <View className="flex-row items-center justify-between mb-4">
                    <View className="flex-row items-center gap-2">
                      <Pencil size={16} color="#0D9488" />
                      <Text className="text-sm font-bold text-black">
                        Edit Terminal
                      </Text>
                      <View className="px-2 py-0.5 rounded bg-teal-100">
                        <Text className="text-[11px] font-bold text-teal-600">
                          {currentTerminal.terminal_type === "castles"
                            ? "Castles"
                            : "Dejavoo"}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => setIsEditingTerminal(false)}
                    >
                      <X size={18} color="#9CA3AF" />
                    </TouchableOpacity>
                  </View>

                  <View className="mb-3">
                    <Text className="text-xs text-gray-500 mb-1">
                      Terminal Name *
                    </Text>
                    <TextInput
                      value={editForm.name}
                      onChangeText={(v) =>
                        setEditForm((f) => ({ ...f, name: v }))
                      }
                      placeholder="e.g. Front Counter"
                      placeholderTextColor="#9CA3AF"
                      className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-black"
                    />
                  </View>

                  {currentTerminal.terminal_type === "castles" && (
                    <>
                      <View className="mb-3">
                        <Text className="text-xs text-gray-500 mb-1.5">
                          Connection
                        </Text>
                        <View className="flex-row bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                          {[
                            {
                              id: "local_socket" as const,
                              label: "TCP / WiFi",
                              Icon: Wifi,
                            },
                            {
                              id: "usb" as const,
                              label: "USB (wired)",
                              Icon: Usb,
                            },
                          ].map((opt) => {
                            const active = editForm.connectionType === opt.id;
                            const Icon = opt.Icon;
                            return (
                              <TouchableOpacity
                                key={opt.id}
                                onPress={() =>
                                  setEditForm((f) => ({
                                    ...f,
                                    connectionType: opt.id,
                                  }))
                                }
                                className={`flex-1 py-2.5 flex-row items-center justify-center gap-1.5 ${
                                  active ? "bg-teal-100" : ""
                                }`}
                              >
                                <Icon
                                  size={13}
                                  color={active ? "#0D9488" : "#9CA3AF"}
                                />
                                <Text
                                  className={`text-xs font-semibold ${
                                    active ? "text-teal-600" : "text-gray-400"
                                  }`}
                                >
                                  {opt.label}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>

                      {editForm.connectionType === "local_socket" ? (
                        <View className="flex-row gap-2 mb-3">
                          <View className="flex-[3]">
                            <Text className="text-xs text-gray-500 mb-1">
                              IP Address *
                            </Text>
                            <TextInput
                              value={editForm.ipAddress}
                              onChangeText={(v) =>
                                setEditForm((f) => ({ ...f, ipAddress: v }))
                              }
                              placeholder="192.168.1.100"
                              placeholderTextColor="#9CA3AF"
                              keyboardType="decimal-pad"
                              className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-black"
                            />
                          </View>
                          <View className="flex-[1.2]">
                            <Text className="text-xs text-gray-500 mb-1">
                              Port
                            </Text>
                            <TextInput
                              value={editForm.port}
                              onChangeText={(v) =>
                                setEditForm((f) => ({ ...f, port: v }))
                              }
                              placeholder="8080"
                              placeholderTextColor="#9CA3AF"
                              keyboardType="number-pad"
                              className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-black"
                            />
                          </View>
                        </View>
                      ) : (
                        <View className="p-2.5 mb-3 rounded-xl border border-teal-200 bg-teal-50 flex-row items-center gap-2">
                          <Usb size={14} color="#0D9488" />
                          <Text className="flex-1 text-xs text-gray-600">
                            USB — no IP needed. The terminal is identified by
                            USB device serial.
                          </Text>
                        </View>
                      )}
                    </>
                  )}
                  {currentTerminal.terminal_type !== "castles" && (
                    <>
                      <View className="mb-3">
                        <Text className="text-xs text-gray-500 mb-1">
                          TPN *
                        </Text>
                        <TextInput
                          value={editForm.tpn}
                          onChangeText={(v) =>
                            setEditForm((f) => ({ ...f, tpn: v }))
                          }
                          placeholder="Terminal Point Number"
                          placeholderTextColor="#9CA3AF"
                          className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-black"
                        />
                      </View>
                      <View className="mb-3">
                        <Text className="text-xs text-gray-500 mb-1">
                          Auth Key
                        </Text>
                        <TextInput
                          value={editForm.authKey}
                          onChangeText={(v) =>
                            setEditForm((f) => ({ ...f, authKey: v }))
                          }
                          placeholder="Leave blank to keep current"
                          placeholderTextColor="#9CA3AF"
                          secureTextEntry
                          className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-black"
                        />
                      </View>
                    </>
                  )}

                  <TouchableOpacity
                    onPress={handleSaveEdit}
                    disabled={!isEditFormValid || isSavingEdit}
                    className={`py-3 rounded-xl items-center flex-row justify-center border ${
                      isEditFormValid && !isSavingEdit
                        ? "bg-teal-50 border-teal-300"
                        : "bg-gray-50 border-gray-200"
                    }`}
                  >
                    {isSavingEdit ? (
                      <ActivityIndicator size="small" color="#0D9488" />
                    ) : (
                      <>
                        <Check
                          size={15}
                          color={isEditFormValid ? "#0D9488" : "#9CA3AF"}
                        />
                        <Text
                          className={`text-sm font-bold ml-1.5 ${
                            isEditFormValid ? "text-teal-600" : "text-gray-400"
                          }`}
                        >
                          Save Changes
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ) : currentTerminal ? (
                <View className="px-4 py-3">
                  <View
                    className={`rounded-xl border mb-3 overflow-hidden ${
                      currentTerminal.is_connected
                        ? "border-green-300"
                        : "border-gray-200"
                    }`}
                  >
                    <View className="flex-row items-start justify-between px-3 py-2.5">
                      <View className="flex-1">
                        <View className="flex-row items-center gap-1.5">
                          <Text className="text-sm font-bold text-black">
                            {currentTerminal.terminal_name}
                          </Text>
                          <View className="px-1.5 py-0.5 rounded bg-teal-100">
                            <Text className="text-[9px] font-bold text-teal-600">
                              {currentTerminal.terminal_type === "castles"
                                ? "CASTLES"
                                : "DEJAVOO"}
                            </Text>
                          </View>
                        </View>
                        <View className="mt-1 gap-0.5">
                          {currentTerminal.terminal_type === "castles" ? (
                            <>
                              <View className="flex-row items-center">
                                <Text className="text-[9px] font-semibold text-gray-400 w-[36px]">
                                  Addr:
                                </Text>
                                <Text
                                  className="text-[9px] text-black font-mono"
                                  selectable
                                >
                                  {currentTerminal.ip_address ?? "—"}
                                  {currentTerminal.ip_address
                                    ? `:${currentTerminal.port || 8080}`
                                    : ""}
                                </Text>
                              </View>
                              <View className="flex-row items-center">
                                <Text className="text-[9px] font-semibold text-gray-400 w-[36px]">
                                  S/N:
                                </Text>
                                <Text
                                  className="text-[9px] text-black font-mono"
                                  selectable
                                >
                                  {currentTerminal.serial_number ??
                                    "— not yet discovered —"}
                                </Text>
                              </View>
                              {currentTerminal.terminal_model && (
                                <View className="flex-row items-center">
                                  <Text className="text-[9px] font-semibold text-gray-400 w-[36px]">
                                    Model:
                                  </Text>
                                  <Text
                                    className="text-[9px] text-black font-mono"
                                    selectable
                                  >
                                    {currentTerminal.terminal_model}
                                  </Text>
                                </View>
                              )}
                              <View className="flex-row items-center">
                                <Text className="text-[9px] font-semibold text-gray-400 w-[36px]">
                                  ID:
                                </Text>
                                <Text
                                  className="text-[9px] text-black font-mono"
                                  selectable
                                >
                                  {currentTerminal.id.slice(0, 8)}
                                </Text>
                              </View>
                            </>
                          ) : currentTerminal.register_id ? (
                            <Text className="text-[9px] text-gray-400">
                              TPN: {currentTerminal.register_id}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                      {(() => {
                        const statusColor = terminalConnectActivity
                          ? "#0D9488"
                          : currentTerminal.is_connected
                            ? "#16A34A"
                            : "#DC2626";
                        return (
                          <View
                            className="flex-row items-center gap-1 px-2 py-1 rounded-lg"
                            style={{
                              backgroundColor: statusColor + "20",
                              maxWidth: 160,
                            }}
                          >
                            <View
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: statusColor }}
                            />
                            <Text
                              className="text-[10px] font-semibold"
                              style={{ color: statusColor }}
                              numberOfLines={1}
                            >
                              {terminalConnectActivity ??
                                (currentTerminal.is_connected
                                  ? "Online"
                                  : "Offline")}
                            </Text>
                          </View>
                        );
                      })()}
                    </View>
                  </View>

                  <View className="flex-row gap-1.5">
                    <TouchableOpacity
                      onPress={handleTestConnection}
                      disabled={isTestingConnection}
                      className="flex-1 py-2 rounded-xl items-center flex-row justify-center border border-teal-300 bg-teal-50"
                    >
                      {isTestingConnection ? (
                        <>
                          <ActivityIndicator size="small" color="#0D9488" />
                          <Text className="text-[11px] font-semibold text-teal-600 ml-1.5">
                            {terminalConnectActivity ?? "Testing…"}
                          </Text>
                        </>
                      ) : (
                        <>
                          <RefreshCw size={13} color="#0D9488" />
                          <Text className="text-[11px] font-semibold text-teal-600 ml-1">
                            Test
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleStartEdit}
                      className="flex-1 py-2 rounded-xl items-center flex-row justify-center border border-teal-300 bg-teal-50"
                    >
                      <Pencil size={13} color="#0D9488" />
                      <Text className="text-[11px] font-semibold text-teal-600 ml-1">
                        Edit
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setShowTerminalPicker(true)}
                      className="flex-1 py-2 rounded-xl items-center flex-row justify-center border border-teal-300 bg-teal-50"
                    >
                      <CreditCard size={13} color="#0D9488" />
                      <Text className="text-[11px] font-semibold text-teal-600 ml-1">
                        Switch
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        setShowRegisterForm(true);
                      }}
                      className="flex-1 py-2 rounded-xl items-center flex-row justify-center border border-teal-300 bg-teal-50"
                    >
                      <Plus size={13} color="#0D9488" />
                      <Text className="text-[11px] font-semibold text-teal-600 ml-1">
                        Add
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View className="px-4 py-3">
                  <View className="flex-row gap-3">
                    {terminals.length > 0 && (
                      <TouchableOpacity
                        onPress={() => setShowTerminalPicker(true)}
                        className="flex-1 py-3 rounded-xl items-center flex-row justify-center border border-teal-300 bg-teal-50"
                      >
                        <CreditCard size={15} color="#0D9488" />
                        <Text className="text-sm font-bold text-teal-600 ml-1.5">
                          Assign Existing
                        </Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      onPress={() => {
                        setShowRegisterForm(true);
                      }}
                      className="flex-1 py-3 rounded-xl items-center flex-row justify-center border border-gray-200 bg-gray-50"
                    >
                      <Plus size={15} color="#0D9488" />
                      <Text className="text-sm font-bold text-teal-600 ml-1.5">
                        Register New
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}
        </View>

        <Section title="App">
          <Row label="Version" value={appJson.expo.version} />
        </Section>

        {/* ── End Station Session ── */}
        <View className="pt-4 pb-8">
          <Pressable
            onPress={() => setShowConfirm(true)}
            disabled={isEnding}
            className="flex-row items-center justify-center px-4 py-4 rounded-2xl border border-red-200 bg-red-50"
          >
            <LogOut size={20} color="#DC2626" />
            <Text className="text-base font-semibold text-red-600 ml-3">
              {isEnding ? "Ending session…" : "End Station Session"}
            </Text>
          </Pressable>
          <Text className="text-xs text-gray-400 text-center mt-2">
            Ends the station session and returns to station selection
          </Text>
        </View>
      </ScrollView>

      {showConfirm && (
        <View className="absolute inset-0 bg-black/40 items-center justify-center px-6">
          <View className="w-full max-w-sm bg-white rounded-2xl p-6">
            <Text className="text-lg font-bold text-black text-center mb-2">
              End Station Session
            </Text>
            <Text className="text-sm text-gray-500 text-center mb-6">
              This will end the current station session and return you to
              station selection. Your account will remain logged in.
            </Text>
            <Pressable
              onPress={handleEndSession}
              disabled={isEnding}
              className="py-3 rounded-xl bg-red-500 items-center mb-2"
            >
              <Text className="text-white font-semibold text-base">
                {isEnding ? "Ending session…" : "End Session"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setShowConfirm(false)}
              disabled={isEnding}
              className="py-3 rounded-xl bg-gray-100 items-center"
            >
              <Text className="text-gray-700 font-semibold text-base">
                Cancel
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
        {title}
      </Text>
      <View
        className="rounded-2xl border border-gray-200"
        style={{ overflow: "hidden" }}
      >
        {children}
      </View>
    </View>
  );
}

function Row({
  label,
  value,
  icon,
  mono,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100">
      <Text className="text-base text-gray-600">{label}</Text>
      <View className="flex-row items-center gap-2">
        {icon}
        <Text
          className="text-base font-semibold text-black"
          style={mono ? { fontFamily: "monospace", fontSize: 12 } : undefined}
          numberOfLines={1}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}
