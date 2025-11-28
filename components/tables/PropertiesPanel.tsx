import { TableType } from "@/lib/types";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import debounce from "lodash.debounce";
import { Trash2, X } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import {
  KeyboardAvoidingView, // <--- Imported
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

interface PropertiesPanelProps {
  table: TableType;
  layoutId: string;
}

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  table,
  layoutId,
}) => {
  const { updateTableName, removeTable, clearSelection } = useFloorPlanStore();
  const [name, setName] = useState(table.name);

  const debouncedUpdateName = useCallback(
    debounce((newName: string) => {
      if (layoutId && table.id && newName) {
        updateTableName(layoutId, table.id, newName);
      }
    }, 300),
    [layoutId, table.id, updateTableName]
  );

  useEffect(() => {
    setName(table.name);
  }, [table.name]);

  const handleNameChange = (newName: string) => {
    setName(newName);
    debouncedUpdateName(newName);
  };

  const handleDelete = () => {
    if (layoutId && table.id) {
      removeTable(layoutId, table.id);
      clearSelection();
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="absolute bottom-5 right-5 w-[300px] bg-zinc-800 rounded-2xl p-5 shadow-lg gap-5"
    >
      {/* Close Button */}
      <TouchableOpacity
        onPress={clearSelection}
        className="absolute -top-2 -right-2 bg-zinc-900/80 rounded-full p-1.5 z-10"
      >
        <X size={18} color="#E5E5E5" />
      </TouchableOpacity>

      <View className="flex-row justify-between items-center pb-3 border-b border-zinc-700">
        <Text className="text-xl font-bold text-white">Properties</Text>
        <View className="bg-zinc-700 px-3 py-1 rounded-full">
          <Text className="text-xs font-medium text-zinc-300">
            {table.name}
          </Text>
        </View>
      </View>

      <View className="gap-2">
        <Text className="text-sm font-medium text-zinc-400">Name</Text>
        <TextInput
          className="bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-2.5 text-base text-white"
          value={name}
          onChangeText={handleNameChange}
          placeholder="Enter object name"
          placeholderTextColor="#999"
        />
      </View>

      <TouchableOpacity
        className="bg-red-600 flex-row items-center justify-center py-3 rounded-lg gap-2"
        onPress={handleDelete}
      >
        <Trash2 size={18} color="#fff" />
        <Text className="text-white text-base font-bold">Delete Element</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
};

export default PropertiesPanel;
