import { PrinterDevice } from "@/lib/types";
import { Trash2 } from "lucide-react-native";
import React from "react";
import { Switch, Text, TouchableOpacity, View } from "react-native";
interface PrinterRowProps {
  printer: PrinterDevice;
  onToggle: (id: string) => void;
  onRemove: () => void;
  onEdit: () => void;
}

const PrinterRow: React.FC<PrinterRowProps> = ({
  printer,
  onToggle,
  onRemove,
  onEdit,
}) => {
  return (
    <View className="flex-row items-center p-4 bg-white border border-gray-200 rounded-2xl">
      <Switch
        value={printer.isEnabled}
        onValueChange={() => onToggle(printer.id)}
      />
      <View className="ml-4">
        <Text className="font-bold text-lg text-gray-800">{printer.name}</Text>
        <View className="flex-row items-center mt-1">
          <View
            className={`w-2 h-2 rounded-full mr-2 ${printer.status === "Connected" ? "bg-green-500" : "bg-gray-400"}`}
          />
          <Text
            className={`font-semibold text-sm ${printer.status === "Connected" ? "text-green-700" : "text-gray-500"}`}
          >
            {printer.status}
          </Text>
        </View>
      </View>
      <View className="ml-auto flex-row items-center space-x-2">
        <TouchableOpacity className="py-2 px-4 border border-gray-300 rounded-lg">
          <Text className="font-bold text-gray-700">Test Print</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onEdit}
          className="py-2 px-4 border border-gray-300 rounded-lg"
        >
          <Text className="font-bold text-gray-700">Edit Printer</Text>
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
};

export default PrinterRow;
