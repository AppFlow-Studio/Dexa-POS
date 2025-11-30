import { CartItem } from "@/lib/types";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  MinusCircle,
  Plus,
  Trash2,
  User,
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const SplitByItemView = () => {
  // ✅ FIX 1: Use individual selectors to prevent re-renders and potential crashes
  const activeOrderId = useOrderStore((state) => state.activeOrderId);
  const orders = useOrderStore((state) => state.orders);

  // ✅ FIX 2: Use selectors for PaymentStore as well
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

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // Optional: Safety check if useToast is causing the context error
  // const { show } = useToast();

  // Get the Master Order
  const activeOrder = useMemo(
    () => orders.find((o) => o.id === activeOrderId),
    [orders, activeOrderId]
  );
  console.log("activeOrderId:", activeOrderId);

  const masterItems = activeOrder?.items || [];

  // --- LOGIC: Calculate Available Quantities ---
  const availableItems = useMemo(() => {
    if (!masterItems.length) return [];

    const totals = new Map<string, CartItem>();

    // Deep clone items
    masterItems.forEach((item) => {
      totals.set(item.id, { ...item });
    });

    // Subtract items already in splits
    splits.forEach((split) => {
      split.items.forEach((splitItem) => {
        const masterItem = totals.get(splitItem.id);
        if (masterItem) {
          masterItem.quantity -= splitItem.quantity;
        }
      });
    });

    return Array.from(totals.values()).filter((item) => item.quantity > 0);
  }, [masterItems, splits]);

  const handleAddSplit = () => {
    const nextCustomerNumber = splits.length + 1;
    addSplit(`Guest ${nextCustomerNumber}`);
  };

  const handleAssignItem = (splitId: string) => {
    if (!selectedItemId) return;

    // Find the item in our *available* list to ensure we have stock
    const itemToAssign = availableItems.find((i) => i.id === selectedItemId);

    if (itemToAssign) {
      // Assign 1 unit
      assignItemToSplit(splitId, { ...itemToAssign, quantity: 1 });

      // Check if we just used the last one
      // (Logic: itemToAssign.quantity is the snapshot *before* this action)
      if (itemToAssign.quantity <= 1) {
        setSelectedItemId(null);
      }
    }
  };

  const handlePaySplit = (splitId: string) => {
    console.log("Pay Split Clicked:", splitId);
    // show({ title: "Processing", message: "Splitting payment..." });
  };

  const getSplitTotal = (items: CartItem[]) => {
    return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  };

  return (
    <View className="flex-1 bg-[#212121]">
      {/* Header */}
      <View className="flex-row items-center p-4 border-b border-[#333]">
        <TouchableOpacity
          onPress={() => setView("split-options")}
          className="p-2 bg-[#333] rounded-lg mr-4"
        >
          <ArrowLeft size={20} color="white" />
        </TouchableOpacity>
        <View>
          <Text className="text-2xl font-bold text-white">Split by Item</Text>
          <Text className="text-gray-400">
            Select an item, then tap a guest to assign it.
          </Text>
        </View>
      </View>

      <View className="flex-1 flex-row">
        {/* LEFT COLUMN: Unassigned Bill Items */}
        <View className="flex-[4] border-r border-[#333] bg-[#262626]">
          <View className="p-4 border-b border-[#333] bg-[#2A2A2A]">
            <Text className="text-gray-400 font-bold uppercase tracking-wider text-xs">
              Remaining Items
            </Text>
          </View>

          <ScrollView contentContainerStyle={{ padding: 10 }}>
            {availableItems.length === 0 ? (
              <View className="p-8 items-center justify-center opacity-50">
                <CheckCircle2 size={40} color="#10B981" className="mb-2" />
                <Text className="text-gray-400 text-center">
                  All items assigned
                </Text>
              </View>
            ) : (
              availableItems.map((item) => {
                const isSelected = selectedItemId === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => setSelectedItemId(item.id)}
                    className={`
                        flex-row justify-between items-center p-4 mb-3 rounded-xl border
                        ${
                          isSelected
                            ? "bg-blue-600 border-blue-400"
                            : "bg-[#333] border-[#404040]"
                        }
                    `}
                  >
                    <View className="flex-1">
                      <View className="flex-row items-center">
                        <View
                          className={`px-2 py-0.5 rounded mr-2 ${isSelected ? "bg-white/20" : "bg-[#444]"}`}
                        >
                          <Text
                            className={`font-bold ${isSelected ? "text-white" : "text-gray-300"}`}
                          >
                            {item.quantity}x
                          </Text>
                        </View>
                        <Text
                          className={`text-lg font-semibold ${isSelected ? "text-white" : "text-gray-200"}`}
                          numberOfLines={1}
                        >
                          {item.name}
                        </Text>
                      </View>
                      <Text
                        className={`mt-1 ${isSelected ? "text-blue-200" : "text-gray-400"}`}
                      >
                        ${item.price.toFixed(2)} ea
                      </Text>
                    </View>

                    {isSelected && <ChevronRight color="white" size={20} />}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>

        {/* RIGHT COLUMN: Splits / Guest Checks */}
        <View className="flex-[6] bg-[#1F1F1F]">
          <View className="p-4 border-b border-[#333] flex-row justify-between items-center bg-[#2A2A2A]">
            <Text className="text-gray-400 font-bold uppercase tracking-wider text-xs">
              Guest Checks
            </Text>
            <TouchableOpacity
              onPress={handleAddSplit}
              className="flex-row items-center bg-[#333] px-3 py-1.5 rounded-lg border border-[#444]"
            >
              <Plus size={16} color="white" className="mr-1" />
              <Text className="text-white font-medium text-xs">Add Guest</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 12 }}>
            <View className="flex-row flex-wrap gap-3">
              {splits.map((split) => {
                const total = getSplitTotal(split.items);
                const isTarget = !!selectedItemId;

                return (
                  <TouchableOpacity
                    key={split.id}
                    onPress={() => handleAssignItem(split.id)} // Put logic back
                    activeOpacity={isTarget ? 0.7 : 1}
                    disabled={!isTarget} // Disable click if no item selected (optional UX choice)
                    className={`
                            w-full mb-2 rounded-2xl border-2 overflow-hidden
                            ${
                              isTarget
                                ? "border-dashed border-blue-500/50 bg-[#2A2A2A]"
                                : "border-[#333] bg-[#262626]"
                            }
                        `}
                  >
                    {/* Split Header */}
                    <View
                      className={`px-4 py-3 flex-row justify-between items-center ${isTarget ? "bg-blue-900/20" : "bg-[#303030]"}`}
                    >
                      <View className="flex-row items-center flex-1">
                        <View className="w-8 h-8 rounded-full bg-[#444] items-center justify-center mr-2">
                          <User size={14} color="#ccc" />
                        </View>
                        <TextInput
                          className="text-lg font-bold text-white min-w-[100px]"
                          value={split.customerName}
                          onChangeText={(text) =>
                            updateSplitCustomerName(split.id, text)
                          }
                          placeholder="Guest Name"
                          placeholderTextColor="#666"
                        />
                      </View>
                      <TouchableOpacity
                        onPress={() => removeSplit(split.id)}
                        className="p-2"
                      >
                        <Trash2 size={16} color="#666" />
                      </TouchableOpacity>
                    </View>

                    {/* Split Items List */}
                    <View className="p-4 min-h-[80px]">
                      {split.items.length === 0 ? (
                        <View className="flex-1 items-center justify-center py-4 border-2 border-dashed border-[#333] rounded-lg">
                          <Text className="text-gray-600 text-sm">
                            {isTarget
                              ? "Tap here to add selected item"
                              : "No items assigned"}
                          </Text>
                        </View>
                      ) : (
                        <View className="flex-row flex-wrap gap-2">
                          {split.items.map((item, idx) => (
                            <TouchableOpacity
                              key={`${item.id}-${idx}`}
                              onPress={() =>
                                unassignItemFromSplit(split.id, item.id)
                              }
                              className="flex-row items-center bg-[#333] pl-3 pr-2 py-1.5 rounded-lg border border-[#444]"
                            >
                              <Text className="text-gray-200 text-sm mr-2">
                                {item.name}
                              </Text>
                              <MinusCircle size={14} color="#ef4444" />
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </View>

                    {/* Split Footer / Actions */}
                    <View className="p-3 bg-[#1A1A1A] border-t border-[#333] flex-row justify-between items-center">
                      <View>
                        <Text className="text-gray-500 text-xs">Total</Text>
                        <Text className="text-xl font-bold text-white">
                          ${total.toFixed(2)}
                        </Text>
                      </View>

                      <TouchableOpacity
                        disabled={total === 0}
                        onPress={() => handlePaySplit(split.id)}
                        className={`
                                    flex-row items-center px-4 py-2 rounded-lg
                                    ${total > 0 ? "bg-blue-600" : "bg-[#333] opacity-50"}
                                `}
                      >
                        <CreditCard size={16} color="white" className="mr-2" />
                        <Text className="text-white font-bold">Pay</Text>
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {splits.length === 0 && (
              <View className="items-center justify-center py-20">
                <Text className="text-gray-500 text-lg">
                  No guests added yet.
                </Text>
                <TouchableOpacity
                  onPress={handleAddSplit}
                  className="mt-4 bg-blue-600 px-6 py-3 rounded-xl"
                >
                  <Text className="text-white font-bold">Add Guest 1</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </View>
  );
};

export default SplitByItemView;
