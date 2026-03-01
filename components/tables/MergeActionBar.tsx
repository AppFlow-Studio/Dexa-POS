import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface MergeActionBarProps {
  selectedCount: number;
  canMergeAndSeat: boolean;
  canAddToSession: boolean;
  canUnmerge: boolean;
  onMerge: () => void;
  onAdd: () => void;
  onUnmerge: () => void;
  onCancel: () => void;
}

const MergeActionBar: React.FC<MergeActionBarProps> = ({
  selectedCount,
  canMergeAndSeat,
  canAddToSession,
  canUnmerge,
  onMerge,
  onAdd,
  onUnmerge,
  onCancel,
}) => {
  if (selectedCount === 0) return null;

  return (
    <View className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 flex-row items-center gap-3 p-3 rounded-xl bg-panel/95 border border-gray-600">
      <View className="bg-gray-700 px-3 py-2 rounded-lg">
        <Text className="text-white font-semibold">
          {selectedCount} table{selectedCount !== 1 ? "s" : ""} selected
        </Text>
      </View>

      {canMergeAndSeat && (
        <TouchableOpacity
          onPress={onMerge}
          className="py-2 px-4 bg-green-600 rounded-lg"
        >
          <Text className="text-white font-bold">Merge & Seat</Text>
        </TouchableOpacity>
      )}

      {canAddToSession && (
        <TouchableOpacity
          onPress={onAdd}
          className="py-2 px-4 bg-blue-600 rounded-lg"
        >
          <Text className="text-white font-bold">Add to Session</Text>
        </TouchableOpacity>
      )}

      {canUnmerge && (
        <TouchableOpacity
          onPress={onUnmerge}
          className="py-2 px-4 bg-red-600 rounded-lg"
        >
          <Text className="text-white font-bold">Unmerge</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        onPress={onCancel}
        className="py-2 px-4 bg-gray-600 rounded-lg"
      >
        <Text className="text-white font-bold">Cancel</Text>
      </TouchableOpacity>
    </View>
  );
};

export default React.memo(MergeActionBar);
