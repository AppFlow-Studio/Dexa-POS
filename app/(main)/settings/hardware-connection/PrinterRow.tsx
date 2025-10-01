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
    <View className="flex-row items-center p-4 bg-[#212121] border border-gray-600 rounded-2xl">
      <Switch
        value={printer.isEnabled}
        onValueChange={() => onToggle(printer.id)}
        trackColor={{ false: "#DCDCDC", true: "#31A961" }}
        thumbColor={"#ffffff"}
      />
      <View className="ml-3 flex-row gap-3 items-center">
        <Text className="font-bold text-xl text-white">{printer.name}</Text>
        <View
          className={`flex-row items-center mt-1 rounded-full px-2 py-0.5 ${
            printer.status === "Connected" ? "bg-green-500/20" : "bg-gray-600"
          }`}
        >
          <View
            className={`w-2.5 h-2.5 rounded-full mr-1.5 ${
              printer.status === "Connected" ? "bg-green-500" : "bg-gray-400"
            }`}
          />
          <Text
            className={`font-semibold text-lg ${
              printer.status === "Connected"
                ? "text-green-400"
                : "text-gray-300"
            }`}
          >
            {printer.status}
          </Text>
        </View>
      </View>
      <View className="ml-auto flex-row items-center gap-2">
        <TouchableOpacity className="py-2 px-4 border border-gray-500 rounded-lg">
          <Text className="font-bold text-lg text-gray-300">Test</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onEdit}
          className="py-2 px-4 border border-gray-500 rounded-lg"
        >
          <Text className="font-bold text-lg text-gray-300">Edit</Text>
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
};

export default PrinterRow;
