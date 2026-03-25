import { colors } from "@/lib/theme";
import { useLocationConfigStore } from "@/stores/useLocationConfigStore";
import { AlertTriangle, Banknote, Bluetooth, Building2, CheckCircle2, ChevronDown, ChevronUp, DollarSign, Edit3, Percent, Plus, Receipt, ShieldCheck, SplitSquareHorizontal, Trash2, Wifi, X, XCircle } from "lucide-react-native";
import React, { useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";

interface ProcessorInfo {
  id: string;
  name: string;
  status: "connected" | "disconnected" | "pending";
  accountId: string;
  type: "builtin" | "wired" | "bluetooth";
}

interface SplitPaymentOptions {
  byAmount: boolean;
  byItem: boolean;
  evenly: boolean;
}

// Kept for type usage in renderToggleRow calls
type ModalType = "add" | "edit" | "delete" | null;

const PROCESSOR_TYPES = [
  { value: "builtin", label: "Built-in Processor" },
  { value: "wired", label: "Wired Card Reader" },
  { value: "bluetooth", label: "Bluetooth Device" },
];

const PaymentProcessingScreen = () => {
  const [processors, setProcessors] = useState<ProcessorInfo[]>([
    { id: "1", name: "Stripe", status: "connected", accountId: "acct_1234567890", type: "builtin" },
    { id: "2", name: "Square Terminal", status: "connected", accountId: "sq_term_abc123", type: "wired" },
    { id: "3", name: "Clover Flex", status: "disconnected", accountId: "clv_bt_xyz789", type: "bluetooth" },
  ]);

  const [modalType, setModalType] = useState<ModalType>(null);
  const [selectedProcessor, setSelectedProcessor] = useState<ProcessorInfo | null>(null);
  const [formData, setFormData] = useState({ name: "", type: "builtin" as ProcessorInfo["type"], accountId: "" });

  const paymentConfig = useLocationConfigStore((s) => s.config.payment);
  const cashDrawerConfig = useLocationConfigStore((s) => s.config.cashDrawer);
  const preAuthConfig = useLocationConfigStore((s) => s.config.preAuth);
  const tipsConfig = useLocationConfigStore((s) => s.config.tips);
  const updateConfig = useLocationConfigStore((s) => s.updateConfig);

  const cashEnabled = paymentConfig.cashEnabled;
  const startingCashAmount = String(cashDrawerConfig.defaultOpeningAmount);
  const preAuthSettings = { preAuthEnabled: preAuthConfig.enabled, defaultPreAuthAmount: preAuthConfig.defaultAmount };
  const updatePreAuthSettings = (updates: Partial<{ preAuthEnabled: boolean; defaultPreAuthAmount: number }>) => {
    updateConfig('preAuth', {
      ...(updates.preAuthEnabled !== undefined ? { enabled: updates.preAuthEnabled } : {}),
      ...(updates.defaultPreAuthAmount !== undefined ? { defaultAmount: updates.defaultPreAuthAmount } : {}),
    });
  };
  const openDrawerOnTip = tipsConfig.openDrawerOnTip;
  const setOpenDrawerOnTip = (value: boolean) => updateConfig('tips', { openDrawerOnTip: value });
  const splitPaymentOptions: SplitPaymentOptions = {
    byAmount: paymentConfig.splitByAmount,
    byItem: paymentConfig.splitByItem,
    evenly: paymentConfig.splitEvenly,
  };

  // Tip presets editing state
  const [editingTipPreset, setEditingTipPreset] = useState<string>("");
  const [expandedSections, setExpandedSections] = useState({ builtin: true, wired: true, bluetooth: true });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const openAddModal = (type: ProcessorInfo["type"]) => {
    setFormData({ name: "", type, accountId: "" });
    setSelectedProcessor(null);
    setModalType("add");
  };

  const openEditModal = (processor: ProcessorInfo) => {
    setSelectedProcessor(processor);
    setFormData({ name: processor.name, type: processor.type, accountId: processor.accountId });
    setModalType("edit");
  };

  const openDeleteModal = (processor: ProcessorInfo) => {
    setSelectedProcessor(processor);
    setModalType("delete");
  };

  const closeModal = () => {
    setModalType(null);
    setSelectedProcessor(null);
    setFormData({ name: "", type: "builtin", accountId: "" });
  };

  const handleAddProcessor = () => {
    if (!formData.name || !formData.accountId) return;
    const newProcessor: ProcessorInfo = {
      id: Date.now().toString(),
      name: formData.name,
      type: formData.type,
      accountId: formData.accountId,
      status: "pending",
    };
    setProcessors((prev) => [...prev, newProcessor]);
    closeModal();
  };

  const handleEditProcessor = () => {
    if (!selectedProcessor || !formData.name || !formData.accountId) return;
    setProcessors((prev) => prev.map((p) => p.id === selectedProcessor.id ? { ...p, name: formData.name, accountId: formData.accountId } : p));
    closeModal();
  };

  const handleDeleteProcessor = () => {
    if (!selectedProcessor) return;
    setProcessors((prev) => prev.filter((p) => p.id !== selectedProcessor.id));
    closeModal();
  };

  const toggleProcessorStatus = (id: string) => {
    setProcessors((prev) => prev.map((p) => p.id === id ? { ...p, status: p.status === "connected" ? "disconnected" : "connected" } : p));
  };

  const getStatusColor = (status: ProcessorInfo["status"]) => {
    switch (status) {
      case "connected": return colors.success;
      case "disconnected": return colors.danger;
      case "pending": return colors.warning;
    }
  };

  const getStatusIcon = (status: ProcessorInfo["status"]) => {
    switch (status) {
      case "connected": return <CheckCircle2 size={15} color={colors.success} />;
      case "disconnected": return <XCircle size={15} color={colors.danger} />;
      case "pending": return <CheckCircle2 size={15} color={colors.warning} />;
    }
  };

  const getProcessorIcon = (type: ProcessorInfo["type"]) => {
    switch (type) {
      case "builtin": return <Building2 size={16} color={colors.info} />;
      case "wired": return <Wifi size={16} color="#a78bfa" />;
      case "bluetooth": return <Bluetooth size={16} color={colors.teal} />;
    }
  };

  const renderProcessorCard = (processor: ProcessorInfo) => (
    <View key={processor.id} style={{ backgroundColor: colors.screen, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, marginBottom: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
          <View style={{ width: 32, height: 32, backgroundColor: colors.teal + "15", borderRadius: 8, alignItems: "center", justifyContent: "center", marginRight: 10 }}>
            {getProcessorIcon(processor.type)}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading }}>{processor.name}</Text>
            <Text style={{ fontSize: 11, color: colors.label, marginTop: 1 }}>{processor.accountId}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <TouchableOpacity
            onPress={() => toggleProcessorStatus(processor.id)}
            style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.card, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}
          >
            {getStatusIcon(processor.status)}
            <Text style={{ marginLeft: 6, fontSize: 12, color: getStatusColor(processor.status), textTransform: "capitalize" }}>{processor.status}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => openEditModal(processor)} style={{ padding: 7, backgroundColor: colors.card, borderRadius: 8 }}>
            <Edit3 size={15} color={colors.label} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => openDeleteModal(processor)} style={{ padding: 7, backgroundColor: colors.danger + "15", borderRadius: 8 }}>
            <Trash2 size={15} color={colors.danger} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const renderToggleRow = (label: string, description: string, value: boolean, onToggle: () => void, icon: React.ReactNode) => (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
        <View style={{ width: 32, height: 32, backgroundColor: colors.teal + "15", borderRadius: 8, alignItems: "center", justifyContent: "center", marginRight: 10 }}>
          {icon}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, color: colors.heading, fontWeight: "500" }}>{label}</Text>
          <Text style={{ fontSize: 11, color: colors.label, marginTop: 1 }}>{description}</Text>
        </View>
      </View>
      <Switch checked={value} onCheckedChange={onToggle} />
    </View>
  );

  const renderFormModal = () => {
    const isEdit = modalType === "edit";
    return (
      <Modal visible={modalType === "add" || modalType === "edit"} transparent animationType="fade" onRequestClose={closeModal} statusBarTranslucent>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 24 }}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ width: "100%", maxWidth: 500, alignSelf: "center" }}>
            <View style={{ backgroundColor: colors.panel, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
              <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 15, fontWeight: "700", color: colors.heading }}>{isEdit ? "Edit Processor" : "Add Processor"}</Text>
                <TouchableOpacity onPress={closeModal} style={{ padding: 6 }}>
                  <X size={18} color={colors.label} />
                </TouchableOpacity>
              </View>
              <View style={{ padding: 14, gap: 12 }}>
                {!isEdit && (
                  <View>
                    <Text style={{ fontSize: 12, color: colors.label, fontWeight: "500", marginBottom: 6 }}>Processor Type</Text>
                    <Select
                      value={{ value: formData.type, label: PROCESSOR_TYPES.find((t) => t.value === formData.type)?.label || "" }}
                      onValueChange={(option) => setFormData((prev) => ({ ...prev, type: (option?.value as ProcessorInfo["type"]) || "builtin", name: "" }))}
                    >
                      <SelectTrigger style={{ backgroundColor: colors.screen, borderColor: colors.border }}>
                        <SelectValue placeholder="Select type" className="text-white" />
                      </SelectTrigger>
                      <SelectContent style={{ backgroundColor: colors.screen, borderColor: colors.border }}>
                        {PROCESSOR_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value} label={type.label}>{type.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </View>
                )}
                <View>
                  <Text style={{ fontSize: 12, color: colors.label, fontWeight: "500", marginBottom: 6 }}>Processor Name</Text>
                  <TextInput
                    value={formData.name}
                    onChangeText={(text) => setFormData((prev) => ({ ...prev, name: text }))}
                    placeholder="Enter processor name"
                    placeholderTextColor={colors.muted}
                    style={{ backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, color: colors.heading, fontSize: 13 }}
                  />
                </View>
                <View>
                  <Text style={{ fontSize: 12, color: colors.label, fontWeight: "500", marginBottom: 6 }}>Account ID / Device ID</Text>
                  <TextInput
                    value={formData.accountId}
                    onChangeText={(text) => setFormData((prev) => ({ ...prev, accountId: text }))}
                    placeholder="Enter account or device ID"
                    placeholderTextColor={colors.muted}
                    style={{ backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, color: colors.heading, fontSize: 13 }}
                  />
                  <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>Your merchant account ID or device serial number</Text>
                </View>
              </View>
              <View style={{ padding: 14, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: "row", gap: 10 }}>
                <TouchableOpacity
                  onPress={closeModal}
                  style={{ flex: 1, paddingVertical: 11, backgroundColor: colors.screen, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}
                >
                  <Text style={{ fontSize: 13, color: colors.label, fontWeight: "500", textAlign: "center" }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={isEdit ? handleEditProcessor : handleAddProcessor}
                  disabled={!formData.name || !formData.accountId}
                  style={{
                    flex: 1,
                    paddingVertical: 11,
                    borderRadius: 8,
                    backgroundColor: formData.name && formData.accountId ? colors.teal + "20" : colors.screen,
                    borderWidth: 1,
                    borderColor: formData.name && formData.accountId ? colors.teal + "50" : colors.border,
                  }}
                >
                  <Text style={{ fontSize: 13, color: formData.name && formData.accountId ? colors.teal : colors.muted, fontWeight: "600", textAlign: "center" }}>
                    {isEdit ? "Save Changes" : "Add Processor"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    );
  };

  const renderDeleteModal = () => (
    <Modal visible={modalType === "delete"} transparent animationType="fade" onRequestClose={closeModal} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 24 }}>
        <View style={{ width: "100%", maxWidth: 450, backgroundColor: colors.panel, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: "hidden", alignSelf: "center" }}>
          <View style={{ padding: 24, alignItems: "center" }}>
            <View style={{ width: 56, height: 56, backgroundColor: colors.danger + "15", borderRadius: 28, alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
              <AlertTriangle size={28} color={colors.danger} />
            </View>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.heading, textAlign: "center", marginBottom: 8 }}>Remove Processor?</Text>
            <Text style={{ fontSize: 12, color: colors.label, textAlign: "center" }}>Are you sure you want to remove "{selectedProcessor?.name}"? This cannot be undone.</Text>
          </View>
          <View style={{ padding: 14, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              onPress={closeModal}
              style={{ flex: 1, paddingVertical: 11, backgroundColor: colors.screen, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}
            >
              <Text style={{ fontSize: 13, color: colors.label, fontWeight: "500", textAlign: "center" }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleDeleteProcessor}
              style={{ flex: 1, paddingVertical: 11, borderRadius: 8, backgroundColor: colors.danger + "15", borderWidth: 1, borderColor: colors.danger + "30" }}
            >
              <Text style={{ fontSize: 13, color: colors.danger, fontWeight: "600", textAlign: "center" }}>Remove</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen, padding: 20 }}>
      {renderFormModal()}
      {renderDeleteModal()}
      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontSize: 15, fontWeight: "700", color: colors.heading }}>Payment Processing</Text>
        <Text style={{ fontSize: 12, color: colors.label, marginTop: 2 }}>Manage payment gateways and processing settings.</Text>
      </View>
      <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 16 }} />
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Payment Methods */}
        <View style={{ backgroundColor: colors.panel, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
            <View style={{ width: 32, height: 32, backgroundColor: colors.success + "15", borderRadius: 8, alignItems: "center", justifyContent: "center", marginRight: 10 }}>
              <Banknote size={16} color={colors.success} />
            </View>
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.heading }}>Payment Methods</Text>
          </View>
          <Text style={{ fontSize: 12, color: colors.label, marginBottom: 12 }}>Enable or disable accepted payment methods for your business.</Text>
          {renderToggleRow("Cash", "Accept cash payments", cashEnabled, () => updateConfig('payment', { cashEnabled: !cashEnabled }), <Banknote size={16} color={colors.success} />)}
        </View>

        {/* Tips */}
        <View style={{ backgroundColor: colors.panel, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
            <View style={{ width: 32, height: 32, backgroundColor: colors.warning + "15", borderRadius: 8, alignItems: "center", justifyContent: "center", marginRight: 10 }}>
              <Receipt size={16} color={colors.warning} />
            </View>
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.heading }}>Tips</Text>
          </View>
          <Text style={{ fontSize: 12, color: colors.label, marginBottom: 12 }}>Configure tip-related behavior at checkout.</Text>
          {renderToggleRow(
            "Open Cash Drawer on Tip",
            "Automatically open the cash drawer when a tip is applied",
            openDrawerOnTip,
            () => setOpenDrawerOnTip(!openDrawerOnTip),
            <Banknote size={16} color={colors.success} />
          )}
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 4 }} />
          <Text style={{ fontSize: 12, color: colors.label, fontWeight: "500", marginBottom: 8 }}>Tip Preset Percentages</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            {tipsConfig.presetPercentages.map((pct, idx) => (
              <View key={idx} style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.screen, borderRadius: 8, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 6, gap: 6 }}>
                <Percent size={12} color={colors.teal} />
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading }}>{pct}%</Text>
                <TouchableOpacity
                  onPress={() => {
                    const updated = tipsConfig.presetPercentages.filter((_, i) => i !== idx);
                    updateConfig('tips', { presetPercentages: updated });
                  }}
                  style={{ padding: 2 }}
                >
                  <X size={12} color={colors.danger} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.screen, borderRadius: 8, borderWidth: 1, borderColor: colors.border, flex: 1 }}>
              <View style={{ paddingHorizontal: 10, paddingVertical: 8, borderRightWidth: 1, borderRightColor: colors.border }}>
                <Percent size={14} color={colors.label} />
              </View>
              <TextInput
                value={editingTipPreset}
                onChangeText={setEditingTipPreset}
                keyboardType="numeric"
                placeholder="e.g. 15"
                placeholderTextColor={colors.muted}
                style={{ flex: 1, paddingHorizontal: 10, paddingVertical: 8, color: colors.heading, fontSize: 13 }}
              />
            </View>
            <TouchableOpacity
              onPress={() => {
                const num = parseInt(editingTipPreset, 10);
                if (!isNaN(num) && num > 0 && num <= 100 && !tipsConfig.presetPercentages.includes(num)) {
                  updateConfig('tips', { presetPercentages: [...tipsConfig.presetPercentages, num].sort((a, b) => a - b) });
                  setEditingTipPreset("");
                }
              }}
              style={{ backgroundColor: colors.teal + "20", borderWidth: 1, borderColor: colors.teal + "50", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 }}
            >
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.teal }}>Add</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>These percentages appear as quick-select options at checkout.</Text>
        </View>

        {/* Cash Drawer */}
        <View style={{ backgroundColor: colors.panel, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
            <View style={{ width: 32, height: 32, backgroundColor: colors.warning + "15", borderRadius: 8, alignItems: "center", justifyContent: "center", marginRight: 10 }}>
              <DollarSign size={16} color={colors.warning} />
            </View>
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.heading }}>Cash Drawer</Text>
          </View>
          <Text style={{ fontSize: 12, color: colors.label, marginBottom: 12 }}>Set the starting cash amount for your drawer at the beginning of each shift.</Text>
          <View style={{ backgroundColor: colors.screen, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 12, color: colors.label, fontWeight: "500", marginBottom: 8 }}>Starting Cash Amount</Text>
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
              <View style={{ paddingHorizontal: 14, paddingVertical: 10, borderRightWidth: 1, borderRightColor: colors.border }}>
                <Text style={{ fontSize: 15, fontWeight: "700", color: colors.heading }}>$</Text>
              </View>
              <TextInput
                value={startingCashAmount}
                onChangeText={(text) => { const num = parseFloat(text); if (!isNaN(num)) updateConfig('cashDrawer', { defaultOpeningAmount: num }); }}
                keyboardType="decimal-pad"
                style={{ flex: 1, paddingHorizontal: 14, paddingVertical: 10, color: colors.heading, fontSize: 15 }}
                placeholderTextColor={colors.muted}
                placeholder="0.00"
              />
            </View>
            <Text style={{ fontSize: 11, color: colors.muted, marginTop: 6 }}>This amount will be used as the default starting balance for new shifts.</Text>
          </View>
        </View>

        {/* Pre-Authorization */}
        <View style={{ backgroundColor: colors.panel, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
            <View style={{ width: 32, height: 32, backgroundColor: "#a78bfa15", borderRadius: 8, alignItems: "center", justifyContent: "center", marginRight: 10 }}>
              <ShieldCheck size={16} color="#a78bfa" />
            </View>
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.heading }}>Pre-Authorization</Text>
          </View>
          <Text style={{ fontSize: 12, color: colors.label, marginBottom: 12 }}>Configure card pre-authorization for tabs and open orders.</Text>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, color: colors.heading, fontWeight: "500" }}>Enable Pre-Authorization</Text>
              <Text style={{ fontSize: 11, color: colors.label, marginTop: 1 }}>Hold funds on customer cards for open tabs</Text>
            </View>
            <Switch checked={preAuthSettings.preAuthEnabled} onCheckedChange={(checked) => updatePreAuthSettings({ preAuthEnabled: checked })} />
          </View>
          {preAuthSettings.preAuthEnabled && (
            <View style={{ paddingVertical: 12 }}>
              <Text style={{ fontSize: 12, color: colors.label, fontWeight: "500", marginBottom: 8 }}>Default Pre-Auth Amount</Text>
              <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.screen, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
                <View style={{ paddingHorizontal: 14, paddingVertical: 10, borderRightWidth: 1, borderRightColor: colors.border }}>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: colors.heading }}>$</Text>
                </View>
                <TextInput
                  value={String(preAuthSettings.defaultPreAuthAmount)}
                  onChangeText={(text) => { const num = parseFloat(text); if (!isNaN(num)) updatePreAuthSettings({ defaultPreAuthAmount: num }); }}
                  keyboardType="decimal-pad"
                  style={{ flex: 1, paddingHorizontal: 14, paddingVertical: 10, color: colors.heading, fontSize: 15 }}
                  placeholderTextColor={colors.muted}
                  placeholder="0.00"
                />
              </View>
              <Text style={{ fontSize: 11, color: colors.muted, marginTop: 6 }}>Default amount to hold when opening a tab. Uses the station's configured terminal.</Text>
            </View>
          )}
        </View>

        {/* Split Payment Options */}
        <View style={{ backgroundColor: colors.panel, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
            <View style={{ width: 32, height: 32, backgroundColor: "#f472b615", borderRadius: 8, alignItems: "center", justifyContent: "center", marginRight: 10 }}>
              <SplitSquareHorizontal size={16} color="#f472b6" />
            </View>
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.heading }}>Split Payment Options</Text>
          </View>
          <Text style={{ fontSize: 12, color: colors.label, marginBottom: 12 }}>Configure how customers can split their payments.</Text>
          {renderToggleRow("Split by Amount", "Allow customers to specify exact amounts per payment", splitPaymentOptions.byAmount, () => updateConfig('payment', { splitByAmount: !splitPaymentOptions.byAmount }), <DollarSign size={16} color={colors.success} />)}
          {renderToggleRow("Split by Item", "Allow customers to assign items to different payments", splitPaymentOptions.byItem, () => updateConfig('payment', { splitByItem: !splitPaymentOptions.byItem }), <SplitSquareHorizontal size={16} color={colors.info} />)}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
              <View style={{ width: 32, height: 32, backgroundColor: "#a78bfa15", borderRadius: 8, alignItems: "center", justifyContent: "center", marginRight: 10 }}>
                <SplitSquareHorizontal size={16} color="#a78bfa" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, color: colors.heading, fontWeight: "500" }}>Split Evenly</Text>
                <Text style={{ fontSize: 11, color: colors.label, marginTop: 1 }}>Divide total equally among multiple payments</Text>
              </View>
            </View>
            <Switch checked={splitPaymentOptions.evenly} onCheckedChange={() => updateConfig('payment', { splitEvenly: !splitPaymentOptions.evenly })} />
          </View>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
};

export default PaymentProcessingScreen;
