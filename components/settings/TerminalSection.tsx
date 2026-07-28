import { colors } from "@/lib/theme";
import type { StationPaymentTerminal } from "@/types/station";
import {
  Check,
  ChevronRight,
  CreditCard,
  Pencil,
  Plus,
  RefreshCw,
  Usb,
  Wifi,
  WifiOff,
  X,
} from "lucide-react-native";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// ── Types ──────────────────────────────────────────────────────

/** Terminal record as exposed by usePaymentTerminalStore */
export interface PaymentTerminal {
  id: string;
  name: string;
  model?: string;
  terminalType?: string;
  ipAddress?: string;
  port?: number;
  connectionType?: "local_socket" | "usb";
  isActive: boolean;
  isConnected: boolean;
  stationId?: string | null;
  lastConnectionTest?: string;
  lastConnectionStatus?: "Online" | "Offline" | "NotFound";
}

export interface RegisterTerminalParams {
  type: "dejavoo" | "castles" | "valor";
  name: string;
  model: string;
  tpn: string;
  authKey: string;
  environment: "sandbox" | "production";
  ipAddress: string;
  port: string;
  connectionType: "local_socket" | "usb";
  /** Valor cancel port (5001). */
  cancelPort?: string;
  /** Valor EPI. */
  epi?: string;
}

export interface SaveEditParams {
  name: string;
  model: string;
  tpn: string;
  authKey: string;
  ipAddress: string;
  port: string;
  connectionType: "local_socket" | "usb";
  cancelPort?: string;
  epi?: string;
}

export interface TerminalSectionProps {
  currentTerminal: StationPaymentTerminal | null;
  terminals: PaymentTerminal[];
  selectedStation: any;
  selectedStore: any;
  isTestingConnection: boolean;
  onTestConnection: () => Promise<void>;
  onDiagnoseCastles: () => Promise<void>;
  onAssignTerminal: (terminal: PaymentTerminal) => Promise<void>;
  onRegisterTerminal: (params: RegisterTerminalParams) => Promise<void>;
  onSaveEdit: (params: SaveEditParams) => Promise<void>;
  onTestConnectionWithConfig: (params: {
    terminalId: string;
    terminalType: string;
    ipAddress: string;
    port: number;
  }) => Promise<{ success: boolean; error?: string }>;
}

// ── Shared input style ─────────────────────────────────────────

const inputStyle = {
  backgroundColor: colors.screen,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: 8,
  paddingHorizontal: 12,
  paddingVertical: 10,
  color: colors.heading,
  fontSize: 13,
} as const;

// ── Component ──────────────────────────────────────────────────

