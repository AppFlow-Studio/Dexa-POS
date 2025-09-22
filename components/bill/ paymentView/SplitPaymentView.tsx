import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import React, { useEffect, useMemo, useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";

import { CartItem } from "@/lib/types";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { Minus } from "lucide-react-native";
import { ScrollView } from "react-native-gesture-handler";
type SplitOption = "Split Evenly" | "Split by Item" | "Custom Amount";
type PaymentType = "Card" | "Cash";

interface SplitItem {
  cartItem: CartItem;
  quantity: number; // The quantity of this item assigned to THIS split
  price: number; // Price per unit of the item
}

interface Split {
  id: number;
  amount: number;
  items: SplitItem[];
  paymentType: PaymentType;
}

const SplitPaymentView = () => {
  const { activeOrderId, orders, activeOrderOutstandingTotal } =
    useOrderStore();
  const { close, setView } = usePaymentStore();

  const activeOrder = orders.find((o) => o.id === activeOrderId);
  const originalItems = activeOrder?.items || [];

  // --- State Management ---
  const [splitOption, setSplitOption] = useState<SplitOption>("Split Evenly");
  const [numberOfPeople, setNumberOfPeople] = useState(2);
  const [splits, setSplits] = useState<Split[]>([]);
  const [unassignedQuantities, setUnassignedQuantities] = useState<
    Record<string, number>
  >({});

  const totalInCents = useMemo(
    () => Math.round(activeOrderOutstandingTotal * 100),
    [activeOrderOutstandingTotal]
  );

  // --- Core Logic ---
  const handleSetPaymentType = (splitId: number, type: PaymentType) => {
    setSplits((prevSplits) =>
      prevSplits.map((split) =>
        split.id === splitId ? { ...split, paymentType: type } : split
      )
    );
  };

  const { activeOrderSubtotal, activeOrderTax, activeOrderDiscount } =
    useOrderStore();

  useEffect(() => {
    // Initialize unassigned quantities when the component loads or items change
    const initialQuantities: Record<string, number> = {};
    originalItems.forEach((item) => {
      initialQuantities[item.id] = item.quantity;
    });
    setUnassignedQuantities(initialQuantities);
  }, [originalItems]);

  const itemDependency = JSON.stringify(
    splits.map((s) => s.items.map((i) => i.cartItem.id + i.quantity))
  );

  useEffect(() => {
    if (splitOption === "Split by Item") {
      setSplits((currentSplits) =>
        currentSplits.map((split) => {
          const splitSubtotal = split.items.reduce(
            (acc, splitItem) =>
              acc + splitItem.cartItem.price * splitItem.quantity,
            0
          );

          const proportionOfTotal =
            activeOrderSubtotal > 0 ? splitSubtotal / activeOrderSubtotal : 0;

          const splitTax = activeOrderTax * proportionOfTotal;
          const splitDiscount = activeOrderDiscount * proportionOfTotal;

          const newAmount = splitSubtotal + splitTax - splitDiscount;

          if (split.amount !== newAmount) {
            return { ...split, amount: newAmount };
          }
          return split;
        })
      );
    }
  }, [
    itemDependency,
    splitOption,
    activeOrderSubtotal,
    activeOrderTax,
    activeOrderDiscount,
  ]);

  useEffect(() => {
    if (splitOption === "Split by Item") {
      setSplits((currentSplits) =>
        currentSplits.map((split) => {
          // Calculate the subtotal for just the items in this split
          const splitSubtotal = split.items.reduce(
            (acc, item) => acc + item.price * item.quantity,
            0
          );

          // Determine this split's proportion of the total order subtotal
          const proportionOfTotal =
            activeOrderSubtotal > 0 ? splitSubtotal / activeOrderSubtotal : 0;

          // Calculate the proportional tax and discount for this split
          const splitTax = activeOrderTax * proportionOfTotal;
          const splitDiscount = activeOrderDiscount * proportionOfTotal;

          // Calculate the final amount for this split
          const newAmount = splitSubtotal + splitTax - splitDiscount;

          if (split.amount !== newAmount) {
            return { ...split, amount: newAmount };
          }
          return split;
        })
      );
    }
  }, [
    itemDependency,
    splitOption,
    activeOrderSubtotal,
    activeOrderTax,
    activeOrderDiscount,
  ]);

  const totalPaid = splits.reduce((acc, split) => acc + split.amount, 0);
  const remainingBalance = activeOrderOutstandingTotal - totalPaid;

  const handleAssignItem = (
    cartItem: CartItem,
    targetSplitId: number,
    quantityToAssign: number = 1
  ) => {
    // Decrease unassigned quantity
    setUnassignedQuantities((prev) => ({
      ...prev,
      [cartItem.id]: prev[cartItem.id] - quantityToAssign,
    }));

    // Add or update item in the target split
    setSplits((prevSplits) =>
      prevSplits.map((split) => {
        if (split.id === targetSplitId) {
          const existingItemIndex = split.items.findIndex(
            (item) => item.cartItem.id === cartItem.id
          );
          if (existingItemIndex > -1) {
            // Item already exists, just update quantity
            const updatedItems = [...split.items];
            updatedItems[existingItemIndex] = {
              ...updatedItems[existingItemIndex],
              quantity:
                updatedItems[existingItemIndex].quantity + quantityToAssign,
            };
            return { ...split, items: updatedItems };
          } else {
            // Add new item to the split
            return {
              ...split,
              items: [
                ...split.items,
                { cartItem, quantity: quantityToAssign, price: cartItem.price },
              ],
            };
          }
        }
        return split;
      })
    );
  };

  const handleUnassignItem = (splitItem: SplitItem, sourceSplitId: number) => {
    // Increase unassigned quantity
    setUnassignedQuantities((prev) => ({
      ...prev,
      [splitItem.cartItem.id]: prev[splitItem.cartItem.id] + splitItem.quantity,
    }));

    // Remove item from the source split
    setSplits((prevSplits) =>
      prevSplits.map((split) => {
        if (split.id === sourceSplitId) {
          return {
            ...split,
            items: split.items.filter(
              (item) => item.cartItem.id !== splitItem.cartItem.id
            ),
          };
        }
        return split;
      })
    );
  };

  const handleAddSplit = () => {
    const newId =
      splits.length > 0 ? Math.max(...splits.map((s) => s.id)) + 1 : 1;
    setSplits((prev) => [
      ...prev,
      { id: newId, amount: remainingBalance, items: [], paymentType: "Card" },
    ]);
  };

  const handleRemoveSplit = (splitToRemove: Split) => {
    // Don't allow removing the last split
    if (splits.length <= 1) {
      alert("Cannot remove the last split.");
      return;
    }

    // Return all items from the removed split back to the unassigned pool
    setUnassignedQuantities((prev) => {
      const updated = { ...prev };
      splitToRemove.items.forEach((item) => {
        updated[item.cartItem.id] =
          (updated[item.cartItem.id] || 0) + item.quantity;
      });
      return updated;
    });

    // Filter out the removed split from the main splits array
    setSplits((prev) => prev.filter((s) => s.id !== splitToRemove.id));
  };

  const handleCustomAmountChange = (splitId: number, textValue: string) => {
    // Sanitize the input to allow for a single decimal
    let sanitizedText = textValue.replace(/[^0-9.]/g, "");
    if ((sanitizedText.match(/\./g) || []).length > 1) return;
    if (sanitizedText === "") sanitizedText = "0";

    setSplits((currentSplits) =>
      currentSplits.map((split) =>
        split.id === splitId
          ? {
              ...split,
              amount: parseFloat(sanitizedText),
            }
          : split
      )
    );
  };

  const handleAddSplitInCustomMode = () => {
    const newId =
      splits.length > 0 ? Math.max(...splits.map((s) => s.id)) + 1 : 1;
    // Auto-fill with the remaining balance in DOLLARS
    setSplits((prev) => [
      ...prev,
      {
        id: newId,
        amount: parseFloat(remainingBalance.toFixed(2)),
        items: [],
        paymentType: "Card",
      },
    ]);
  };

  const handleNext = () => {
    if (splitOption === "Custom Amount") {
      const totalSplitAmount = splits.reduce(
        (acc, split) => acc + split.amount,
        0
      );
      if (totalSplitAmount > activeOrderOutstandingTotal + 0.001) {
        toast.error("split total cannot exceed the outstanding amount.", {
          position: ToastPosition.BOTTOM,
        });
        return;
      }
    }
    setView("success");
  };

  const renderSplitContent = () => {
    switch (splitOption) {
      case "Split Evenly":
        return (
          <View className="mt-6">
            <Text className="text-2xl font-semibold text-gray-300 mb-3">
              Number of People:
            </Text>
            <View className="flex-row gap-3">
              {[2, 3, 4, 5, 6, 7, 8].map((num) => (
                <TouchableOpacity
                  key={num}
                  onPress={() => setNumberOfPeople(num)}
                  className={`w-16 h-16 rounded-lg border items-center justify-center ${numberOfPeople === num ? "border-blue-500 bg-blue-900/30" : "border-gray-600"}`}
                >
                  <Text
                    className={`text-2xl font-semibold ${numberOfPeople === num ? "text-blue-400" : "text-gray-300"}`}
                  >
                    {num}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );
      case "Split by Item":
        const unassignedItemsToDisplay = originalItems.filter(
          (item) => unassignedQuantities[item.id] > 0
        );
        return (
          <View className="mt-6 gap-y-4">
            <View>
              <Text className="text-2xl font-semibold text-gray-300 mb-3">
                Unassigned Items
              </Text>
              {unassignedItemsToDisplay.length > 0 ? (
                unassignedItemsToDisplay.map((item) => (
                  <View key={item.id} className="p-3 border-b border-gray-700">
                    <Text className="text-2xl font-semibold text-white">
                      {item.name} (Unassigned: {unassignedQuantities[item.id]})
                    </Text>
                    <View className="flex-row gap-2 mt-2">
                      {splits.map((split) => (
                        <TouchableOpacity
                          key={split.id}
                          onPress={() => handleAssignItem(item, split.id)}
                          className="py-2 px-3 bg-gray-600 rounded-md"
                        >
                          <Text className="text-xl font-bold text-white">
                            +1 to Split {split.id}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ))
              ) : (
                <Text className="text-xl text-gray-500">
                  All items have been assigned.
                </Text>
              )}
            </View>
            <View className="gap-y-4">
              {splits.map((split) => (
                <View
                  key={split.id}
                  className="p-4 bg-[#212121] border border-gray-700 rounded-lg"
                >
                  <View className="flex-row justify-between items-center mb-2">
                    <Text className="text-2xl font-bold text-blue-400 mb-2">
                      Split {split.id} - ${split.amount.toFixed(2)}
                    </Text>
                    {splits.length > 1 && (
                      <TouchableOpacity
                        onPress={() => handleRemoveSplit(split)}
                        className="p-2 bg-red-900/30 rounded-full"
                      >
                        <Minus color="#ef4444" size={24} />
                      </TouchableOpacity>
                    )}
                  </View>
                  {split.items.map((splitItem) => (
                    <View
                      key={splitItem.cartItem.id}
                      className="flex-row justify-between items-center"
                    >
                      <Text className="text-2xl text-gray-300">
                        {splitItem.cartItem.name} (x{splitItem.quantity})
                      </Text>
                      <TouchableOpacity
                        onPress={() => handleUnassignItem(splitItem, split.id)}
                      >
                        <Text className="text-xl text-red-500 font-semibold">
                          Unassign All
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ))}
            </View>
            <TouchableOpacity
              onPress={handleAddSplit}
              className="py-3 border border-dashed border-gray-500 rounded-lg items-center"
            >
              <Text className="text-2xl font-bold text-gray-400">
                + Add Another Split
              </Text>
            </TouchableOpacity>
          </View>
        );
      case "Custom Amount":
        return (
          <View className="mt-6 gap-y-4">
            <Text className="text-2xl font-semibold text-gray-300 mb-2">
              Enter amount for each split:
            </Text>
            {splits.map((split, index) => (
              <View
                key={split.id}
                className="flex-row items-center justify-between p-4 bg-[#212121] border border-gray-700 rounded-lg"
              >
                <Text className="text-2xl font-bold text-blue-400 w-28">
                  Split {index + 1}
                </Text>
                <View className="flex-1 flex-row items-center bg-[#303030] rounded-md px-2 border border-gray-600">
                  <Text className="font-bold text-2xl text-gray-400">$</Text>
                  <TextInput
                    className="flex-1 p-3 text-2xl font-semibold text-right text-white"
                    value={split.amount > 0 ? split.amount.toString() : ""}
                    onChangeText={(text) =>
                      handleCustomAmountChange(split.id, text)
                    }
                    placeholder="0.00"
                    placeholderTextColor="#6B7280"
                    keyboardType="decimal-pad"
                  />
                </View>
                {splits.length > 1 && (
                  <TouchableOpacity
                    onPress={() => handleRemoveSplit(split)}
                    className="p-2 ml-2"
                  >
                    <Minus color="#ef4444" size={24} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
            {remainingBalance > 0.005 && (
              <TouchableOpacity
                onPress={handleAddSplitInCustomMode}
                className="py-3 border border-dashed border-gray-500 rounded-lg items-center"
              >
                <Text className="text-2xl font-bold text-gray-400">
                  + Add Split for Remaining ${remainingBalance.toFixed(2)}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        );
    }
  };

  return (
    <View className="rounded-2xl overflow-hidden bg-[#212121] border border-gray-700 w-[600px]">
      {/* Dark Header */}
      <View className="p-8">
        <Text className="text-3xl text-white font-bold text-center">
          Split Payment
        </Text>
      </View>

      {/* Dark Content */}
      <View className="p-8 bg-[#303030] rounded-b-2xl">
        <ScrollView
          className="max-h-[800px]"
          showsVerticalScrollIndicator={false}
        >
          {/* Total */}
          <View className="flex-row justify-between pt-4 border-t border-dashed border-gray-600 mb-6">
            <Text className="text-3xl font-bold text-white">Total</Text>
            <Text className="text-3xl font-bold text-white">
              ${activeOrderOutstandingTotal.toFixed(2)}
            </Text>
          </View>

          {/* Split Options */}
          <View>
            <Text className="text-2xl font-semibold text-gray-300 mb-3">
              Split Options
            </Text>
            <View className="flex-row gap-4">
              {(
                [
                  "Split Evenly",
                  "Split by Item",
                  "Custom Amount",
                ] as SplitOption[]
              ).map((opt) => {
                const isSelected = splitOption === opt;
                return (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => setSplitOption(opt)}
                    className={`flex-1 py-4 rounded-xl border ${isSelected ? "border-blue-500 bg-blue-900/30" : "border-gray-600"}`}
                  >
                    <Text
                      className={`text-xl font-semibold text-center ${isSelected ? "text-blue-400" : "text-gray-300"}`}
                    >
                      {opt}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {renderSplitContent()}

          {/* Split Details */}
          <View className="mt-6 gap-y-4">
            {splits.map((split) => (
              <View
                key={split.id}
                className="flex-row items-center p-3 bg-[#212121] border border-gray-700 rounded-lg"
              >
                <Text className="text-2xl font-semibold text-white w-32">
                  Split {split.id}:
                </Text>
                <View className="flex-1">
                  <Text className="text-2xl font-bold text-white text-right">
                    ${split.amount.toFixed(2)}
                  </Text>
                </View>
                <View className="flex-row gap-3 items-center ml-6">
                  <TouchableOpacity
                    onPress={() => handleSetPaymentType(split.id, "Card")}
                    className={`py-3 px-6 rounded-lg border ${split.paymentType === "Card" ? "border-blue-500 bg-blue-600" : "border-gray-600"}`}
                  >
                    <Text
                      className={`text-xl font-semibold ${split.paymentType === "Card" ? "text-white" : "text-gray-300"}`}
                    >
                      Card
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleSetPaymentType(split.id, "Cash")}
                    className={`py-3 px-6 rounded-lg border ${split.paymentType === "Cash" ? "border-blue-500 bg-blue-600" : "border-gray-600"}`}
                  >
                    <Text
                      className={`text-xl font-semibold ${split.paymentType === "Cash" ? "text-white" : "text-gray-300"}`}
                    >
                      Cash
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>

          {/* Remaining Balance */}
          <View
            className={`flex-row justify-between items-center mt-6 p-4 rounded-lg ${Math.abs(remainingBalance) < 0.01 ? "bg-green-900/30" : "bg-red-900/30"}`}
          >
            <Text className="text-2xl font-semibold text-white">
              Remaining Balance
            </Text>
            <Text
              className={`text-3xl font-bold ${Math.abs(remainingBalance) < 0.01 ? "text-green-400" : "text-red-400"}`}
            >
              ${remainingBalance.toFixed(2)}
            </Text>
          </View>

          {/* Actions */}
          <View className="flex-row gap-4 mt-6 border-t border-gray-700 pt-6">
            <TouchableOpacity
              onPress={close}
              className="flex-1 py-4 bg-[#303030] border border-gray-600 rounded-xl items-center"
            >
              <Text className="text-2xl font-bold text-white">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleNext}
              disabled={Math.abs(remainingBalance) > 0.01}
              className={`flex-1 py-4 rounded-xl items-center ${Math.abs(remainingBalance) > 0.01 ? "bg-gray-500" : "bg-blue-600"}`}
            >
              <Text className="text-2xl font-bold text-white">
                Confirm & Pay
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </View>
  );
};

export default SplitPaymentView;
