import AddTableModal from "@/components/tables/AddTableModal";
import DraggableTable from "@/components/tables/DraggableTable";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useRouter } from "expo-router";
import { Link as LinkIcon, Plus, X } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import Svg, { Line } from "react-native-svg"; // --- NEW: Import SVG components

const LayoutEditorScreen = () => {
  const router = useRouter();
  const {
    tables,
    selectedTableIds,
    toggleTableSelection,
    mergeTables,
    unmergeTables,
    clearSelection,
  } = useFloorPlanStore();
  const { consolidateOrdersForTables } = useOrderStore();
  const [isAddModalOpen, setAddModalOpen] = useState(false);

  useEffect(() => {
    clearSelection();
    return () => clearSelection();
  }, []);

  const handleMerge = () => {
    // 1. Get the names of the selected tables
    const selectedTableNames = selectedTableIds
      .map((id) => {
        const table = tables.find((t) => t.id === id);
        return table ? table.name : "";
      })
      .filter(Boolean); // Filter out any potential empty names

    // 2. Consolidate orders, passing in the names
    const newOrderId = consolidateOrdersForTables(
      selectedTableIds,
      selectedTableNames
    );

    // 3. Merge the tables in the floor plan
    mergeTables(selectedTableIds, newOrderId);
  };

  const handleUnmerge = () => {
    if (selectedTableIds.length === 1) {
      unmergeTables(selectedTableIds[0]);
    }
  };

  const selectedTable = tables.find((t) => t.id === selectedTableIds[0]);
  const canUnmerge =
    selectedTableIds.length === 1 &&
    (selectedTable?.isPrimary || selectedTable?.mergedWith?.length);

  return (
    <View className="flex-1 bg-gray-100">
      {/* Header */}
      <View className="bg-white p-4 flex-row justify-between items-center">
        <Text className="text-2xl font-bold">Edit Layout</Text>
        <View className="flex-row gap-2">
          {selectedTableIds.length >= 2 && (
            <TouchableOpacity
              onPress={handleMerge}
              className="py-3 px-5 rounded-lg flex-row items-center bg-green-500"
            >
              <LinkIcon size={16} color="white" className="mr-2" />
              <Text className="font-bold text-white">Merge</Text>
            </TouchableOpacity>
          )}
          {canUnmerge && (
            <TouchableOpacity
              onPress={handleUnmerge}
              className="py-3 px-5 rounded-lg flex-row items-center bg-yellow-500"
            >
              <X size={16} color="white" className="mr-2" />
              <Text className="font-bold text-white">Unmerge</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => setAddModalOpen(true)}
            className="py-3 px-5 rounded-lg flex-row items-center bg-blue-500 text-white"
          >
            <Plus size={16} color="white" />
            <Text className="font-bold text-white">Add Table</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.back()}
            className="py-3 px-5 rounded-lg flex-row items-center bg-gray-700"
          >
            <Text className="font-bold text-white">Save & Exit</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Canvas */}
      <View className="flex-1 relative overflow-hidden">
        {/* --- NEW: SVG Container for Drawing Lines --- */}
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          {tables.map((table) => {
            if (table.isPrimary && table.mergedWith) {
              const primaryCenter = { x: table.x + 50, y: table.y + 50 }; // Approx center
              return table.mergedWith.map((mergedId) => {
                const mergedTable = tables.find((t) => t.id === mergedId);
                if (!mergedTable) return null;
                const mergedCenter = {
                  x: mergedTable.x + 50,
                  y: mergedTable.y + 50,
                };
                return (
                  <Line
                    key={`${table.id}-${mergedId}`}
                    x1={primaryCenter.x}
                    y1={primaryCenter.y}
                    x2={mergedCenter.x}
                    y2={mergedCenter.y}
                    stroke="#F59E0B" // Amber color to match the border
                    strokeWidth="4"
                    strokeDasharray="8, 4" // Dashed line style
                  />
                );
              });
            }
            return null;
          })}
        </Svg>
        {/* --- END SVG Container --- */}

        {tables.map((table) => (
          <DraggableTable
            key={table.id}
            table={table}
            isEditMode={true}
            isSelected={selectedTableIds.includes(table.id)}
            onSelect={() => toggleTableSelection(table.id)}
            canvasScale={useSharedValue(1)}
          />
        ))}
      </View>

      <AddTableModal
        isOpen={isAddModalOpen}
        onClose={() => setAddModalOpen(false)}
        onAdd={() => {}}
      />
    </View>
  );
};

export default LayoutEditorScreen;
