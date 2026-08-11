import appJson from "@/app.json";
import { KioskProfileEditor } from "@/components/kiosk/shared/KioskProfileEditor";
import { KioskUpdateChecker } from "@/components/kiosk/shared/KioskUpdateChecker";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { usePaymentTerminal } from "@/hooks/usePaymentTerminal";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { useTerminalStatus } from "@/hooks/useTerminalStatus";
import { getDeviceId } from "@/lib/deviceId";
import { images } from "@/lib/image";
import { terminalTypeLabel } from "@/lib/processorLabels";
import { replaceRoute } from "@/lib/rootNavigation";
import { toastService } from "@/lib/toastService";
import { clearStationData } from "@/services/cacheService";
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
    CreditCard,
    Info,
    LayoutGrid,
    LogOut,
    type LucideIcon,
    MonitorSmartphone,
    Pencil,
    Plus,
    RefreshCw,
    SlidersHorizontal,
    Usb,
    Wifi,
    WifiOff,
    X,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    type ViewStyle,
} from "react-native";

const TEAL = "#0D9488";

/** Sections shown in the sidebar. */
type SectionId = "overview" | "profile" | "menu" | "terminal" | "about";

const SECTIONS: {
  id: SectionId;
  label: string;
  Icon: LucideIcon;
  title: string;
  subtitle: string;
}[] = [
  {
    id: "overview",
    label: "Overview",
    Icon: MonitorSmartphone,
    title: "Overview",
    subtitle: "Connectivity and station identity",
  },
  {
    id: "profile",
    label: "Kiosk Profile",
    Icon: SlidersHorizontal,
    title: "Kiosk Profile",
    subtitle: "Display, appearance, and checkout options",
  },
  {
    id: "menu",
    label: "Menu Layout",
    Icon: LayoutGrid,
    title: "Menu Layout",
    subtitle: "How menu items are arranged on this device",
  },
  {
    id: "terminal",
    label: "Payment Terminal",
    Icon: CreditCard,
    title: "Payment Terminal",
    subtitle: "Manage the card reader wired to this station",
  },
  {
    id: "about",
    label: "About",
    Icon: Info,
    title: "About",
    subtitle: "Application and device information",
  },
];

/** Soft elevation used on content cards to lift them off the canvas. */
const cardShadow: ViewStyle = {
  shadowColor: "#0F172A",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.05,
  shadowRadius: 4,
  elevation: 1,
};

