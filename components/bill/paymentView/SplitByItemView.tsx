import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
// Import BottomSheetScrollView to handle sheet gestures correctly
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  CreditCard,
  Plus,
  User,
} from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  ScrollView, // Standard ScrollView for horizontal tabs
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const SplitByItemView = () => {
  const activeOrderId = useOrderStore((state) => state.activeOrderId);
  const orders = useOrderStore((state) => state.orders);

  const splits = usePaymentStore((state) => state.splits);
  const addSplit = usePaymentStore((state) => state.addSplit);
  const removeSplit = usePaymentStore((state) => state.removeSplit);
  const assignItemToSplit = usePaymentStore((state) => state.assignItemToSplit);
  const unassignItemFromSplit = usePaymentStore(
    (state) => state.unassignItemFromSplit
  );
  const updateSplitCustomerName = usePaymentStore(
    (state) => state.updateSplitCustomerName
  );
  const setView = usePaymentStore((state) => state.setView);

  const [activeSplitId, setActiveSplitId] = useState<string | null>(null);

  useEffect(() => {
    if (splits.length === 0) {
      addSplit("Guest 1");
    } else if (!activeSplitId && splits.length > 0) {
      setActiveSplitId(splits[0].id);
    }
  }, [splits.length]);

  useEffect(() => {
    if (
      splits.length > 0 &&
      activeSplitId &&
      !splits.find((s) => s.id === activeSplitId)
    ) {
      setActiveSplitId(splits[0].id);
    }
  }, [splits, activeSplitId]);

  const activeOrder = useMemo(
    () => orders.find((o) => o.id === activeOrderId),
    [orders, activeOrderId]
  );

  const masterItems = activeOrder?.items || [];

  const itemData = useMemo(() => {
    return masterItems.map((item) => {
      const currentSplit = splits.find((s) => s.id === activeSplitId);
      const qtyInCurrent =
        currentSplit?.items.find((i) => i.id === item.id)?.quantity || 0;

      let totalAssigned = 0;
      splits.forEach((s) => {
        const found = s.items.find((i) => i.id === item.id);
        if (found) totalAssigned += found.quantity;
      });

      const qtyRemaining = item.quantity - totalAssigned;

      return {
        ...item,
        qtyInCurrent,
        qtyRemaining,
        totalAssigned,
        isFullyAssigned: item.quantity === totalAssigned,
      };
    });
  }, [masterItems, splits, activeSplitId]);

  const activeSplit = splits.find((s) => s.id === activeSplitId);
  const activeSplitTotal = activeSplit
    ? activeSplit.items.reduce((acc, i) => acc + i.price * i.quantity, 0)
    : 0;

  const handleAddGuest = () => {
    addSplit(`Guest ${splits.length + 1}`);
  };

  const toggleAssignment = (item: (typeof itemData)[0]) => {
    if (!activeSplitId) return;
    if (item.qtyRemaining > 0) {
      assignItemToSplit(activeSplitId, { ...item, quantity: 1 });
    } else if (item.qtyInCurrent > 0) {
      unassignItemFromSplit(activeSplitId, item.id);
    }
  };

  const handlePaySplit = () => {
    if (activeSplitId) {
      console.log("Paying for", activeSplitId);
    }
  };

  const handleDone = () => {
    usePaymentStore.getState().setPaymentClean();
    setView("success");
  };

  return (
    <View className="flex-1 bg-[#212121]">
      {/* 1. Header */}
      <View className="flex-row items-center justify-between p-4 border-b border-[#333] h-[70px]">
        <TouchableOpacity
          onPress={() => setView("split-options")}
          className="p-2 bg-[#333] rounded-lg"
        >
          <ArrowLeft size={20} color="white" />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-white">Split by Item</Text>
        <TouchableOpacity
          onPress={handleDone}
          className="bg-[#333] px-3 py-2 rounded-lg"
        >
          <Text className="text-green-400 font-bold">Done</Text>
        </TouchableOpacity>
      </View>

      {/* 2. Guest Tabs - Using .map() inside ScrollView */}
      <View className="h-[70px] bg-[#1a1a1a] border-b border-[#333]">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 16,
            alignItems: "center",
          }}
        >
          {/* Add Button */}
          <TouchableOpacity
            onPress={handleAddGuest}
            className="flex-row items-center px-4 py-2 mx-2 rounded-full border border-[#444] bg-[#2a2a2a]"
          >
            <Plus size={18} color="#fff" />
            <Text className="ml-2 text-white font-semibold">Add</Text>
          </TouchableOpacity>

          {/* Guest List Map */}
          {splits.map((split) => {
            const isActive = split.id === activeSplitId;
            return (
              <TouchableOpacity
                key={split.id}
                onPress={() => setActiveSplitId(split.id)}
                className={`flex-row items-center px-4 py-2 mr-2 rounded-full border ${
                  isActive
                    ? "bg-blue-600 border-blue-500"
                    : "bg-[#2a2a2a] border-[#333]"
                }`}
              >
                <User size={16} color={isActive ? "white" : "#9ca3af"} />
                <Text
                  className={`ml-2 font-semibold ${
                    isActive ? "text-white" : "text-gray-400"
                  }`}
                >
                  {split.customerName}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* 3. Active Guest Summary */}
      {activeSplit && (
        <View className="flex-row justify-between items-center p-4 bg-[#262626] border-b border-[#333]">
          <View>
            <TextInput
              className="text-2xl font-bold text-white border-b border-[#444] pb-1 min-w-[150px]"
              value={activeSplit.customerName}
              onChangeText={(t) => updateSplitCustomerName(activeSplit.id, t)}
              placeholderTextColor="#555"
            />
            <Text className="text-gray-400 text-xs mt-1">
              Tap items below to assign
            </Text>
          </View>
          <View className="items-end">
            <Text className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">
              Total
            </Text>
            <Text className="text-2xl font-bold text-blue-400">
              ${activeSplitTotal.toFixed(2)}
            </Text>
          </View>
        </View>
      )}

      {/* 4. Main Item List - Using .map() inside BottomSheetScrollView */}
      {/* 
          Using BottomSheetScrollView ensures vertical scrolling works 
          inside the bottom sheet without conflicting gestures.
      */}
      <View className="flex-1 bg-[#1F1F1F]">
        <BottomSheetScrollView contentContainerStyle={{ paddingBottom: 100 }}>
          {itemData.map((item) => {
            const isSelected = item.qtyInCurrent > 0;
            const isFullyAssignedToOthers =
              item.qtyRemaining === 0 && item.qtyInCurrent === 0;

            return (
              <TouchableOpacity
                key={item.id} // Ensure key is unique
                onPress={() => toggleAssignment(item)}
                disabled={isFullyAssignedToOthers}
                className={`flex-row justify-between items-center p-4 border-b border-[#333] ${
                  isSelected
                    ? "bg-[#1e3a8a] border-[#2563eb]" // Active Blue Bg
                    : isFullyAssignedToOthers
                      ? "bg-[#1A1A1A] opacity-40" // Dimmed
                      : "bg-[#262626]" // Default
                }`}
              >
                <View className="flex-1">
                  <Text
                    className={`text-lg font-semibold ${
                      isSelected
                        ? "text-white"
                        : isFullyAssignedToOthers
                          ? "text-gray-500"
                          : "text-gray-200"
                    }`}
                  >
                    {item.name}
                  </Text>
                  <Text
                    className={`text-sm mt-1 ${
                      isSelected ? "text-blue-200" : "text-gray-400"
                    }`}
                  >
                    ${item.price.toFixed(2)}
                  </Text>
                </View>

                <View className="items-end gap-1">
                  {isFullyAssignedToOthers ? (
                    <Text className="text-gray-500 italic text-xs">
                      Assigned
                    </Text>
                  ) : (
                    <View className="flex-row items-center gap-2">
                      {item.qtyInCurrent > 0 && (
                        <View className="bg-blue-600 px-2 py-1 rounded-md">
                          <Text className="text-white text-xs font-bold">
                            {item.qtyInCurrent}x
                          </Text>
                        </View>
                      )}
                      {isSelected ? (
                        <CheckCircle2 size={24} color="#3b82f6" fill="white" />
                      ) : (
                        <Circle size={24} color="#555" />
                      )}
                    </View>
                  )}
                  {item.qtyRemaining > 0 && (
                    <Text className="text-blue-400 text-xs font-medium mt-1">
                      {item.qtyRemaining} left
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </BottomSheetScrollView>
      </View>

      {/* 5. Footer Action */}
      <View className="p-4 bg-[#212121] border-t border-[#333]">
        <TouchableOpacity
          onPress={handlePaySplit}
          disabled={activeSplitTotal === 0}
          className={`flex-row items-center justify-center py-4 rounded-xl gap-2 ${
            activeSplitTotal > 0
              ? "bg-blue-600 active:bg-blue-700"
              : "bg-[#333]"
          }`}
        >
          <CreditCard
            size={20}
            color={activeSplitTotal > 0 ? "white" : "#666"}
            className="mr-2"
          />
          <Text
            className={`text-lg font-bold ${
              activeSplitTotal > 0 ? "text-white" : "text-gray-500"
            }`}
          >
            Pay {activeSplit?.customerName} (${activeSplitTotal.toFixed(2)})
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default SplitByItemView;
