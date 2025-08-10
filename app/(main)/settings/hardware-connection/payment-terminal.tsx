import Header from "@/components/Header";
import ConnectTerminalModal from "@/components/settings/terminal/ConnectTerminalModal";
import EditTerminalModal from "@/components/settings/terminal/EditTerminalModal ";
import { MOCK_TERMINALS } from "@/lib/mockData";
import { PaymentTerminal } from "@/lib/types";
import { Trash2 } from "lucide-react-native";
import React, { useState } from "react";
import { Switch, Text, TouchableOpacity, View } from "react-native";

const TerminalRow = ({ terminal, onToggle, onEdit, onRemove }: any) => (
  <View className="flex-row items-center p-4 bg-white border border-gray-200 rounded-2xl">
    <Switch
      value={terminal.isEnabled}
      onValueChange={() => onToggle(terminal.id)}
    />
    <View className="ml-4">
      <Text className="font-bold text-lg text-gray-800">{terminal.name}</Text>
      <View className="flex-row items-center mt-1">
        <View
          className={`w-2 h-2 rounded-full mr-2 ${terminal.status === "Connected" ? "bg-green-500" : "bg-gray-400"}`}
        />
        <Text
          className={`font-semibold text-sm ${terminal.status === "Connected" ? "text-green-700" : "text-gray-500"}`}
        >
          {terminal.status}
        </Text>
      </View>
    </View>
    <View className="ml-auto flex-row items-center space-x-2">
      <Text className="font-semibold text-gray-600">
        Battery Level: {terminal.batteryLevel}%
      </Text>
      <TouchableOpacity
        onPress={onEdit}
        className="py-2 px-4 border border-gray-300 rounded-lg"
      >
        <Text className="font-bold text-gray-700">Edit Terminal</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onRemove}
        className="p-3 border border-gray-300 rounded-lg"
      >
        <Trash2 color="#4b5563" size={20} />
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
    <View className="flex-1 bg-gray-50 p-6">
      <Header />
      <Text className="text-3xl font-bold text-gray-800 my-4">
        Payment Terminal (Card Reader)
      </Text>

      <View className="flex-1 space-y-4">
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

      <View className="flex-row justify-end space-x-2 pt-4 border-t border-gray-200">
        <TouchableOpacity
          onPress={() => setConnectModalOpen(true)}
          className="px-6 py-3 border border-gray-300 rounded-lg"
        >
          <Text className="font-bold text-gray-700">
            Connect a New Terminal
          </Text>
        </TouchableOpacity>
        <TouchableOpacity className="px-8 py-3 bg-primary-400 rounded-lg">
          <Text className="font-bold text-white">Save</Text>
        </TouchableOpacity>
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