/**
 * Kiosk diagnostics / settings overview. Reached by holding the logo on the
 * attract screen and entering a manager PIN. Shows the resolved kiosk profile,
 * station/location wiring, and live connectivity — enough for staff to confirm
 * "is this kiosk configured correctly and online" without leaving the device.
 *
 * Laid out as a sidebar + content workspace to match the POS settings surface:
 * a fixed nav rail on the left (with live connectivity + destructive actions
 * pinned to its footer) and a scrollable card canvas on the right.
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

  // ── Active sidebar section ──
  const [activeSection, setActiveSection] = useState<SectionId>("overview");
  const activeMeta =
    SECTIONS.find((s) => s.id === activeSection) ?? SECTIONS[0];

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
  const [showTerminalPicker, setShowTerminalPicker] = useState(false);
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [registerFormType, setRegisterFormType] = useState<
    "dejavoo" | "castles" | "valor"
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
    cancelPort: "5001",
    epi: "",
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
    cancelPort: "5001",
    epi: "",
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
        cancel_port: terminal.cancelPort ?? undefined,
        epi: terminal.epi ?? undefined,
        connection_type: terminal.connectionType,
        serial_number: terminal.serialNumber ?? null,
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
      } else if (registerFormType === "valor") {
        const connectionType =
          registerForm.connectionType === "usb" ? "usb" : "local";
        const localIp =
          registerForm.connectionType === "local_socket"
            ? registerForm.ipAddress
            : null;
        const localPort =
          registerForm.connectionType === "local_socket"
            ? parseInt(registerForm.port, 10) || 5000
            : null;
        const cancelPort = parseInt(registerForm.cancelPort, 10) || 5001;

        // Pre-test over TCP to discover the serial before the INSERT. Don't
        // persist a terminal we can't reach — a dead row would resolve as the
        // station's active terminal and knock the real one offline.
        let discoveredSN: string | undefined;
        if (
          registerForm.connectionType === "local_socket" &&
          registerForm.ipAddress
        ) {
          const preTest = await testConnectionWithConfig({
            terminalId: `provisional-${selectedStation.id}`,
            terminalType: "valor",
            ipAddress: registerForm.ipAddress,
            port: localPort ?? 5000,
            cancelPort,
            epi: registerForm.epi,
          });
          if (!preTest.success) {
            throw new Error(
              preTest.error ||
                "Could not connect to the Valor terminal. Check the IP, port, and that Valor Connect is enabled on the terminal, then try again.",
            );
          }
          discoveredSN = preTest.serialNumber;
        } else if (registerForm.connectionType === "usb") {
          // USB: no TCP pre-test. Serial backfills from the first sale.
        } else {
          throw new Error(
            "Enter the terminal IP address, or switch the connection type to USB.",
          );
        }

        const { data: terminalRow, error: termErr } = await supabase
          .from("payment_terminals")
          .insert({
            location_id: selectedStore.id,
            merchant_id: selectedStore.merchant_id,
            station_id: selectedStation.id,
            terminal_name: registerForm.name,
            terminal_type: "valor",
            terminal_model: registerForm.model || null,
            register_id: "VALOR",
            auth_key: "VALOR",
            local_ip_address: localIp,
            local_port: localPort,
            valor_ip_address: localIp,
            valor_port: localPort ?? 5000,
            valor_cancel_port: cancelPort,
            valor_epi: registerForm.epi || null,
            connection_type: connectionType,
            is_active: true,
            is_connected: false,
            api_environment: "production",
            serial_number: discoveredSN ?? null,
          } as any)
          .select("id")
          .single();
        if (termErr) throw termErr;
        newTerminalId = terminalRow.id;

        await supabase
          .from("payment_terminals")
          .update({ is_active: false })
          .eq("station_id", selectedStation.id)
          .eq("is_active", true)
          .neq("id", newTerminalId);
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
            terminal_type: "valor",
            terminal_model: registerForm.model || null,
            is_connected: false,
            ip_address: localIp ?? undefined,
            port: localPort ?? 5000,
            cancel_port: cancelPort,
            epi: registerForm.epi || undefined,
            connection_type:
              connectionType === "usb" ? "usb" : "local_socket",
            serial_number: discoveredSN ?? null,
            last_connection_status: null,
            last_connection_test_at: null,
          },
        });
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
        cancelPort: "5001",
        epi: "",
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
      port: String(
        currentTerminal.port ||
          (currentTerminal.terminal_type === "valor" ? 5000 : 8080),
      ),
      connectionType: (currentTerminal.connection_type === "usb"
        ? "usb"
        : "local_socket") as "local_socket" | "usb",
      cancelPort: String(currentTerminal.cancel_port || 5001),
      epi: currentTerminal.epi || "",
    });
    setIsEditingTerminal(true);
  };

  const handleSaveEdit = async () => {
    if (!currentTerminal || !selectedStore || !selectedStation) return;
    setIsSavingEdit(true);
    try {
      const testResult = await testConnectionWithConfig({
        terminalId: currentTerminal.id,
        terminalType: currentTerminal.terminal_type as
          | "castles"
          | "dejavoo"
          | "valor",
        ipAddress: editForm.ipAddress || undefined,
        port: editForm.port ? parseInt(editForm.port, 10) : undefined,
        cancelPort: editForm.cancelPort
          ? parseInt(editForm.cancelPort, 10)
          : undefined,
        epi: editForm.epi || undefined,
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
      } else if (currentTerminal.terminal_type === "valor") {
        updatePayload.connection_type =
          editForm.connectionType === "usb" ? "usb" : "local";
        const ip =
          editForm.connectionType === "local_socket"
            ? editForm.ipAddress.trim()
            : null;
        const port =
          editForm.connectionType === "local_socket"
            ? parseInt(editForm.port, 10) || 5000
            : null;
        updatePayload.local_ip_address = ip;
        updatePayload.local_port = port;
        updatePayload.valor_ip_address = ip;
        updatePayload.valor_port = port ?? 5000;
        updatePayload.valor_cancel_port =
          parseInt(editForm.cancelPort, 10) || 5001;
        updatePayload.valor_epi = editForm.epi.trim() || null;
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
            : currentTerminal.terminal_type === "valor"
              ? {
                  ip_address:
                    editForm.connectionType === "local_socket"
                      ? editForm.ipAddress.trim()
                      : undefined,
                  port:
                    editForm.connectionType === "local_socket"
                      ? parseInt(editForm.port, 10) || 5000
                      : undefined,
                  cancel_port: parseInt(editForm.cancelPort, 10) || 5001,
                  epi: editForm.epi.trim() || undefined,
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
    currentTerminal?.terminal_type === "castles" ||
    currentTerminal?.terminal_type === "valor"
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

  // ── Section renderers ──────────────────────────────────────────────

  const renderOverview = () => (
    <>
      <Section
        title="Connectivity"
        Icon={rawIsOnline ? Wifi : WifiOff}
        accent={rawIsOnline ? "#16A34A" : "#DC2626"}
      >
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
        <Row label="Pending syncs" value={String(pendingSyncCount)} last />
      </Section>

      <Section title="Station" Icon={MonitorSmartphone}>
        <Row label="Location" value={selectedStore?.name ?? "—"} />
        <Row label="Station" value={selectedStation?.station_name ?? "—"} />
        <Row label="Station ID" value={selectedStation?.id ?? "—"} mono last />
      </Section>
    </>
  );

  const renderMenuLayout = () => (
    <Section title="Items per row" Icon={LayoutGrid}>
      <View className="px-5 py-5">
        <Text className="text-sm text-gray-500 mb-4">
          How many menu items show across each row. “Auto” uses the template
          default ({config.orientation === "vertical" ? "3" : "4"} for this
          orientation).
        </Text>
        <View className="flex-row bg-gray-100 rounded-2xl p-1.5 gap-1.5">
          {(["auto", 2, 3, 4] as KioskMenuColumns[]).map((opt) => {
            const active = menuColumns === opt;
            return (
              <TouchableOpacity
                key={String(opt)}
                onPress={() => setMenuColumns(opt)}
                activeOpacity={0.85}
                className={`flex-1 py-3.5 items-center rounded-xl ${
                  active ? "bg-white" : ""
                }`}
                style={active ? cardShadow : undefined}
              >
                <Text
                  className={`text-base font-bold ${
                    active ? "text-teal-700" : "text-gray-400"
                  }`}
                >
                  {opt === "auto" ? "Auto" : opt}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </Section>
  );

  const renderAbout = () => (
    <>
      <Section title="Application" Icon={Info}>
        <Row label="App version" value={appJson.expo.version} />
        <Row label="Kiosk profile" value={config.profileName || "Kiosk"} />
        <Row label="Profile ID" value={config.id} mono last />
      </Section>
      <KioskUpdateChecker />
    </>
  );

  const renderTerminalPanel = () => (
    <View
      className="rounded-3xl border border-gray-200 bg-white overflow-hidden"
      style={cardShadow}
    >
      {showRegisterForm ? (
        <View className="px-5 py-5">
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-row items-center gap-2">
              <Plus size={18} color={TEAL} />
              <Text className="text-base font-bold text-gray-900">
                {registerFormType === "castles"
                  ? "Add Castles Terminal"
                  : registerFormType === "valor"
                    ? "Add Valor Terminal"
                    : "Register Dejavoo Terminal"}
              </Text>
            </View>
            <Pressable
              onPress={() => setShowRegisterForm(false)}
              className="w-9 h-9 rounded-full bg-gray-100 items-center justify-center"
            >
              <X size={18} color="#6B7280" />
            </Pressable>
          </View>

          {/* Terminal type toggle (Castles / Valor) */}
          <View className="flex-row bg-gray-100 rounded-2xl p-1.5 gap-1.5 mb-4">
            {(
              [
                { id: "castles" as const, label: "Castles" },
                { id: "valor" as const, label: "Valor" },
              ]
            ).map((opt) => {
              const active = registerFormType === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  onPress={() => {
                    setRegisterFormType(opt.id);
                    setRegisterForm((f) => ({
                      ...f,
                      port: opt.id === "valor" ? "5000" : "8080",
                    }));
                  }}
                  activeOpacity={0.85}
                  className={`flex-1 py-3 items-center rounded-xl ${
                    active ? "bg-white" : ""
                  }`}
                  style={active ? cardShadow : undefined}
                >
                  <Text
                    className={`text-sm font-bold ${
                      active ? "text-teal-700" : "text-gray-400"
                    }`}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {registerFormType === "castles" ||
          registerFormType === "valor" ? (
            <>
              <View className="mb-3">
                <FieldLabel>Connection</FieldLabel>
                <View className="flex-row bg-gray-100 rounded-2xl p-1.5 gap-1.5">
                  {[
                    {
                      id: "local_socket" as const,
                      label: "TCP / WiFi",
                      Icon: Wifi,
                    },
                    { id: "usb" as const, label: "USB (wired)", Icon: Usb },
                  ].map((opt) => {
                    const active = registerForm.connectionType === opt.id;
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
                        activeOpacity={0.85}
                        className={`flex-1 py-3 flex-row items-center justify-center gap-1.5 rounded-xl ${
                          active ? "bg-white" : ""
                        }`}
                        style={active ? cardShadow : undefined}
                      >
                        <Icon size={15} color={active ? TEAL : "#9CA3AF"} />
                        <Text
                          className={`text-sm font-bold ${
                            active ? "text-teal-700" : "text-gray-400"
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
                <View className="flex-row gap-3 mb-3">
                  <View className="flex-[3]">
                    <FieldLabel>IP Address *</FieldLabel>
                    <Input
                      value={registerForm.ipAddress}
                      onChangeText={(v) =>
                        setRegisterForm((f) => ({ ...f, ipAddress: v }))
                      }
                      placeholder="192.168.1.100"
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View className="flex-[1.2]">
                    <FieldLabel>Port</FieldLabel>
                    <Input
                      value={registerForm.port}
                      onChangeText={(v) =>
                        setRegisterForm((f) => ({ ...f, port: v }))
                      }
                      placeholder={
                        registerFormType === "valor" ? "5000" : "8080"
                      }
                      keyboardType="number-pad"
                    />
                  </View>
                </View>
              ) : (
                <View className="p-3.5 mb-3 rounded-2xl border border-teal-200 bg-teal-50 flex-row items-center gap-2.5">
                  <Usb size={16} color={TEAL} />
                  <Text className="flex-1 text-sm text-gray-600">
                    USB — no IP needed. The terminal is identified by USB device
                    serial.
                  </Text>
                </View>
              )}

              {/* Valor-only: cancel port (5001) + EPI */}
              {registerFormType === "valor" && (
                <View className="flex-row gap-3 mb-3">
                  {registerForm.connectionType === "local_socket" && (
                    <View className="flex-[1.2]">
                      <FieldLabel>Cancel Port</FieldLabel>
                      <Input
                        value={registerForm.cancelPort}
                        onChangeText={(v) =>
                          setRegisterForm((f) => ({ ...f, cancelPort: v }))
                        }
                        placeholder="5001"
                        keyboardType="number-pad"
                      />
                    </View>
                  )}
                  <View className="flex-[3]">
                    <FieldLabel>EPI</FieldLabel>
                    <Input
                      value={registerForm.epi}
                      onChangeText={(v) =>
                        setRegisterForm((f) => ({ ...f, epi: v }))
                      }
                      placeholder="e.g. 2319900000"
                      keyboardType="number-pad"
                    />
                  </View>
                </View>
              )}

              <View className="mb-4">
                <FieldLabel>Terminal Name *</FieldLabel>
                <Input
                  value={registerForm.name}
                  onChangeText={(v) =>
                    setRegisterForm((f) => ({ ...f, name: v }))
                  }
                  placeholder="e.g. Front Counter"
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
                <View key={field.key} className="mb-3">
                  <FieldLabel>{field.label}</FieldLabel>
                  <Input
                    value={(registerForm as any)[field.key]}
                    onChangeText={(v) =>
                      setRegisterForm((f) => ({ ...f, [field.key]: v }))
                    }
                    placeholder={field.placeholder}
                    secureTextEntry={field.secure}
                  />
                </View>
              ))}
              <View className="mb-4">
                <FieldLabel>Environment</FieldLabel>
                <View className="flex-row bg-gray-100 rounded-2xl p-1.5 gap-1.5">
                  {(["sandbox", "production"] as const).map((env) => {
                    const active = registerForm.environment === env;
                    return (
                      <TouchableOpacity
                        key={env}
                        onPress={() =>
                          setRegisterForm((f) => ({ ...f, environment: env }))
                        }
                        activeOpacity={0.85}
                        className={`flex-1 py-3 items-center rounded-xl ${
                          active ? "bg-white" : ""
                        }`}
                        style={active ? cardShadow : undefined}
                      >
                        <Text
                          className={`text-sm font-bold capitalize ${
                            active ? "text-teal-700" : "text-gray-400"
                          }`}
                        >
                          {env}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </>
          )}

          <PrimaryButton
            onPress={handleRegisterTerminal}
            disabled={!isRegisterFormValid || isRegistering}
            loading={isRegistering}
            icon={Check}
            label={
              registerFormType === "dejavoo"
                ? "Register Terminal"
                : "Save & Connect"
            }
          />
        </View>
      ) : showTerminalPicker ? (
        <View className="px-5 py-5">
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-base font-bold text-gray-900">
              Available Terminals
            </Text>
            <Pressable
              onPress={() => setShowTerminalPicker(false)}
              className="px-3 py-1.5 rounded-full bg-gray-100"
            >
              <Text className="text-sm font-semibold text-gray-600">
                Cancel
              </Text>
            </Pressable>
          </View>
          {terminals.length === 0 ? (
            <Text className="text-sm text-gray-400 text-center py-6">
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
                  activeOpacity={0.85}
                  className={`px-4 py-3.5 rounded-2xl mb-2.5 border ${
                    isCurrent
                      ? "bg-teal-50 border-teal-300"
                      : "bg-gray-50 border-gray-200"
                  }`}
                >
                  <View className="flex-row items-center">
                    <View
                      className={`w-3 h-3 rounded-full mr-3 ${
                        t.isConnected ? "bg-green-500" : "bg-gray-300"
                      }`}
                    />
                    <View className="flex-1">
                      <Text className="text-base font-semibold text-gray-900">
                        {t.name}
                      </Text>
                      <View className="flex-row items-center mt-1 flex-wrap gap-1.5">
                        <View className="px-2 py-0.5 rounded-md bg-teal-100">
                          <Text className="text-[11px] font-bold text-teal-700">
                            {terminalTypeLabel(t.terminalType)}
                          </Text>
                        </View>
                        {(t.terminalType === "castles" ||
                          t.terminalType === "valor") && (
                          <View className="px-2 py-0.5 rounded-md bg-gray-100 flex-row items-center gap-1">
                            {t.connectionType === "usb" ? (
                              <Usb size={10} color="#D97706" />
                            ) : (
                              <Wifi size={10} color="#9CA3AF" />
                            )}
                            <Text className="text-[11px] font-semibold text-gray-500">
                              {t.connectionType === "usb" ? "USB" : "TCP"}
                            </Text>
                          </View>
                        )}
                        {t.model && (
                          <Text className="text-[11px] text-gray-400">
                            {t.model}
                          </Text>
                        )}
                      </View>
                    </View>
                    {isCurrent && (
                      <View className="px-2.5 py-1 rounded-lg border border-teal-300 bg-teal-100">
                        <Text className="text-[11px] font-bold text-teal-700">
                          Current
                        </Text>
                      </View>
                    )}
                    {isOtherStation && (
                      <View className="px-2.5 py-1 rounded-lg bg-amber-100">
                        <Text className="text-[11px] font-bold text-amber-700">
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
            className="flex-row items-center justify-center mt-2 py-3"
          >
            <Plus size={17} color={TEAL} />
            <Text className="text-sm font-bold text-teal-700 ml-1.5">
              Register New Terminal
            </Text>
          </TouchableOpacity>
        </View>
      ) : isEditingTerminal && currentTerminal ? (
        <View className="px-5 py-5">
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-row items-center gap-2">
              <Pencil size={17} color={TEAL} />
              <Text className="text-base font-bold text-gray-900">
                Edit Terminal
              </Text>
              <View className="px-2 py-0.5 rounded-md bg-teal-100">
                <Text className="text-[11px] font-bold text-teal-700">
                  {terminalTypeLabel(currentTerminal.terminal_type)}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={() => setIsEditingTerminal(false)}
              className="w-9 h-9 rounded-full bg-gray-100 items-center justify-center"
            >
              <X size={18} color="#6B7280" />
            </Pressable>
          </View>

          <View className="mb-3">
            <FieldLabel>Terminal Name *</FieldLabel>
            <Input
              value={editForm.name}
              onChangeText={(v) => setEditForm((f) => ({ ...f, name: v }))}
              placeholder="e.g. Front Counter"
            />
          </View>

          {(currentTerminal.terminal_type === "castles" ||
            currentTerminal.terminal_type === "valor") && (
            <>
              <View className="mb-3">
                <FieldLabel>Connection</FieldLabel>
                <View className="flex-row bg-gray-100 rounded-2xl p-1.5 gap-1.5">
                  {[
                    {
                      id: "local_socket" as const,
                      label: "TCP / WiFi",
                      Icon: Wifi,
                    },
                    { id: "usb" as const, label: "USB (wired)", Icon: Usb },
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
                        activeOpacity={0.85}
                        className={`flex-1 py-3 flex-row items-center justify-center gap-1.5 rounded-xl ${
                          active ? "bg-white" : ""
                        }`}
                        style={active ? cardShadow : undefined}
                      >
                        <Icon size={15} color={active ? TEAL : "#9CA3AF"} />
                        <Text
                          className={`text-sm font-bold ${
                            active ? "text-teal-700" : "text-gray-400"
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
                <View className="flex-row gap-3 mb-3">
                  <View className="flex-[3]">
                    <FieldLabel>IP Address *</FieldLabel>
                    <Input
                      value={editForm.ipAddress}
                      onChangeText={(v) =>
                        setEditForm((f) => ({ ...f, ipAddress: v }))
                      }
                      placeholder="192.168.1.100"
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View className="flex-[1.2]">
                    <FieldLabel>Port</FieldLabel>
                    <Input
                      value={editForm.port}
                      onChangeText={(v) =>
                        setEditForm((f) => ({ ...f, port: v }))
                      }
                      placeholder={
                        currentTerminal.terminal_type === "valor"
                          ? "5000"
                          : "8080"
                      }
                      keyboardType="number-pad"
                    />
                  </View>
                </View>
              ) : (
                <View className="p-3.5 mb-3 rounded-2xl border border-teal-200 bg-teal-50 flex-row items-center gap-2.5">
                  <Usb size={16} color={TEAL} />
                  <Text className="flex-1 text-sm text-gray-600">
                    USB — no IP needed. The terminal is identified by USB device
                    serial.
                  </Text>
                </View>
              )}

              {/* Valor-only: cancel port (5001) + EPI */}
              {currentTerminal.terminal_type === "valor" && (
                <>
                  {editForm.connectionType === "local_socket" && (
                    <View className="mb-3">
                      <FieldLabel>Cancel Port</FieldLabel>
                      <Input
                        value={editForm.cancelPort}
                        onChangeText={(v) =>
                          setEditForm((f) => ({ ...f, cancelPort: v }))
                        }
                        placeholder="5001"
                        keyboardType="number-pad"
                      />
                    </View>
                  )}
                  <View className="mb-3">
                    <FieldLabel>EPI (optional)</FieldLabel>
                    <Input
                      value={editForm.epi}
                      onChangeText={(v) =>
                        setEditForm((f) => ({ ...f, epi: v }))
                      }
                      placeholder="Electronic Payment Interface id"
                    />
                  </View>
                </>
              )}
            </>
          )}
          {currentTerminal.terminal_type !== "castles" &&
            currentTerminal.terminal_type !== "valor" && (
            <>
              <View className="mb-3">
                <FieldLabel>TPN *</FieldLabel>
                <Input
                  value={editForm.tpn}
                  onChangeText={(v) => setEditForm((f) => ({ ...f, tpn: v }))}
                  placeholder="Terminal Point Number"
                />
              </View>
              <View className="mb-3">
                <FieldLabel>Auth Key</FieldLabel>
                <Input
                  value={editForm.authKey}
                  onChangeText={(v) =>
                    setEditForm((f) => ({ ...f, authKey: v }))
                  }
                  placeholder="Leave blank to keep current"
                  secureTextEntry
                />
              </View>
            </>
          )}

          <View className="mt-1">
            <PrimaryButton
              onPress={handleSaveEdit}
              disabled={!isEditFormValid || isSavingEdit}
              loading={isSavingEdit}
              icon={Check}
              label="Save Changes"
            />
          </View>
        </View>
      ) : currentTerminal ? (
        <View className="px-5 py-5">
          <View
            className={`rounded-2xl border p-4 mb-4 ${
              currentTerminal.is_connected
                ? "border-green-300 bg-green-50/40"
                : "border-gray-200 bg-gray-50"
            }`}
          >
            <View className="flex-row items-start justify-between">
              <View className="flex-1 pr-3">
                <View className="flex-row items-center gap-2">
                  <Text className="text-lg font-bold text-gray-900">
                    {currentTerminal.terminal_name}
                  </Text>
                  <View className="px-2 py-0.5 rounded-md bg-teal-100">
                    <Text className="text-[11px] font-bold text-teal-700">
                      {terminalTypeLabel(
                        currentTerminal.terminal_type,
                      ).toUpperCase()}
                    </Text>
                  </View>
                  {(currentTerminal.terminal_type === "castles" ||
                    currentTerminal.terminal_type === "valor") && (
                    <View className="px-2 py-0.5 rounded-md bg-teal-100 flex-row items-center gap-1">
                      {currentTerminal.connection_type === "usb" ? (
                        <Usb size={11} color={TEAL} />
                      ) : (
                        <Wifi size={11} color={TEAL} />
                      )}
                      <Text className="text-[11px] font-bold text-teal-700">
                        {currentTerminal.connection_type === "usb"
                          ? "USB"
                          : "WiFi"}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
              {(() => {
                const statusColor = terminalConnectActivity
                  ? TEAL
                  : currentTerminal.is_connected
                    ? "#16A34A"
                    : "#DC2626";
                return (
                  <View
                    className="flex-row items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
                    style={{
                      backgroundColor: statusColor + "1A",
                      maxWidth: 180,
                    }}
                  >
                    <View
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: statusColor }}
                    />
                    <Text
                      className="text-xs font-bold"
                      style={{ color: statusColor }}
                      numberOfLines={1}
                    >
                      {terminalConnectActivity ??
                        (currentTerminal.is_connected ? "Online" : "Offline")}
                    </Text>
                  </View>
                );
              })()}
            </View>

            {currentTerminal.terminal_type === "castles" ||
            currentTerminal.terminal_type === "valor" ? (
              <View className="mt-3 pt-3 border-t border-gray-200 gap-1.5">
                <KV
                  k={
                    currentTerminal.connection_type === "usb"
                      ? "Conn"
                      : "Address"
                  }
                  v={
                    currentTerminal.connection_type === "usb"
                      ? "USB (wired)"
                      : currentTerminal.ip_address
                        ? `${currentTerminal.ip_address}:${
                            currentTerminal.port ||
                            (currentTerminal.terminal_type === "valor"
                              ? 5000
                              : 8080)
                          }`
                        : "—"
                  }
                />
                {currentTerminal.terminal_type === "valor" &&
                  currentTerminal.epi && (
                    <KV k="EPI" v={currentTerminal.epi} />
                  )}
                <KV
                  k="Serial"
                  v={currentTerminal.serial_number ?? "— not yet discovered —"}
                />
                {currentTerminal.terminal_model && (
                  <KV k="Model" v={currentTerminal.terminal_model} />
                )}
                <KV k="ID" v={currentTerminal.id.slice(0, 8)} />
              </View>
            ) : currentTerminal.register_id ? (
              <View className="mt-3 pt-3 border-t border-gray-200">
                <KV k="TPN" v={currentTerminal.register_id} />
              </View>
            ) : null}
          </View>

          <View className="flex-row gap-2.5">
            <ActionButton
              onPress={handleTestConnection}
              disabled={isTestingConnection}
              loading={isTestingConnection}
              loadingLabel={terminalConnectActivity ?? "Testing…"}
              icon={RefreshCw}
              label="Test"
              primary
            />
            <ActionButton
              onPress={handleStartEdit}
              icon={Pencil}
              label="Edit"
            />
            <ActionButton
              onPress={() => setShowTerminalPicker(true)}
              icon={CreditCard}
              label="Switch"
            />
            <ActionButton
              onPress={() => setShowRegisterForm(true)}
              icon={Plus}
              label="Add"
            />
          </View>
        </View>
      ) : (
        <View className="px-5 py-6">
          <View className="items-center mb-5">
            <View className="w-14 h-14 rounded-2xl bg-gray-100 items-center justify-center mb-3">
              <CreditCard size={26} color="#9CA3AF" />
            </View>
            <Text className="text-base font-semibold text-gray-900">
              No terminal on this station
            </Text>
            <Text className="text-sm text-gray-400 mt-1 text-center">
              Assign an existing reader or register a new one.
            </Text>
          </View>
          <View className="flex-row gap-3">
            {terminals.length > 0 && (
              <TouchableOpacity
                onPress={() => setShowTerminalPicker(true)}
                activeOpacity={0.85}
                className="flex-1 py-4 rounded-2xl items-center flex-row justify-center border border-teal-300 bg-teal-50"
              >
                <CreditCard size={17} color={TEAL} />
                <Text className="text-base font-bold text-teal-700 ml-2">
                  Assign Existing
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => setShowRegisterForm(true)}
              activeOpacity={0.9}
              className="flex-1 py-4 rounded-2xl items-center flex-row justify-center bg-teal-600"
            >
              <Plus size={17} color="#FFFFFF" />
              <Text className="text-base font-bold text-white ml-2">
                Register New
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );

  // ── Layout ─────────────────────────────────────────────────────────

  return (
    <View className="flex-1 flex-row bg-gray-50">
      {/* ── Sidebar ── */}
      <View className="w-72 bg-white border-r border-gray-200">
        {/* Brand header */}
        <View className="px-5 pt-12 pb-5 border-b border-gray-100">
          <View className="flex-row items-center gap-3">
            <Image
              source={images.dexalogo}
              resizeMode="cover"
              style={{ width: 48, height: 48, borderRadius: 14 }}
            />
            <View className="flex-1">
              <Text className="text-lg font-bold text-gray-900">
                Kiosk Settings
              </Text>
              <Text className="text-xs text-gray-400" numberOfLines={1}>
                {selectedStation?.station_name ?? "Diagnostics"}
              </Text>
            </View>
          </View>

          {/* Live connectivity pill */}
          <View
            className={`flex-row items-center gap-2 mt-4 self-start px-3 py-1.5 rounded-full ${
              rawIsOnline ? "bg-green-100" : "bg-red-100"
            }`}
          >
            <View
              className={`w-2 h-2 rounded-full ${
                rawIsOnline ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <Text
              className={`text-xs font-bold ${
                rawIsOnline ? "text-green-700" : "text-red-700"
              }`}
            >
              {rawIsOnline ? "Online" : "Offline"}
            </Text>
          </View>
        </View>

        {/* Nav */}
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 12 }}
          showsVerticalScrollIndicator={false}
        >
          {SECTIONS.map((section) => (
            <NavItem
              key={section.id}
              icon={section.Icon}
              label={section.label}
              active={activeSection === section.id}
              onPress={() => setActiveSection(section.id)}
            />
          ))}
        </ScrollView>

        {/* Footer actions */}
        <View className="px-3 pt-3 pb-8 border-t border-gray-100 gap-2.5">
          <Pressable
            onPress={() => setShowConfirm(true)}
            disabled={isEnding}
            className="flex-row items-center justify-center px-4 py-3.5 rounded-2xl border border-red-200 bg-red-50"
          >
            <LogOut size={18} color="#DC2626" />
            <Text className="text-sm font-bold text-red-600 ml-2">
              {isEnding ? "Ending session…" : "End Station Session"}
            </Text>
          </Pressable>
          <Pressable
            onPress={onClose}
            className="flex-row items-center justify-center px-4 py-3.5 rounded-2xl bg-gray-100"
          >
            <X size={18} color="#374151" />
            <Text className="text-sm font-bold text-gray-700 ml-2">Close</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Content ── */}
      <View className="flex-1">
        {/* Content header */}
        <View className="flex-row items-start justify-between px-8 pt-12 pb-5 border-b border-gray-100 bg-white">
          <View className="flex-1 pr-4">
            <Text className="text-2xl font-bold text-gray-900">
              {activeMeta.title}
            </Text>
            <Text className="text-sm text-gray-400 mt-1">
              {activeMeta.subtitle}
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            className="w-11 h-11 rounded-full bg-gray-100 items-center justify-center"
          >
            <X size={22} color="#374151" />
          </Pressable>
        </View>

        <ScrollView
          className="flex-1 px-8 py-6"
          contentContainerStyle={{ gap: 20, paddingBottom: 56 }}
          showsVerticalScrollIndicator={false}
        >
          {activeSection === "overview" && renderOverview()}
          {activeSection === "profile" && (
            <KioskProfileEditor
              config={config}
              onRefreshKioskConfig={onRefreshKioskConfig}
            />
          )}
          {activeSection === "menu" && renderMenuLayout()}
          {activeSection === "terminal" && renderTerminalPanel()}
          {activeSection === "about" && renderAbout()}
        </ScrollView>
      </View>

      {/* ── End-session confirm ── */}
      {showConfirm && (
        <View className="absolute inset-0 bg-black/40 items-center justify-center px-6">
          <View
            className="w-full max-w-sm bg-white rounded-3xl p-6"
            style={cardShadow}
          >
            <View className="w-12 h-12 rounded-2xl bg-red-50 items-center justify-center self-center mb-3">
              <LogOut size={24} color="#DC2626" />
            </View>
            <Text className="text-lg font-bold text-gray-900 text-center mb-2">
              End Station Session
            </Text>
            <Text className="text-sm text-gray-500 text-center mb-6">
              This will end the current station session and return you to
              station selection. Your account will remain logged in.
            </Text>
            <Pressable
              onPress={handleEndSession}
              disabled={isEnding}
              className="py-4 rounded-2xl bg-red-500 items-center mb-2.5"
            >
              <Text className="text-white font-bold text-base">
                {isEnding ? "Ending session…" : "End Session"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setShowConfirm(false)}
              disabled={isEnding}
              className="py-4 rounded-2xl bg-gray-100 items-center"
            >
              <Text className="text-gray-700 font-bold text-base">Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

// ── Sidebar nav item ──

function NavItem({
  icon: Icon,
  label,
  active,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className={`flex-row items-center px-3 py-3 rounded-2xl mb-1.5 ${
        active ? "bg-teal-50" : ""
      }`}
    >
      {active && (
        <View className="absolute left-0 top-2.5 bottom-2.5 w-1 rounded-full bg-teal-600" />
      )}
      <View
        className={`w-9 h-9 rounded-xl items-center justify-center mr-3 ${
          active ? "bg-teal-100" : "bg-gray-100"
        }`}
      >
        <Icon
          size={18}
          color={active ? TEAL : "#6B7280"}
          strokeWidth={active ? 2.4 : 2}
        />
      </View>
      <Text
        className={`flex-1 text-[15px] ${
          active ? "font-bold text-teal-700" : "font-medium text-gray-600"
        }`}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ── Content primitives ──

function Section({
  title,
  Icon,
  accent,
  children,
}: {
  title: string;
  Icon?: LucideIcon;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 10 }}>
      <View className="flex-row items-center gap-2">
        {Icon ? <Icon size={16} color={accent ?? "#6B7280"} /> : null}
        <Text className="text-sm font-bold text-gray-500 uppercase tracking-wide">
          {title}
        </Text>
      </View>
      <View
        className="rounded-3xl border border-gray-200 bg-white overflow-hidden"
        style={cardShadow}
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
  last,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  mono?: boolean;
  last?: boolean;
}) {
  return (
    <View
      className={`flex-row items-center justify-between px-5 py-4 ${
        last ? "" : "border-b border-gray-100"
      }`}
    >
      <Text className="text-base text-gray-500">{label}</Text>
      <View className="flex-row items-center gap-2 flex-1 justify-end pl-4">
        {icon}
        <Text
          className="text-base font-semibold text-gray-900"
          style={mono ? { fontFamily: "monospace", fontSize: 12 } : undefined}
          numberOfLines={1}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

/** Compact key/value line used inside the terminal detail card. */
function KV({ k, v }: { k: string; v: string }) {
  return (
    <View className="flex-row items-center">
      <Text className="text-xs font-bold text-gray-400 w-16">{k}</Text>
      <Text
        className="flex-1 text-xs text-gray-700"
        style={{ fontFamily: "monospace" }}
        selectable
        numberOfLines={1}
      >
        {v}
      </Text>
    </View>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text-xs font-semibold text-gray-500 mb-1.5">
      {children}
    </Text>
  );
}

function Input(props: React.ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      placeholderTextColor="#9CA3AF"
      {...props}
      className="bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 text-base text-gray-900"
    />
  );
}

/** Full-width solid-teal confirm button (register / save). */
function PrimaryButton({
  onPress,
  disabled,
  loading,
  icon: Icon,
  label,
}: {
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon: LucideIcon;
  label: string;
}) {
  const enabled = !disabled;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.9}
      className={`py-4 rounded-2xl items-center flex-row justify-center ${
        enabled ? "bg-teal-600" : "bg-gray-200"
      }`}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={enabled ? "#FFFFFF" : "#9CA3AF"}
        />
      ) : (
        <>
          <Icon size={17} color={enabled ? "#FFFFFF" : "#9CA3AF"} />
          <Text
            className={`text-base font-bold ml-2 ${
              enabled ? "text-white" : "text-gray-400"
            }`}
          >
            {label}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

/** One of the Test / Edit / Switch / Add buttons on the terminal card. */
function ActionButton({
  onPress,
  disabled,
  loading,
  loadingLabel,
  icon: Icon,
  label,
  primary,
}: {
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  icon: LucideIcon;
  label: string;
  primary?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      className={`flex-1 py-3 rounded-2xl items-center flex-row justify-center ${
        primary ? "bg-teal-600" : "border border-teal-300 bg-teal-50"
      }`}
    >
      {loading ? (
        <>
          <ActivityIndicator size="small" color={primary ? "#FFFFFF" : TEAL} />
          <Text
            className={`text-xs font-bold ml-1.5 ${
              primary ? "text-white" : "text-teal-700"
            }`}
            numberOfLines={1}
          >
            {loadingLabel ?? label}
          </Text>
        </>
      ) : (
        <>
          <Icon size={15} color={primary ? "#FFFFFF" : TEAL} />
          <Text
            className={`text-[13px] font-bold ml-1.5 ${
              primary ? "text-white" : "text-teal-700"
            }`}
          >
            {label}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}