export const TerminalSection: React.FC<TerminalSectionProps> = ({
  currentTerminal,
  terminals,
  selectedStation,
  isTestingConnection,
  onTestConnection,
  onDiagnoseCastles,
  onAssignTerminal,
  onRegisterTerminal,
  onSaveEdit,
  onTestConnectionWithConfig,
}) => {
  // ---- Local UI state ----
  const [showTerminalPicker, setShowTerminalPicker] = useState(false);
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [registerFormType, setRegisterFormType] = useState<"dejavoo" | "castles" | "valor">("dejavoo");
  const [registerForm, setRegisterForm] = useState({
    name: "",
    tpn: "",
    authKey: "",
    model: "",
    environment: "sandbox" as "sandbox" | "production",
    ipAddress: "",
    port: "8080",
    connectionType: "local_socket" as "local_socket" | "usb",
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

  const [quickTestIp, setQuickTestIp] = useState("");
  const [quickTestPort, setQuickTestPort] = useState("8080");
  const [quickTestStatus, setQuickTestStatus] = useState<"idle" | "testing" | "online" | "offline">("idle");

  // ---- Derived ----

  const isRegisterFormValid =
    registerFormType === "dejavoo"
      ? registerForm.name.trim() && registerForm.tpn.trim() && registerForm.authKey.trim()
      : registerFormType === "valor"
        ? registerForm.name.trim() && (registerForm.connectionType === "usb" || registerForm.ipAddress.trim()) && registerForm.epi.trim()
        : registerForm.name.trim() && (registerForm.connectionType === "usb" || registerForm.ipAddress.trim());

  const isEditFormValid =
    currentTerminal?.terminal_type === "castles"
      ? editForm.name.trim() && (editForm.connectionType === "usb" || editForm.ipAddress.trim())
      : currentTerminal?.terminal_type === "valor"
        ? editForm.name.trim() && (editForm.connectionType === "usb" || editForm.ipAddress.trim()) && editForm.epi.trim()
        : editForm.name.trim() && editForm.tpn.trim();

  // ---- Handlers ----

  const handleQuickTest = useCallback(async () => {
    const ip = quickTestIp.trim();
    if (!ip) return;
    setQuickTestStatus("testing");
    try {
      const ok = await onTestConnectionWithConfig({
        terminalId: currentTerminal?.id ?? "quick-test",
        terminalType: "castles",
        ipAddress: ip,
        port: parseInt(quickTestPort, 10) || 8080,
      });
      setQuickTestStatus(ok.success ? "online" : "offline");
    } catch {
      setQuickTestStatus("offline");
    }
  }, [quickTestIp, quickTestPort, currentTerminal?.id, onTestConnectionWithConfig]);

  const handleAssign = useCallback(
    async (terminal: PaymentTerminal) => {
      setIsAssigning(true);
      try {
        await onAssignTerminal(terminal);
        setShowTerminalPicker(false);
      } catch {
        // parent handles toast
      } finally {
        setIsAssigning(false);
      }
    },
    [onAssignTerminal],
  );

  const handleRegister = useCallback(async () => {
    setIsRegistering(true);
    try {
      await onRegisterTerminal({
        type: registerFormType,
        ...registerForm,
        ipAddress: registerForm.ipAddress.replace(/\s/g, ''),
        port: registerForm.port.replace(/\s/g, ''),
      });
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
        cancelPort: "5001",
        epi: "",
      });
    } catch {
      // parent handles toast
    } finally {
      setIsRegistering(false);
    }
  }, [registerFormType, registerForm, onRegisterTerminal]);

  const handleStartEdit = useCallback(() => {
    if (!currentTerminal) return;
    setEditForm({
      name: currentTerminal.terminal_name || "",
      model: currentTerminal.terminal_model || "",
      tpn: currentTerminal.register_id || "",
      authKey: "",
      ipAddress: currentTerminal.ip_address || "",
      port: String(currentTerminal.port || (currentTerminal.terminal_type === "valor" ? 5000 : 8080)),
      connectionType: (currentTerminal.connection_type === "usb" ? "usb" : "local_socket") as "local_socket" | "usb",
      cancelPort: String(currentTerminal.cancel_port || 5001),
      epi: currentTerminal.epi || "",
    });
    setIsEditingTerminal(true);
  }, [currentTerminal]);

  const handleSaveEditLocal = useCallback(async () => {
    setIsSavingEdit(true);
    try {
      await onSaveEdit({
        ...editForm,
        ipAddress: editForm.ipAddress.replace(/\s/g, ''),
        port: editForm.port.replace(/\s/g, ''),
      });
      setIsEditingTerminal(false);
    } catch {
      // parent handles toast
    } finally {
      setIsSavingEdit(false);
    }
  }, [editForm, onSaveEdit]);

  const runInlineTest = useCallback(
    async (ip: string, port: string, terminalId: string, terminalType: "castles" | "valor" = "castles") => {
      const cleanIp = ip.replace(/\s/g, '');
      if (!cleanIp) return;
      setQuickTestStatus("testing");
      try {
        const ok = await onTestConnectionWithConfig({
          terminalId,
          terminalType,
          ipAddress: cleanIp,
          port: parseInt(port.replace(/\s/g, ''), 10) || (terminalType === "valor" ? 5000 : 8080),
        });
        setQuickTestStatus(ok.success ? "online" : "offline");
      } catch {
        setQuickTestStatus("offline");
      }
    },
    [onTestConnectionWithConfig],
  );

  // ── Quick-test result button helper ──────────────────────────

  const renderQuickTestButton = (
    ip: string,
    disabled: boolean,
    onPress: () => void,
    compact?: boolean,
  ) => (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || quickTestStatus === "testing"}
      style={{
        flex: compact ? 1 : undefined,
        marginTop: compact ? 0 : 8,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 1,
        backgroundColor:
          quickTestStatus === "online"
            ? colors.success + "15"
            : quickTestStatus === "offline"
              ? colors.danger + "15"
              : ip.trim()
                ? colors.teal + "15"
                : colors.screen,
        borderColor:
          quickTestStatus === "online"
            ? colors.success + "50"
            : quickTestStatus === "offline"
              ? colors.danger + "50"
              : ip.trim()
                ? colors.teal + "50"
                : colors.border,
        opacity: !ip.trim() ? 0.5 : 1,
      }}
    >
      {quickTestStatus === "testing" ? (
        <>
          <ActivityIndicator size="small" color={colors.teal} />
          <Text style={{ color: colors.teal, fontSize: 13, marginLeft: 8 }}>
            {compact ? "Testing..." : "Testing connection..."}
          </Text>
        </>
      ) : quickTestStatus === "online" ? (
        <>
          <Check size={15} color={colors.success} />
          <Text style={{ color: colors.success, fontSize: 13, fontWeight: "600", marginLeft: 8 }}>
            {compact ? "Reachable" : "Connected — terminal reachable"}
          </Text>
        </>
      ) : quickTestStatus === "offline" ? (
        <>
          <WifiOff size={15} color={colors.danger} />
          <Text style={{ color: colors.danger, fontSize: 13, marginLeft: 8 }}>
            {compact ? "Unreachable" : "No response — check IP & network"}
          </Text>
        </>
      ) : (
        <>
          <Wifi size={15} color={colors.teal} />
          <Text style={{ color: colors.teal, fontSize: 13, marginLeft: 8 }}>
            {compact ? "Test IP" : "Test Connection"}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );

  // ================================================================
  // 1. Register form view
  // ================================================================

  if (showRegisterForm) {
    return (
      <View>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Plus size={16} color={colors.teal} />
            <Text style={{ color: colors.heading, fontWeight: "700", fontSize: 13 }}>Add Terminal</Text>
          </View>
          <TouchableOpacity onPress={() => { setShowRegisterForm(false); setQuickTestStatus("idle"); }} style={{ padding: 4 }}>
            <X size={18} color={colors.muted} />
          </TouchableOpacity>
        </View>

        {/* Terminal type selector */}
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
          <TouchableOpacity
            onPress={() => setRegisterFormType("castles")}
            style={{
              flex: 1, borderRadius: 8, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 12, alignItems: "center",
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
              flex: 1, borderRadius: 8, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 12, alignItems: "center",
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
          <TouchableOpacity
            onPress={() => setRegisterFormType("valor")}
            style={{
              flex: 1, borderRadius: 8, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 12, alignItems: "center",
              backgroundColor: registerFormType === "valor" ? colors.teal + "20" : "transparent",
              borderColor: registerFormType === "valor" ? colors.teal + "50" : colors.border,
            }}
          >
            <Wifi size={18} color={registerFormType === "valor" ? colors.teal : colors.muted} />
            <Text style={{ fontWeight: "700", fontSize: 12, marginTop: 6, color: registerFormType === "valor" ? colors.teal : colors.muted }}>
              Valor
            </Text>
            <Text style={{ fontSize: 10, marginTop: 2, textAlign: "center", color: registerFormType === "valor" ? colors.label : colors.muted }}>
              Valor Connect / TCP
            </Text>
          </TouchableOpacity>
        </View>

        {/* Castles flow */}
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
                    onChangeText={(v) => { setRegisterForm((f) => ({ ...f, ipAddress: v })); setQuickTestStatus("idle"); }}
                    placeholder="192.168.1.100"
                    placeholderTextColor={colors.muted}
                    keyboardType="decimal-pad"
                    style={inputStyle}
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
                    style={inputStyle}
                  />
                </View>
              </View>
              {renderQuickTestButton(
                registerForm.ipAddress,
                !registerForm.ipAddress.trim(),
                () => runInlineTest(registerForm.ipAddress, registerForm.port, "quick-test"),
              )}
            </View>

            {/* Step 2: Label */}
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
                style={inputStyle}
              />
              <View style={{ marginTop: 8 }}>
                <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>Model (optional)</Text>
                <TextInput
                  value={registerForm.model}
                  onChangeText={(v) => setRegisterForm((f) => ({ ...f, model: v }))}
                  placeholder="e.g. S1F2"
                  placeholderTextColor={colors.muted}
                  style={inputStyle}
                />
              </View>
            </View>
          </>
        )}

        {/* Valor flow (TCP v1) */}
        {registerFormType === "valor" && (
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
                  <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>Terminal IP *</Text>
                  <TextInput
                    value={registerForm.ipAddress}
                    onChangeText={(v) => { setRegisterForm((f) => ({ ...f, ipAddress: v })); setQuickTestStatus("idle"); }}
                    placeholder="192.168.1.100"
                    placeholderTextColor={colors.muted}
                    keyboardType="decimal-pad"
                    style={inputStyle}
                  />
                </View>
                <View style={{ flex: 1.2 }}>
                  <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>Port</Text>
                  <TextInput
                    value={registerForm.port}
                    onChangeText={(v) => setRegisterForm((f) => ({ ...f, port: v }))}
                    placeholder="5000"
                    placeholderTextColor={colors.muted}
                    keyboardType="number-pad"
                    style={inputStyle}
                  />
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                <View style={{ flex: 1.2 }}>
                  <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>Cancel Port</Text>
                  <TextInput
                    value={registerForm.cancelPort}
                    onChangeText={(v) => setRegisterForm((f) => ({ ...f, cancelPort: v }))}
                    placeholder="5001"
                    placeholderTextColor={colors.muted}
                    keyboardType="number-pad"
                    style={inputStyle}
                  />
                </View>
                <View style={{ flex: 3 }}>
                  <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>EPI *</Text>
                  <TextInput
                    value={registerForm.epi}
                    onChangeText={(v) => setRegisterForm((f) => ({ ...f, epi: v }))}
                    placeholder="e.g. 2319900000"
                    placeholderTextColor={colors.muted}
                    keyboardType="number-pad"
                    style={inputStyle}
                  />
                </View>
              </View>
              {renderQuickTestButton(
                registerForm.ipAddress,
                !registerForm.ipAddress.trim(),
                () => runInlineTest(registerForm.ipAddress, registerForm.port, "quick-test", "valor"),
              )}
            </View>

            {/* Step 2: Label */}
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
                style={inputStyle}
              />
              <View style={{ marginTop: 8 }}>
                <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>Model (optional)</Text>
                <TextInput
                  value={registerForm.model}
                  onChangeText={(v) => setRegisterForm((f) => ({ ...f, model: v }))}
                  placeholder="e.g. VP500"
                  placeholderTextColor={colors.muted}
                  style={inputStyle}
                />
              </View>
            </View>
          </>
        )}

        {/* Dejavoo flow */}
        {registerFormType === "dejavoo" && (
          <>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>Terminal Name *</Text>
              <TextInput
                value={registerForm.name}
                onChangeText={(v) => setRegisterForm((f) => ({ ...f, name: v }))}
                placeholder="e.g. Front Counter"
                placeholderTextColor={colors.muted}
                style={inputStyle}
              />
            </View>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>Model (optional)</Text>
              <TextInput
                value={registerForm.model}
                onChangeText={(v) => setRegisterForm((f) => ({ ...f, model: v }))}
                placeholder="e.g. QD4"
                placeholderTextColor={colors.muted}
                style={inputStyle}
              />
            </View>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>TPN *</Text>
              <TextInput
                value={registerForm.tpn}
                onChangeText={(v) => setRegisterForm((f) => ({ ...f, tpn: v }))}
                placeholder="Terminal Point Number"
                placeholderTextColor={colors.muted}
                style={inputStyle}
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
                style={inputStyle}
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
          onPress={handleRegister}
          disabled={!isRegisterFormValid || isRegistering}
          style={{
            paddingVertical: 12, borderRadius: 10, alignItems: "center", flexDirection: "row", justifyContent: "center",
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
                {registerFormType === "dejavoo" ? "Register Terminal" : "Save & Connect"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  // ================================================================
  // 2. Terminal picker view
  // ================================================================

  if (showTerminalPicker) {
    return (
      <View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <Text style={{ color: colors.heading, fontWeight: "bold", fontSize: 14 }}>
            Available Terminals
          </Text>
          <TouchableOpacity onPress={() => setShowTerminalPicker(false)}>
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
            const isOtherStation = t.isActive && t.stationId && t.stationId !== selectedStation?.id;
            return (
              <TouchableOpacity
                key={t.id}
                onPress={() => !isCurrent && !isOtherStation && handleAssign(t)}
                disabled={isCurrent || isAssigning || !!isOtherStation}
                style={{
                  backgroundColor: isCurrent ? colors.teal + "10" : colors.screen,
                  paddingHorizontal: 12, paddingVertical: 12, borderRadius: 8, marginBottom: 8,
                  flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                  borderWidth: 1, borderColor: isCurrent ? colors.teal + "50" : colors.border,
                  opacity: isOtherStation ? 0.5 : 1,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                  <View style={{ width: 12, height: 12, borderRadius: 6, marginRight: 12, backgroundColor: t.isConnected ? colors.success : colors.muted }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.heading, fontWeight: "500" }}>{t.name}</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                      <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginRight: 8, backgroundColor: colors.teal + "30" }}>
                        <Text style={{ fontSize: 11, fontWeight: "500", color: colors.teal }}>
                          {t.terminalType === "castles" ? "Castles" : t.terminalType === "valor" ? "Valor" : "Dejavoo"}
                        </Text>
                      </View>
                      {t.model && <Text style={{ color: colors.muted, fontSize: 11 }}>{t.model}</Text>}
                    </View>
                  </View>
                </View>
                {isCurrent && (
                  <View style={{ backgroundColor: colors.teal + "20", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, borderWidth: 1, borderColor: colors.teal + "50" }}>
                    <Text style={{ fontSize: 11, color: colors.teal, fontWeight: "700" }}>Current</Text>
                  </View>
                )}
                {isOtherStation && (
                  <View style={{ backgroundColor: colors.border, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 }}>
                    <Text style={{ color: colors.label, fontSize: 11, fontWeight: "bold" }}>In Use</Text>
                  </View>
                )}
                {isAssigning && !isCurrent && (
                  <ActivityIndicator size="small" color={colors.label} />
                )}
              </TouchableOpacity>
            );
          })
        )}

        <TouchableOpacity
          onPress={() => { setShowTerminalPicker(false); setShowRegisterForm(true); }}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 8, paddingVertical: 8 }}
        >
          <Plus size={16} color={colors.teal} />
          <Text style={{ color: colors.teal, fontWeight: "500", marginLeft: 4 }}>Register New Terminal</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ================================================================
  // 3. Edit terminal form
  // ================================================================

  if (isEditingTerminal && currentTerminal) {
    return (
      <View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Pencil size={16} color={colors.teal} />
            <Text style={{ color: colors.heading, fontWeight: "bold", fontSize: 14 }}>Edit Terminal</Text>
            <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, backgroundColor: colors.teal + "30" }}>
              <Text style={{ fontSize: 11, fontWeight: "bold", color: colors.teal }}>
                {currentTerminal.terminal_type === "castles" ? "Castles" : currentTerminal.terminal_type === "valor" ? "Valor" : "Dejavoo"}
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
            style={inputStyle}
          />
        </View>
        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>Model (optional)</Text>
          <TextInput
            value={editForm.model}
            onChangeText={(v) => setEditForm((f) => ({ ...f, model: v }))}
            placeholder="e.g. QD4"
            placeholderTextColor={colors.muted}
            style={inputStyle}
          />
        </View>

        {/* Castles: IP + Port + inline test */}
        {currentTerminal.terminal_type === "castles" && (
          <>
            <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "600", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Connection
            </Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
              <View style={{ flex: 3 }}>
                <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>IP Address *</Text>
                <TextInput
                  value={editForm.ipAddress}
                  onChangeText={(v) => setEditForm((f) => ({ ...f, ipAddress: v }))}
                  placeholder="192.168.1.100"
                  placeholderTextColor={colors.muted}
                  keyboardType="decimal-pad"
                  style={inputStyle}
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
                  style={inputStyle}
                />
              </View>
            </View>
            {/* Inline test + diagnose row */}
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
              {renderQuickTestButton(
                editForm.ipAddress,
                !editForm.ipAddress.trim(),
                () => runInlineTest(editForm.ipAddress, editForm.port, currentTerminal.id),
                true,
              )}
              <TouchableOpacity
                onPress={onDiagnoseCastles}
                style={{
                  flexDirection: "row", alignItems: "center", justifyContent: "center",
                  paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8,
                  borderWidth: 1, borderColor: colors.teal + "50", backgroundColor: colors.teal + "20",
                }}
              >
                <RefreshCw size={14} color={colors.teal} />
                <Text style={{ color: colors.teal, fontSize: 13, marginLeft: 6, fontWeight: "500" }}>Diagnose</Text>
              </TouchableOpacity>
            </View>

            {/* USB info message */}
            {editForm.connectionType === "usb" && (
              <View style={{
                flexDirection: "row", alignItems: "center", gap: 8,
                paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8,
                backgroundColor: colors.teal + "10", borderWidth: 1, borderColor: colors.teal + "30", marginBottom: 16,
              }}>
                <Usb size={14} color={colors.teal} />
                <Text style={{ color: colors.label, fontSize: 11, flex: 1 }}>
                  USB connection — no IP configuration needed. Ensure the terminal is plugged in via USB.
                </Text>
              </View>
            )}
          </>
        )}

        {/* Valor: IP + Port + Cancel Port + EPI + inline test */}
        {currentTerminal.terminal_type === "valor" && (
          <>
            <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "600", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Connection
            </Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
              <View style={{ flex: 3 }}>
                <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>Terminal IP *</Text>
                <TextInput
                  value={editForm.ipAddress}
                  onChangeText={(v) => setEditForm((f) => ({ ...f, ipAddress: v }))}
                  placeholder="192.168.1.100"
                  placeholderTextColor={colors.muted}
                  keyboardType="decimal-pad"
                  style={inputStyle}
                />
              </View>
              <View style={{ flex: 1.2 }}>
                <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>Port</Text>
                <TextInput
                  value={editForm.port}
                  onChangeText={(v) => setEditForm((f) => ({ ...f, port: v }))}
                  placeholder="5000"
                  placeholderTextColor={colors.muted}
                  keyboardType="number-pad"
                  style={inputStyle}
                />
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
              <View style={{ flex: 1.2 }}>
                <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>Cancel Port</Text>
                <TextInput
                  value={editForm.cancelPort}
                  onChangeText={(v) => setEditForm((f) => ({ ...f, cancelPort: v }))}
                  placeholder="5001"
                  placeholderTextColor={colors.muted}
                  keyboardType="number-pad"
                  style={inputStyle}
                />
              </View>
              <View style={{ flex: 3 }}>
                <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>EPI *</Text>
                <TextInput
                  value={editForm.epi}
                  onChangeText={(v) => setEditForm((f) => ({ ...f, epi: v }))}
                  placeholder="e.g. 2319900000"
                  placeholderTextColor={colors.muted}
                  keyboardType="number-pad"
                  style={inputStyle}
                />
              </View>
            </View>
            <View style={{ marginBottom: 16 }}>
              {renderQuickTestButton(
                editForm.ipAddress,
                !editForm.ipAddress.trim(),
                () => runInlineTest(editForm.ipAddress, editForm.port, currentTerminal.id, "valor"),
                true,
              )}
            </View>
          </>
        )}

        {/* Dejavoo: TPN + AuthKey */}
        {currentTerminal.terminal_type !== "castles" && currentTerminal.terminal_type !== "valor" && (
          <>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>TPN *</Text>
              <TextInput
                value={editForm.tpn}
                onChangeText={(v) => setEditForm((f) => ({ ...f, tpn: v }))}
                placeholder="Terminal Point Number"
                placeholderTextColor={colors.muted}
                style={inputStyle}
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
                style={inputStyle}
              />
            </View>
          </>
        )}

        {/* Save button */}
        <TouchableOpacity
          onPress={handleSaveEditLocal}
          disabled={!isEditFormValid || isSavingEdit}
          style={{
            paddingVertical: 12, borderRadius: 10, alignItems: "center", flexDirection: "row", justifyContent: "center",
            backgroundColor: isEditFormValid && !isSavingEdit ? colors.teal + "20" : colors.screen,
            borderWidth: 1,
            borderColor: isEditFormValid && !isSavingEdit ? colors.teal + "50" : colors.border,
          }}
        >
          {isSavingEdit ? (
            <ActivityIndicator size="small" color={colors.teal} />
          ) : (
            <>
              <Check size={15} color={isEditFormValid ? colors.teal : colors.muted} />
              <Text style={{ fontSize: 13, color: isEditFormValid ? colors.teal : colors.muted, fontWeight: "700", marginLeft: 6 }}>
                Save Changes
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  // ================================================================
  // 4. Terminal info card (assigned)
  // ================================================================

  if (currentTerminal) {
    return (
      <View>
        {/* Main card */}
        <View style={{
          borderRadius: 12, borderWidth: 1, marginBottom: 12, overflow: "hidden",
          borderColor: currentTerminal.is_connected ? colors.success + "40" : colors.border,
        }}>
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
              flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
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
            onPress={onTestConnection}
            disabled={isTestingConnection}
            style={{
              flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center", flexDirection: "row", justifyContent: "center",
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
    );
  }

  // ================================================================
  // 5. Empty state (no terminal assigned)
  // ================================================================

  return (
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
              style={{ ...inputStyle, backgroundColor: colors.panel, fontFamily: "monospace" }}
            />
          </View>
          <View style={{ flex: 1.2 }}>
            <TextInput
              value={quickTestPort}
              onChangeText={(v) => setQuickTestPort(v)}
              placeholder="8080"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              style={{ ...inputStyle, backgroundColor: colors.panel }}
            />
          </View>
        </View>
        <TouchableOpacity
          onPress={handleQuickTest}
          disabled={!quickTestIp.trim() || quickTestStatus === "testing"}
          style={{
            flexDirection: "row", alignItems: "center", justifyContent: "center",
            paddingVertical: 10, borderRadius: 8, borderWidth: 1,
            backgroundColor:
              quickTestStatus === "online" ? colors.success + "15"
              : quickTestStatus === "offline" ? colors.danger + "15"
              : quickTestIp.trim() ? colors.teal + "15"
              : colors.panel,
            borderColor:
              quickTestStatus === "online" ? colors.success + "50"
              : quickTestStatus === "offline" ? colors.danger + "50"
              : quickTestIp.trim() ? colors.teal + "50"
              : colors.border,
            opacity: !quickTestIp.trim() && quickTestStatus !== "testing" ? 0.4 : 1,
          }}
        >
          {quickTestStatus === "testing" ? (
            <>
              <ActivityIndicator size="small" color={colors.teal} />
              <Text style={{ color: colors.teal, fontSize: 13, marginLeft: 8 }}>Testing...</Text>
            </>
          ) : quickTestStatus === "online" ? (
            <>
              <Check size={15} color={colors.success} />
              <Text style={{ color: colors.success, fontSize: 13, fontWeight: "600", marginLeft: 8 }}>Terminal reachable — ready to register</Text>
            </>
          ) : quickTestStatus === "offline" ? (
            <>
              <WifiOff size={15} color={colors.danger} />
              <Text style={{ color: colors.danger, fontSize: 13, marginLeft: 8 }}>No response — check IP address & network</Text>
            </>
          ) : (
            <>
              <Wifi size={15} color={colors.teal} />
              <Text style={{ color: colors.teal, fontSize: 13, marginLeft: 8 }}>Test Connection</Text>
            </>
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
  );
};

export default TerminalSection;
