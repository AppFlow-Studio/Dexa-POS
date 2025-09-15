import SettingsSidebar from "@/components/settings/SettingsSidebar";
import ConnectTerminalModal from "@/components/settings/terminal/ConnectTerminalModal";
import EditTerminalModal from "@/components/settings/terminal/EditTerminalModal ";
import { MOCK_TERMINALS } from "@/lib/mockData";
import { PaymentTerminal } from "@/lib/types";
import { CreditCard, Monitor, Printer, Receipt, Trash2 } from "lucide-react-native";
import React, { useState } from "react";
import { Switch, Text, TouchableOpacity, View } from "react-native";

const TerminalRow = ({ terminal, onToggle, onEdit, onRemove }: any) => (
  <View className="flex-row items-center p-4 bg-[#212121] border border-gray-600 rounded-2xl">
    <Switch
      value={terminal.isEnabled}
      onValueChange={() => onToggle(terminal.id)}
      trackColor={{ false: "#DCDCDC", true: "#31A961" }}
      thumbColor={"#ffffff"}
    />
    <View className="ml-4 flex-row gap-4">
      <Text className="font-bold text-lg text-white">{terminal.name}</Text>
      <View
        className={`flex-row items-center mt-1 rounded-full px-2 ${terminal.status === "Connected" ? "bg-green-500/20" : "bg-gray-600"}`}
      >
        <View
          className={`w-2 h-2 rounded-full mr-2 ${terminal.status === "Connected" ? "bg-green-500" : "bg-gray-400"}`}
        />
        <Text
          className={`font-semibold text-sm ${terminal.status === "Connected" ? "text-green-400" : "text-gray-300"}`}
        >
          {terminal.status}
        </Text>
      </View>
    </View>
    <View className="ml-auto flex-row items-center gap-2">
      <Text className="font-semibold text-gray-300">
        Battery Level: {terminal.batteryLevel}%
      </Text>
      <TouchableOpacity
        onPress={onEdit}
        className="py-2 px-4 border border-gray-500 rounded-xl"
      >
        <Text className="font-bold text-gray-300">Edit Terminal</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onRemove}
        className="p-3 border border-gray-500 rounded-full"
      >
        <Trash2 color="#9CA3AF" size={20} />
      </TouchableOpacity>
    </View>
  </View>
);

const PaymentTerminalScreen = () => {
  const [terminals, setTerminals] = useState(MOCK_TERMINALS);
  const [isEditModalOpen, setEditModalOpen] = useState(false);
  const [isConnectModalOpen, setConnectModalOpen] = useState(false);
  const [selectedTerminal, setSelectedTerminal] =
    useState<PaymentTerminal | null>(null);

  const hardwareSubsections = [
    {
      id: "printer",
      title: "Printers",
      subtitle: "Receipt & Kitchen",
      route: "/settings/hardware-connection/printer",
      icon: <Printer color="#3b82f6" size={20} />,
    },
    {
      id: "printer-rules",
      title: "Printer Rules",
      subtitle: "Print Configuration",
      route: "/settings/hardware-connection/printer-rules",
      icon: <Receipt color="#3b82f6" size={20} />,
    },
    {
      id: "customer-display",
      title: "Customer Display",
      subtitle: "Order Display",
      route: "/settings/hardware-connection/customer-display",
      icon: <Monitor color="#3b82f6" size={20} />,
    },
    {
      id: "payment-terminal",
      title: "Payment Terminal",
      subtitle: "Card Processing",
      route: "/settings/hardware-connection/payment-terminal",
      icon: <CreditCard color="#3b82f6" size={20} />,
    },
  ];

  const handleOpenEditModal = (terminal: PaymentTerminal) => {
    setSelectedTerminal(terminal);
    setEditModalOpen(true);
  };

  const handleToggle = (id: string) => {
    setTerminals((prev) =>
      prev.map((t) => (t.id === id ? { ...t, isEnabled: !t.isEnabled } : t))
    );
  };

  return (
    <View className="flex-1 bg-[#212121] p-6">
      <View className="flex-row gap-6 h-full w-full">
        {/* Sidebar */}
        <SettingsSidebar
          title="Hardware & Connection"
          subsections={hardwareSubsections}
          currentRoute="/settings/hardware-connection/payment-terminal"
        />

        {/* Main Content */}
        <View className="flex-1 bg-[#303030] rounded-2xl border border-gray-600 p-6">
          <View className="flex-1 gap-y-4">
            {terminals.map((terminal) => (
              <TerminalRow
                key={terminal.id}
                terminal={terminal}
                onToggle={handleToggle}
                onEdit={() => handleOpenEditModal(terminal)}
                onRemove={() => {
                  /* Open remove modal */
                }}
              />
            ))}
          </View>

          <View className="flex-row justify-start gap-2 pt-4 border-t border-gray-600">
            <TouchableOpacity
              onPress={() => setConnectModalOpen(true)}
              className="px-6 py-3 border border-gray-500 rounded-lg"
            >
              <Text className="font-bold text-gray-300">
                Connect a New Terminal
              </Text>
            </TouchableOpacity>
            <TouchableOpacity className="px-8 py-3 bg-blue-500 rounded-lg">
              <Text className="font-bold text-white">Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Modals */}
      <EditTerminalModal
        isOpen={isEditModalOpen}
        onClose={() => setEditModalOpen(false)}
        onSave={() => setEditModalOpen(false)}
        terminal={selectedTerminal}
      />
      <ConnectTerminalModal
        isOpen={isConnectModalOpen}
        onClose={() => setConnectModalOpen(false)}
      />
    </View>
  );
};

export default PaymentTerminalScreen;
