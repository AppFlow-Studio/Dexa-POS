import {
  AlertTriangle,
  ArrowRight,
  Bluetooth,
  CheckCircle2,
  ChefHat,
  ChevronDown,
  ChevronUp,
  Edit3,
  FileText,
  Minus,
  Monitor,
  Plus,
  Printer,
  Receipt,
  Settings2,
  Trash2,
  Wifi,
  X,
  XCircle
} from "lucide-react-native";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";

// Types
interface PrinterDevice {
  id: string;
  name: string;
  type: "receipt" | "kitchen" | "label";
  connectionType: "wifi" | "bluetooth" | "usb";
  status: "online" | "offline" | "paper_low";
  ipAddress?: string;
  isEnabled: boolean;
}

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

type ModalType = "add" | "edit" | "delete" | null;

const PrintersKitchenScreen = () => {
  // KDS settings from store
  const kdsAutoFireEnabled = useStoreSettingsStore((s) => s.kdsAutoFireEnabled);
  const kdsAutoFireDelayMinutes = useStoreSettingsStore((s) => s.kdsAutoFireDelayMinutes);
  const updateField = useStoreSettingsStore((s) => s.updateField);

  // Printers state
  const [printers, setPrinters] = useState<PrinterDevice[]>([
    { id: "1", name: "Front Receipt Printer", type: "receipt", connectionType: "wifi", status: "online", ipAddress: "192.168.1.101", isEnabled: true },
    { id: "2", name: "Kitchen Printer - Hot Line", type: "kitchen", connectionType: "wifi", status: "online", ipAddress: "192.168.1.102", isEnabled: true },
    { id: "3", name: "Kitchen Printer - Cold Line", type: "kitchen", connectionType: "wifi", status: "paper_low", ipAddress: "192.168.1.103", isEnabled: true },
    { id: "4", name: "Bar Printer", type: "kitchen", connectionType: "bluetooth", status: "offline", isEnabled: false },
    { id: "5", name: "Label Printer", type: "label", connectionType: "usb", status: "online", isEnabled: true },
  ]);

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
  const [printerRoutes, setPrinterRoutes] = useState<PrinterRoute[]>([
    { id: "1", category: "Main Course", printerId: "2", isEnabled: true },
    { id: "2", category: "Appetizers", printerId: "3", isEnabled: true },
    { id: "3", category: "Sides", printerId: "2", isEnabled: true },
    { id: "4", category: "Drinks", printerId: "4", isEnabled: false },
    { id: "5", category: "Desserts", printerId: "3", isEnabled: true },
  ]);

  // Categories from the app
  const categories = ["Main Course", "Appetizers", "Sides", "Drinks", "Desserts", "Specials"];

  // Expanded sections state
  const [expandedSections, setExpandedSections] = useState({
    printers: true,
    receipt: true,
    kitchen: true,
    routing: true,
  });

  // Modal State
  const [modalType, setModalType] = useState<ModalType>(null);
  const [selectedPrinter, setSelectedPrinter] = useState<PrinterDevice | null>(null);
  const [printerFormData, setPrinterFormData] = useState<Partial<PrinterDevice>>({
    name: "",
    type: "receipt",
    connectionType: "wifi",
    ipAddress: "",
    isEnabled: true,
    status: "online"
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

  const getStatusColor = (status: PrinterDevice["status"]) => {
    switch (status) {
      case "online": return "text-green-400";
      case "offline": return "text-gray-500";
      case "paper_low": return "text-yellow-400";
      default: return "text-gray-400";
    }
  };

  const getStatusLabel = (status: PrinterDevice["status"]) => {
    switch (status) {
      case "online": return "Online";
      case "offline": return "Offline";
      case "paper_low": return "Paper Low";
      default: return status;
    }
  };

  const getStatusIcon = (status: PrinterDevice["status"]) => {
    switch (status) {
      case "online": return <CheckCircle2 size={14} color="#4ade80" />;
      case "offline": return <XCircle size={14} color="#6b7280" />;
      case "paper_low": return <AlertTriangle size={14} color="#facc15" />;
      default: return null;
    }
  };

  const togglePrinter = (id: string) => {
    setPrinters((prev) => prev.map((p) => (p.id === id ? { ...p, isEnabled: !p.isEnabled } : p)));
  };

  const deletePrinter = (id: string) => {
    setPrinters((prev) => prev.filter((p) => p.id !== id));
  };

  const toggleRoute = (id: string) => {
    setPrinterRoutes((prev) => prev.map((r) => (r.id === id ? { ...r, isEnabled: !r.isEnabled } : r)));
  };

  const updateRoutePrinter = (routeId: string, printerId: string) => {
    setPrinterRoutes((prev) => prev.map((r) => (r.id === routeId ? { ...r, printerId } : r)));
  };

  const kitchenPrinters = printers.filter((p) => p.type === "kitchen");
  const availableCategories = categories.filter(c => !printerRoutes.map(r => r.category).includes(c));

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
    setPrinterRoutes(prev => [...prev, newRoute]);
    closeRouteModal();
  };

  // Printer Modal Helpers
  const openAddModal = () => {
    setSelectedPrinter(null);
    setPrinterFormData({ name: "", type: "receipt", connectionType: "wifi", ipAddress: "", isEnabled: true, status: "online" });
    setModalType("add");
  };

  const openEditModal = (printer: PrinterDevice) => {
    setSelectedPrinter(printer);
    setPrinterFormData({ ...printer });
    setModalType("edit");
  };

  const openDeleteModal = (printer: PrinterDevice) => {
    setSelectedPrinter(printer);
    setModalType("delete");
  };

  const closeModal = () => {
    setModalType(null);
    setSelectedPrinter(null);
  };

  const handleAddPrinter = () => {
    if (!printerFormData.name) return;
    const newPrinter: PrinterDevice = {
      id: Date.now().toString(),
      name: printerFormData.name,
      type: printerFormData.type as PrinterDevice["type"],
      connectionType: printerFormData.connectionType as PrinterDevice["connectionType"],
      status: "online",
      ipAddress: printerFormData.ipAddress,
      isEnabled: true,
    };
    setPrinters(prev => [...prev, newPrinter]);
    closeModal();
  };

  const handleEditPrinter = () => {
    if (!selectedPrinter || !printerFormData.name) return;
    setPrinters(prev => prev.map(p => p.id === selectedPrinter.id ? { ...p, ...printerFormData } as PrinterDevice : p));
    closeModal();
  };

  const handleDeletePrinter = () => {
    if (!selectedPrinter) return;
    setPrinters(prev => prev.filter(p => p.id !== selectedPrinter.id));
    closeModal();
  };

  const renderToggleRow = (label: string, description: string, value: boolean, onToggle: () => void) => (
    <View className="flex-row items-center justify-between py-3 border-b border-gray-700">
      <View className="flex-1 pr-4">
        <Text className="text-white font-medium">{label}</Text>
        <Text className="text-gray-400 text-sm">{description}</Text>
      </View>
      <Switch checked={value} onCheckedChange={onToggle} />
    </View>
  );

  const renderPrinterCard = (printer: PrinterDevice) => (
    <View key={printer.id} className={`bg-[#404040] p-4 rounded-xl border mb-3 ${printer.isEnabled ? "border-gray-600" : "border-gray-700 opacity-60"}`}>
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center flex-1">
          <View className={`w-10 h-10 rounded-lg items-center justify-center mr-3 ${printer.type === "receipt" ? "bg-blue-600/20" : printer.type === "kitchen" ? "bg-orange-600/20" : "bg-purple-600/20"}`}>
            {printer.type === "receipt" ? <Receipt size={20} color="#60a5fa" /> : printer.type === "kitchen" ? <ChefHat size={20} color="#f97316" /> : <FileText size={20} color="#a78bfa" />}
          </View>
          <View className="flex-1">
            <Text className="text-white font-bold">{printer.name}</Text>
            <View className="flex-row items-center mt-1">
              {printer.connectionType === "wifi" ? <Wifi size={12} color="#9ca3af" /> : printer.connectionType === "bluetooth" ? <Bluetooth size={12} color="#9ca3af" /> : <ArrowRight size={12} color="#9ca3af" />}
              <Text className="text-gray-400 text-xs ml-1">{printer.ipAddress || printer.connectionType.toUpperCase()}</Text>
              <View className="flex-row items-center ml-3">
                {getStatusIcon(printer.status)}
                <Text className={`ml-1 text-xs ${getStatusColor(printer.status)}`}>{getStatusLabel(printer.status)}</Text>
              </View>
            </View>
          </View>
        </View>
        <View className="flex-row items-center gap-2">
          <Switch checked={printer.isEnabled} onCheckedChange={() => togglePrinter(printer.id)} />
          <TouchableOpacity onPress={() => openEditModal(printer)} className="p-2 bg-[#505050] rounded-lg">
            <Edit3 size={18} color="#9ca3af" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => openDeleteModal(printer)} className="p-2 bg-red-500/20 rounded-lg">
            <Trash2 size={18} color="#f87171" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const renderPrinterModal = () => {
    const isEdit = modalType === "edit";
    return (
      <Modal visible={modalType === "add" || modalType === "edit"} transparent animationType="fade" onRequestClose={closeModal} statusBarTranslucent>
        <View className="flex-1 justify-center items-center bg-black/60 px-6">
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="w-full max-w-[500px]">
            <View className="bg-[#303030] rounded-2xl border border-gray-700 overflow-hidden">
              <View className="p-4 border-b border-gray-700 flex-row items-center justify-between">
                <Text className="text-xl font-bold text-white">{isEdit ? "Edit Printer" : "Add Printer"}</Text>
                <TouchableOpacity onPress={closeModal} className="p-2"><X size={24} color="#9ca3af" /></TouchableOpacity>
              </View>
              <View className="p-4 gap-y-4">
                <View>
                  <Text className="text-gray-300 font-medium mb-2">Printer Name</Text>
                  <TextInput
                    value={printerFormData.name}
                    onChangeText={(text) => setPrinterFormData(prev => ({ ...prev, name: text }))}
                    placeholder="Enter printer name"
                    placeholderTextColor="#6b7280"
                    className="bg-[#404040] border border-gray-600 rounded-lg p-3 text-white"
                  />
                </View>
                <View>
                  <Text className="text-gray-300 font-medium mb-2">Printer Type</Text>
                  <View className="flex-row gap-2">
                    {[{ value: 'receipt', label: 'Receipt' }, { value: 'kitchen', label: 'Kitchen' }, { value: 'label', label: 'Label' }].map(option => (
                      <TouchableOpacity
                        key={option.value}
                        onPress={() => setPrinterFormData(prev => ({ ...prev, type: option.value as PrinterDevice['type'] }))}
                        className={`flex-1 py-3 rounded-lg border ${printerFormData.type === option.value ? 'bg-blue-600 border-blue-500' : 'bg-[#404040] border-gray-600'}`}
                      >
                        <Text className={`text-center font-medium ${printerFormData.type === option.value ? 'text-white' : 'text-gray-400'}`}>{option.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <View>
                  <Text className="text-gray-300 font-medium mb-2">Connection Type</Text>
                  <View className="flex-row gap-2">
                    {[{ value: 'wifi', label: 'WiFi' }, { value: 'bluetooth', label: 'Bluetooth' }, { value: 'usb', label: 'USB' }].map(option => (
                      <TouchableOpacity
                        key={option.value}
                        onPress={() => setPrinterFormData(prev => ({ ...prev, connectionType: option.value as PrinterDevice['connectionType'] }))}
                        className={`flex-1 py-3 rounded-lg border ${printerFormData.connectionType === option.value ? 'bg-green-600 border-green-500' : 'bg-[#404040] border-gray-600'}`}
                      >
                        <Text className={`text-center font-medium ${printerFormData.connectionType === option.value ? 'text-white' : 'text-gray-400'}`}>{option.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                {printerFormData.connectionType === 'wifi' && (
                  <View>
                    <Text className="text-gray-300 font-medium mb-2">IP Address</Text>
                    <TextInput
                      value={printerFormData.ipAddress}
                      onChangeText={(text) => setPrinterFormData(prev => ({ ...prev, ipAddress: text }))}
                      placeholder="e.g. 192.168.1.100"
                      placeholderTextColor="#6b7280"
                      className="bg-[#404040] border border-gray-600 rounded-lg p-3 text-white"
                      keyboardType="numeric"
                    />
                  </View>
                )}
              </View>
              <View className="p-4 border-t border-gray-700 flex-row gap-3">
                <TouchableOpacity onPress={closeModal} className="flex-1 py-3 bg-[#404040] rounded-lg"><Text className="text-white font-medium text-center">Cancel</Text></TouchableOpacity>
                <TouchableOpacity onPress={isEdit ? handleEditPrinter : handleAddPrinter} disabled={!printerFormData.name} className={`flex-1 py-3 rounded-lg ${printerFormData.name ? "bg-blue-600" : "bg-blue-600/50"}`}>
                  <Text className="text-white font-medium text-center">{isEdit ? "Save Changes" : "Add Printer"}</Text>
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
        <View className="w-full max-w-[450px] bg-[#303030] rounded-2xl border border-gray-700 overflow-hidden">
          <View className="p-6 items-center">
            <View className="w-16 h-16 bg-red-500/20 rounded-full items-center justify-center mb-4"><AlertTriangle size={32} color="#f87171" /></View>
            <Text className="text-xl font-bold text-white text-center mb-2">Remove Printer?</Text>
            <Text className="text-gray-400 text-center">Are you sure you want to remove "{selectedPrinter?.name}"? This cannot be undone.</Text>
          </View>
          <View className="p-4 border-t border-gray-700 flex-row gap-3">
            <TouchableOpacity onPress={closeModal} className="flex-1 py-3 bg-[#404040] rounded-lg"><Text className="text-white font-medium text-center">Cancel</Text></TouchableOpacity>
            <TouchableOpacity onPress={handleDeletePrinter} className="flex-1 py-3 bg-red-600 rounded-lg"><Text className="text-white font-medium text-center">Remove</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderRouteModal = () => (
    <Modal visible={routeModalVisible} transparent animationType="fade" onRequestClose={closeRouteModal} statusBarTranslucent>
      <View className="flex-1 justify-center items-center bg-black/60 px-6">
        <View className="w-full max-w-[450px] bg-[#303030] rounded-2xl border border-gray-700 overflow-hidden">
          <View className="p-4 border-b border-gray-700 flex-row items-center justify-between">
            <Text className="text-xl font-bold text-white">Add Category Route</Text>
            <TouchableOpacity onPress={closeRouteModal} className="p-2"><X size={24} color="#9ca3af" /></TouchableOpacity>
          </View>
          <View className="p-4 gap-y-4">
            {availableCategories.length === 0 ? (
              <View className="bg-yellow-500/10 border border-yellow-500/30 p-4 rounded-lg">
                <Text className="text-yellow-400 text-center">All categories already have routes assigned.</Text>
              </View>
            ) : (
              <>
                <View>
                  <Text className="text-gray-300 font-medium mb-2">Select Category</Text>
                  <View className="flex-row flex-wrap gap-2">
                    {availableCategories.map(cat => (
                      <TouchableOpacity key={cat} onPress={() => setNewRouteData(prev => ({ ...prev, category: cat }))} className={`px-4 py-2 rounded-lg border ${newRouteData.category === cat ? 'bg-blue-600 border-blue-500' : 'bg-[#404040] border-gray-600'}`}>
                        <Text className={`font-medium ${newRouteData.category === cat ? 'text-white' : 'text-gray-300'}`}>{cat}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <View>
                  <Text className="text-gray-300 font-medium mb-2">Assign to Kitchen Printer</Text>
                  {kitchenPrinters.length === 0 ? (
                    <Text className="text-gray-500 text-sm">No kitchen printers available. Add one first.</Text>
                  ) : (
                    <View className="flex-row flex-wrap gap-2">
                      {kitchenPrinters.map(printer => (
                        <TouchableOpacity key={printer.id} onPress={() => setNewRouteData(prev => ({ ...prev, printerId: printer.id }))} className={`px-4 py-2 rounded-lg border ${newRouteData.printerId === printer.id ? 'bg-orange-600 border-orange-500' : 'bg-[#404040] border-gray-600'}`}>
                          <Text className={`font-medium ${newRouteData.printerId === printer.id ? 'text-white' : 'text-gray-300'}`}>{printer.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
                <View className="flex-row items-center justify-between py-2">
                  <Text className="text-white font-medium">Enable Route</Text>
                  <Switch checked={newRouteData.isEnabled} onCheckedChange={(v) => setNewRouteData(prev => ({ ...prev, isEnabled: v }))} />
                </View>
              </>
            )}
          </View>
          <View className="p-4 border-t border-gray-700 flex-row gap-3">
            <TouchableOpacity onPress={closeRouteModal} className="flex-1 py-3 bg-[#404040] rounded-lg"><Text className="text-white font-medium text-center">Cancel</Text></TouchableOpacity>
            <TouchableOpacity onPress={handleAddRoute} disabled={!newRouteData.category || !newRouteData.printerId || availableCategories.length === 0} className={`flex-1 py-3 rounded-lg ${newRouteData.category && newRouteData.printerId ? "bg-blue-600" : "bg-blue-600/50"}`}>
              <Text className="text-white font-medium text-center">Add Route</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderSectionHeader = (title: string, icon: React.ReactNode, section: keyof typeof expandedSections) => (
    <TouchableOpacity onPress={() => toggleSection(section)} className="flex-row items-center justify-between p-4 bg-[#353535] rounded-t-xl border-b border-gray-700">
      <View className="flex-row items-center">
        <View className="w-8 h-8 bg-[#454545] rounded-lg items-center justify-center mr-3">{icon}</View>
        <Text className="text-white font-bold text-lg">{title}</Text>
      </View>
      {expandedSections[section] ? <ChevronUp size={20} color="#9ca3af" /> : <ChevronDown size={20} color="#9ca3af" />}
    </TouchableOpacity>
  );

  return (
    <View className="flex-1 bg-[#212121] p-6">
      {renderPrinterModal()}
      {renderDeleteModal()}
      {renderRouteModal()}

      <View className="mb-6">
        <Text className="text-3xl font-bold text-white">Printers & Kitchen</Text>
        <Text className="text-gray-400 mt-2">Configure receipt printers, kitchen display systems, and ticket routing.</Text>
      </View>

      <View className="h-px w-full bg-gray-700 mb-6" />

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Printer Management */}
        <View className="bg-[#303030] rounded-xl border border-gray-700 mb-6">
          {renderSectionHeader("Printer Management", <Printer size={20} color="#60a5fa" />, "printers")}
          {expandedSections.printers && (
            <View className="p-5">
              <View className="flex-row justify-between items-center mb-4">
                <Text className="text-gray-400 text-sm">Manage connected printers and their settings.</Text>
                <TouchableOpacity onPress={openAddModal} className="bg-blue-600 px-4 py-2 rounded-lg flex-row items-center">
                  <Plus size={16} color="white" />
                  <Text className="text-white font-medium ml-2">Add Printer</Text>
                </TouchableOpacity>
              </View>
              {printers.map(renderPrinterCard)}
            </View>
          )}
        </View>

        {/* Receipt Settings */}
        <View className="bg-[#303030] rounded-xl border border-gray-700 mb-6">
          {renderSectionHeader("Receipt Settings", <Receipt size={20} color="#4ade80" />, "receipt")}
          {expandedSections.receipt && (
            <View className="p-5">
              {renderToggleRow("Show Tax Breakdown", "Display itemized tax on receipts", receiptSettings.showTaxBreakdown, () => setReceiptSettings(prev => ({ ...prev, showTaxBreakdown: !prev.showTaxBreakdown })))}
              {renderToggleRow("Show Itemized List", "Display individual items on receipts", receiptSettings.showItemizedList, () => setReceiptSettings(prev => ({ ...prev, showItemizedList: !prev.showItemizedList })))}
              {renderToggleRow("Show Tip Options", "Print suggested tip amounts", receiptSettings.showTips, () => setReceiptSettings(prev => ({ ...prev, showTips: !prev.showTips })))}
              <View className="mt-4">
                <Text className="text-gray-300 font-medium mb-2">Footer Message</Text>
                <TextInput value={receiptSettings.footerMessage} onChangeText={(t) => setReceiptSettings(prev => ({ ...prev, footerMessage: t }))} className="bg-[#404040] border border-gray-600 rounded-lg p-3 text-white" placeholder="Thank you message" placeholderTextColor="#6b7280" />
              </View>
            </View>
          )}
        </View>

        {/* Kitchen Ticket Settings */}
        <View className="bg-[#303030] rounded-xl border border-gray-700 mb-6">
          {renderSectionHeader("Kitchen Ticket Settings", <ChefHat size={20} color="#f97316" />, "kitchen")}
          {expandedSections.kitchen && (
            <View className="p-5">
              {renderToggleRow("Auto-Fire Tickets", "Automatically send to kitchen when order is placed", kitchenSettings.autoFire, () => setKitchenSettings(prev => ({ ...prev, autoFire: !prev.autoFire })))}
              {renderToggleRow("Print Void Tickets", "Print ticket when items are voided", kitchenSettings.printVoidTickets, () => setKitchenSettings(prev => ({ ...prev, printVoidTickets: !prev.printVoidTickets })))}
              {renderToggleRow("Show Guest Count", "Display number of guests on ticket", kitchenSettings.showGuestCount, () => setKitchenSettings(prev => ({ ...prev, showGuestCount: !prev.showGuestCount })))}
              {renderToggleRow("Show Modifiers", "Display modifiers on kitchen tickets", kitchenSettings.showModifiers, () => setKitchenSettings(prev => ({ ...prev, showModifiers: !prev.showModifiers })))}
              {renderToggleRow("Show Course Number", "Display course number on tickets", kitchenSettings.showCourseNumber, () => setKitchenSettings(prev => ({ ...prev, showCourseNumber: !prev.showCourseNumber })))}
              {renderToggleRow("Show Server Name", "Display server name on tickets", kitchenSettings.showServerName, () => setKitchenSettings(prev => ({ ...prev, showServerName: !prev.showServerName })))}
              {renderToggleRow("Large Font", "Use larger font size for better visibility", kitchenSettings.largeFont, () => setKitchenSettings(prev => ({ ...prev, largeFont: !prev.largeFont })))}
            </View>
          )}
        </View>

        {/* Printer Routing */}
        <View className="bg-[#303030] rounded-xl border border-gray-700 mb-6">
          {renderSectionHeader("Printer Routing", <Settings2 size={20} color="#a78bfa" />, "routing")}
          {expandedSections.routing && (
            <View className="p-5">
              <Text className="text-gray-400 text-sm mb-4">Route menu categories to specific kitchen printers.</Text>
              {printerRoutes.map((route) => {
                const assignedPrinter = printers.find((p) => p.id === route.printerId);
                return (
                  <View key={route.id} className={`bg-[#404040] p-3 rounded-xl border border-gray-600 mb-2 ${!route.isEnabled ? "opacity-50" : ""}`}>
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center flex-1">
                        <Switch checked={route.isEnabled} onCheckedChange={() => toggleRoute(route.id)} />
                        <Text className="text-white font-medium ml-3">{route.category}</Text>
                        <ArrowRight size={16} color="#6b7280" className="mx-2" />
                        <View className="flex-1 ml-2">
                          <Select value={assignedPrinter ? { value: assignedPrinter.id, label: assignedPrinter.name } : undefined} onValueChange={(option) => updateRoutePrinter(route.id, option?.value || "")}>
                            <SelectTrigger className="bg-[#505050] border-gray-600"><SelectValue placeholder="Select printer" className="text-white" /></SelectTrigger>
                            <SelectContent className="bg-[#404040] border-gray-600">
                              {kitchenPrinters.map((printer) => (<SelectItem key={printer.id} value={printer.id} label={printer.name}>{printer.name}</SelectItem>))}
                            </SelectContent>
                          </Select>
                        </View>
                      </View>
                      {assignedPrinter && (
                        <View className="flex-row items-center ml-2">
                          {getStatusIcon(assignedPrinter.status)}
                          <Text className={`ml-1 text-sm ${getStatusColor(assignedPrinter.status)}`}>{getStatusLabel(assignedPrinter.status)}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
              <TouchableOpacity onPress={openRouteModal} className="bg-[#404040] p-4 rounded-xl border border-dashed border-gray-600 flex-row items-center justify-center">
                <Plus size={20} color="#60a5fa" />
                <Text className="text-blue-400 font-medium ml-2">Add Category Route</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* KDS Auto-Fire Section */}
        <View className="bg-[#303030] rounded-xl border border-gray-700 mb-6">
          <View className="flex-row items-center justify-between p-4 bg-[#353535] rounded-t-xl border-b border-gray-700">
            <View className="flex-row items-center">
              <View className="w-8 h-8 bg-[#454545] rounded-lg items-center justify-center mr-3">
                <Monitor size={20} color="#60a5fa" />
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
                    onPress={() => updateField("kdsAutoFireDelayMinutes",
                      Math.max(1, kdsAutoFireDelayMinutes - 1))}
                    className="bg-gray-700 px-4 py-2 rounded-lg"
                  >
                    <Minus size={18} color="white" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => updateField("kdsAutoFireDelayMinutes",
                      Math.min(30, kdsAutoFireDelayMinutes + 1))}
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
