import { colors } from "@/lib/theme";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { AlertTriangle, Banknote, Bluetooth, Building2, CheckCircle2, ChevronDown, ChevronUp, DollarSign, Edit3, Plus, Receipt, ShieldCheck, SplitSquareHorizontal, Trash2, Wifi, X, XCircle } from "lucide-react-native";
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

  const [cashEnabled, setCashEnabled] = useState(true);
  const [startingCashAmount, setStartingCashAmount] = useState("200.00");
  const preAuthSettings = useStoreSettingsStore((s) => s.preAuthSettings);
  const updatePreAuthSettings = useStoreSettingsStore((s) => s.updatePreAuthSettings);
  const openDrawerOnTip = useStoreSettingsStore((s) => s.openDrawerOnTip);
  const setOpenDrawerOnTip = useStoreSettingsStore((s) => s.setOpenDrawerOnTip);
  const [splitPaymentOptions, setSplitPaymentOptions] = useState<SplitPaymentOptions>({ byAmount: true, byItem: true, evenly: true });
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
      case "connected": return "text-green-400";
      case "disconnected": return "text-red-400";
      case "pending": return "text-yellow-400";
    }
  };

  const getStatusIcon = (status: ProcessorInfo["status"]) => {
    switch (status) {
      case "connected": return <CheckCircle2 size={16} color={colors.success} />;
      case "disconnected": return <XCircle size={16} color={colors.danger} />;
      case "pending": return <CheckCircle2 size={16} color={colors.warning} />;
    }
  };

  const getProcessorIcon = (type: ProcessorInfo["type"]) => {
    switch (type) {
      case "builtin": return <Building2 size={20} color={colors.info} />;
      case "wired": return <Wifi size={20} color="#a78bfa" />;
      case "bluetooth": return <Bluetooth size={20} color={colors.teal} />;
    }
  };

  const renderProcessorCard = (processor: ProcessorInfo) => (
    <View key={processor.id} className="bg-surface p-4 rounded-xl border border-gray-600 mb-3">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center flex-1">
          <View className="w-10 h-10 bg-card rounded-lg items-center justify-center mr-3">{getProcessorIcon(processor.type)}</View>
          <View className="flex-1">
            <Text className="text-white font-semibold text-base">{processor.name}</Text>
            <Text className="text-gray-400 text-sm">{processor.accountId}</Text>
          </View>
        </View>
        <View className="flex-row items-center gap-2">
          <TouchableOpacity onPress={() => toggleProcessorStatus(processor.id)} className="flex-row items-center bg-card px-3 py-2 rounded-lg">
            {getStatusIcon(processor.status)}
            <Text className={`ml-2 text-sm capitalize ${getStatusColor(processor.status)}`}>{processor.status}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => openEditModal(processor)} className="p-2 bg-card rounded-lg">
            <Edit3 size={18} color={colors.label} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => openDeleteModal(processor)} className="p-2 bg-red-500/20 rounded-lg">
            <Trash2 size={18} color={colors.danger} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const renderProcessorSection = (title: string, description: string, type: ProcessorInfo["type"], sectionKey: keyof typeof expandedSections, icon: React.ReactNode) => {
    const sectionProcessors = processors.filter((p) => p.type === type);
    const isExpanded = expandedSections[sectionKey];
    return (
      <View className="mb-4">
        <TouchableOpacity onPress={() => toggleSection(sectionKey)} className="bg-surface p-4 rounded-xl border border-gray-600 flex-row items-center justify-between">
          <View className="flex-row items-center flex-1">
            <View className="w-10 h-10 bg-card rounded-lg items-center justify-center mr-3">{icon}</View>
            <View className="flex-1">
              <Text className="text-white font-bold text-lg">{title}</Text>
              <Text className="text-gray-400 text-sm">{description}</Text>
            </View>
          </View>
          <View className="flex-row items-center">
            <TouchableOpacity onPress={() => openAddModal(type)} className="p-2 bg-blue-600 rounded-lg mr-2">
              <Plus size={18} color="white" />
            </TouchableOpacity>
            <View className="bg-blue-500/20 px-2 py-1 rounded-full mr-3">
              <Text className="text-blue-400 text-sm font-medium">{sectionProcessors.length}</Text>
            </View>
            {isExpanded ? <ChevronUp size={20} color={colors.label} /> : <ChevronDown size={20} color={colors.label} />}
          </View>
        </TouchableOpacity>
        {isExpanded && sectionProcessors.length > 0 && <View className="mt-3 ml-4">{sectionProcessors.map(renderProcessorCard)}</View>}
        {isExpanded && sectionProcessors.length === 0 && (
          <View className="mt-3 ml-4 bg-surface p-4 rounded-xl border border-gray-600">
            <Text className="text-gray-400 text-center">No devices connected</Text>
            <TouchableOpacity onPress={() => openAddModal(type)} className="mt-3 bg-blue-600 py-2 px-4 rounded-lg self-center">
              <Text className="text-white font-medium">Add Device</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const renderToggleRow = (label: string, description: string, value: boolean, onToggle: () => void, icon: React.ReactNode) => (
    <View className="flex-row items-center justify-between py-3 border-b border-gray-700">
      <View className="flex-row items-center flex-1">
        <View className="w-8 h-8 bg-card rounded-lg items-center justify-center mr-3">{icon}</View>
        <View className="flex-1">
          <Text className="text-white font-medium">{label}</Text>
          <Text className="text-gray-400 text-sm">{description}</Text>
        </View>
      </View>
      <Switch checked={value} onCheckedChange={onToggle} />
    </View>
  );

  const renderFormModal = () => {
    const isEdit = modalType === "edit";
    return (
      <Modal visible={modalType === "add" || modalType === "edit"} transparent animationType="fade" onRequestClose={closeModal} statusBarTranslucent>
        <View className="flex-1 justify-center items-center bg-black/60 px-6">
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="w-full max-w-[500px]" style={{ alignSelf: 'center' }}>
            <View className="bg-panel rounded-2xl border border-gray-700 overflow-hidden">
              <View className="p-4 border-b border-gray-700 flex-row items-center justify-between">
                <Text className="text-xl font-bold text-white">{isEdit ? "Edit Processor" : "Add Processor"}</Text>
                <TouchableOpacity onPress={closeModal} className="p-2"><X size={24} color={colors.label} /></TouchableOpacity>
              </View>
              <View className="p-4 gap-y-4">
                {!isEdit && (
                  <View>
                    <Text className="text-gray-300 font-medium mb-2">Processor Type</Text>
                    <Select value={{ value: formData.type, label: PROCESSOR_TYPES.find((t) => t.value === formData.type)?.label || "" }} onValueChange={(option) => setFormData((prev) => ({ ...prev, type: (option?.value as ProcessorInfo["type"]) || "builtin", name: "" }))}>
                      <SelectTrigger className="bg-surface border-gray-600"><SelectValue placeholder="Select type" className="text-white" /></SelectTrigger>
                      <SelectContent className="bg-surface border-gray-600">
                        {PROCESSOR_TYPES.map((type) => (<SelectItem key={type.value} value={type.value} label={type.label}>{type.label}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </View>
                )}
                <View>
                  <Text className="text-gray-300 font-medium mb-2">Processor Name</Text>
                  <TextInput value={formData.name} onChangeText={(text) => setFormData((prev) => ({ ...prev, name: text }))} placeholder="Enter processor name" placeholderTextColor={colors.muted} className="bg-surface border border-gray-600 rounded-lg p-3 text-white" />
                </View>
                <View>
                  <Text className="text-gray-300 font-medium mb-2">Account ID / Device ID</Text>
                  <TextInput value={formData.accountId} onChangeText={(text) => setFormData((prev) => ({ ...prev, accountId: text }))} placeholder="Enter account or device ID" placeholderTextColor={colors.muted} className="bg-surface border border-gray-600 rounded-lg p-3 text-white" />
                  <Text className="text-gray-500 text-sm mt-1">Your merchant account ID or device serial number</Text>
                </View>
              </View>
              <View className="p-4 border-t border-gray-700 flex-row gap-3">
                <TouchableOpacity onPress={closeModal} className="flex-1 py-3 bg-surface rounded-lg"><Text className="text-white font-medium text-center">Cancel</Text></TouchableOpacity>
                <TouchableOpacity onPress={isEdit ? handleEditProcessor : handleAddProcessor} disabled={!formData.name || !formData.accountId} className={`flex-1 py-3 rounded-lg ${formData.name && formData.accountId ? "bg-blue-600" : "bg-blue-600/50"}`}>
                  <Text className="text-white font-medium text-center">{isEdit ? "Save Changes" : "Add Processor"}</Text>
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
      <View className="flex-1 justify-center items-center bg-black/60 px-6">
        <View className="w-full max-w-[450px] bg-panel rounded-2xl border border-gray-700 overflow-hidden" style={{ alignSelf: 'center' }}>
          <View className="p-6 items-center">
            <View className="w-16 h-16 bg-red-500/20 rounded-full items-center justify-center mb-4"><AlertTriangle size={32} color={colors.danger} /></View>
            <Text className="text-xl font-bold text-white text-center mb-2">Remove Processor?</Text>
            <Text className="text-gray-400 text-center">Are you sure you want to remove "{selectedProcessor?.name}"? This cannot be undone.</Text>
          </View>
          <View className="p-4 border-t border-gray-700 flex-row gap-3">
            <TouchableOpacity onPress={closeModal} className="flex-1 py-3 bg-surface rounded-lg"><Text className="text-white font-medium text-center">Cancel</Text></TouchableOpacity>
            <TouchableOpacity onPress={handleDeleteProcessor} className="flex-1 py-3 bg-red-600 rounded-lg"><Text className="text-white font-medium text-center">Remove</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  return (
    <View className="flex-1 bg-screen p-6">
      {renderFormModal()}
      {renderDeleteModal()}
      <View className="mb-6">
        <Text className="text-3xl font-bold text-white">Payment Processing</Text>
        <Text className="text-gray-400 mt-2">Manage payment gateways and processing settings.</Text>
      </View>
      <View className="h-[1px] w-full bg-gray-700 mb-6" />
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Payment Methods */}
        <View className="bg-panel p-5 rounded-2xl border border-gray-700 mb-6">
          <View className="flex-row items-center mb-4">
            <Banknote size={24} color={colors.success} />
            <Text className="text-xl font-bold text-white ml-3">Payment Methods</Text>
          </View>
          <Text className="text-gray-400 mb-4">Enable or disable accepted payment methods for your business.</Text>
          {renderToggleRow("Cash", "Accept cash payments", cashEnabled, () => setCashEnabled((prev) => !prev), <Banknote size={16} color={colors.success} />)}
        </View>

        {/* Tips */}
        <View className="bg-panel p-5 rounded-2xl border border-gray-700 mb-6">
          <View className="flex-row items-center mb-4">
            <Receipt size={24} color={colors.warning} />
            <Text className="text-xl font-bold text-white ml-3">Tips</Text>
          </View>
          <Text className="text-gray-400 mb-4">Configure tip-related behavior at checkout.</Text>
          {renderToggleRow(
            "Open Cash Drawer on Tip",
            "Automatically open the cash drawer when a tip is applied",
            openDrawerOnTip,
            () => setOpenDrawerOnTip(!openDrawerOnTip),
            <Banknote size={16} color={colors.success} />
          )}
        </View>

        {/* Cash Drawer */}
        <View className="bg-panel p-5 rounded-2xl border border-gray-700 mb-6">
          <View className="flex-row items-center mb-4">
            <DollarSign size={24} color={colors.warning} />
            <Text className="text-xl font-bold text-white ml-3">Cash Drawer</Text>
          </View>
          <Text className="text-gray-400 mb-4">Set the starting cash amount for your drawer at the beginning of each shift.</Text>
          <View className="bg-surface p-4 rounded-xl border border-gray-600">
            <Text className="text-gray-300 font-medium mb-2">Starting Cash Amount</Text>
            <View className="flex-row items-center bg-card rounded-lg border border-gray-500">
              <View className="px-4 py-3 border-r border-gray-500"><Text className="text-white font-bold text-lg">$</Text></View>
              <TextInput value={startingCashAmount} onChangeText={setStartingCashAmount} keyboardType="decimal-pad" className="flex-1 px-4 py-3 text-white text-lg" placeholderTextColor={colors.muted} placeholder="0.00" />
            </View>
            <Text className="text-gray-500 text-sm mt-2">This amount will be used as the default starting balance for new shifts.</Text>
          </View>
        </View>

        {/* Pre-Authorization */}
        <View className="bg-panel p-5 rounded-2xl border border-gray-700 mb-6">
          <View className="flex-row items-center mb-4">
            <ShieldCheck size={24} color="#a78bfa" />
            <Text className="text-xl font-bold text-white ml-3">Pre-Authorization</Text>
          </View>
          <Text className="text-gray-400 mb-4">Configure card pre-authorization for tabs and open orders.</Text>
          <View className="flex-row items-center justify-between py-3 border-b border-gray-700">
            <View className="flex-1">
              <Text className="text-white font-medium">Enable Pre-Authorization</Text>
              <Text className="text-gray-400 text-sm">Hold funds on customer cards for open tabs</Text>
            </View>
            <Switch checked={preAuthSettings.preAuthEnabled} onCheckedChange={(checked) => updatePreAuthSettings({ preAuthEnabled: checked })} />
          </View>
          {preAuthSettings.preAuthEnabled && (
            <View className="py-4">
              <Text className="text-gray-300 font-medium mb-2">Default Pre-Auth Amount</Text>
              <View className="flex-row items-center bg-surface rounded-lg border border-gray-600">
                <View className="px-4 py-3 border-r border-gray-600"><Text className="text-white font-bold text-lg">$</Text></View>
                <TextInput value={String(preAuthSettings.defaultPreAuthAmount)} onChangeText={(text) => { const num = parseFloat(text); if (!isNaN(num)) updatePreAuthSettings({ defaultPreAuthAmount: num }); }} keyboardType="decimal-pad" className="flex-1 px-4 py-3 text-white text-lg" placeholderTextColor={colors.muted} placeholder="0.00" />
              </View>
              <Text className="text-gray-500 text-sm mt-2">Default amount to hold when opening a tab. Uses the station's configured terminal.</Text>
            </View>
          )}
        </View>

        {/* Split Payment Options */}
        <View className="bg-panel p-5 rounded-2xl border border-gray-700 mb-6">
          <View className="flex-row items-center mb-4">
            <SplitSquareHorizontal size={24} color="#f472b6" />
            <Text className="text-xl font-bold text-white ml-3">Split Payment Options</Text>
          </View>
          <Text className="text-gray-400 mb-4">Configure how customers can split their payments.</Text>
          {renderToggleRow("Split by Amount", "Allow customers to specify exact amounts per payment", splitPaymentOptions.byAmount, () => setSplitPaymentOptions((prev) => ({ ...prev, byAmount: !prev.byAmount })), <DollarSign size={16} color={colors.success} />)}
          {renderToggleRow("Split by Item", "Allow customers to assign items to different payments", splitPaymentOptions.byItem, () => setSplitPaymentOptions((prev) => ({ ...prev, byItem: !prev.byItem })), <SplitSquareHorizontal size={16} color={colors.info} />)}
          <View className="flex-row items-center justify-between py-3">
            <View className="flex-row items-center flex-1">
              <View className="w-8 h-8 bg-card rounded-lg items-center justify-center mr-3"><SplitSquareHorizontal size={16} color="#a78bfa" /></View>
              <View className="flex-1">
                <Text className="text-white font-medium">Split Evenly</Text>
                <Text className="text-gray-400 text-sm">Divide total equally among multiple payments</Text>
              </View>
            </View>
            <Switch checked={splitPaymentOptions.evenly} onCheckedChange={() => setSplitPaymentOptions((prev) => ({ ...prev, evenly: !prev.evenly }))} />
          </View>
        </View>
        <View className="h-6" />
      </ScrollView>
    </View>
  );
};

export default PaymentProcessingScreen;
