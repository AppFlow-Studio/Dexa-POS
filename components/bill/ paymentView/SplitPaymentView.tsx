import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import React, { useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { CartItem } from "@/lib/types";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { Minus } from "lucide-react-native";
type SplitOption = "Split Evenly" | "Split by Item" | "Custom Amount";
type PaymentType = "Card" | "Cash";

interface Split {
  id: number;
  amount: number;
  items: CartItem[];
  paymentType: PaymentType;
}

const SplitPaymentView = () => {
  const { activeOrderId, orders, activeOrderOutstandingTotal } =
    useOrderStore();
  const { close, setView } = usePaymentStore();

  const activeOrder = orders.find((o) => o.id === activeOrderId);
  const items = activeOrder?.items || [];

  // --- State Management ---
  const [splitOption, setSplitOption] = useState<SplitOption>("Split Evenly");
  const [numberOfPeople, setNumberOfPeople] = useState(2);
  const [splits, setSplits] = useState<Split[]>([]);
  const [unassignedItems, setUnassignedItems] = useState<CartItem[]>([]); // For "Split by Item"

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

  const billSummary = useMemo(() => {
    // Don't group items by name - preserve each unique item with its modifiers
    return items.map(item => ({
      name: item.name,
      quantity: item.quantity,
      totalPrice: item.price * item.quantity,
      // Include modifier info in the name for clarity
      displayName: (item.customizations.modifiers && item.customizations.modifiers.length > 0) || item.customizations.notes
        ? `${item.name}${item.customizations.notes ? ` (${item.customizations.notes})` : ''}${(item.customizations.modifiers && item.customizations.modifiers.length > 0) ? ` [${item.customizations.modifiers.map(m => m.categoryName).join(', ')}]` : ''}`
        : item.name
    }));
  }, [items]);

  const { activeOrderSubtotal, activeOrderTax, activeOrderDiscount } =
    useOrderStore();

  useEffect(() => {
    // Recalculate splits whenever the primary option changes
    if (splitOption === "Split Evenly") {
      const amountPerPerson = activeOrderOutstandingTotal / numberOfPeople;
      const newSplits = Array.from({ length: numberOfPeople }, (_, i) => ({
        id: i + 1,
        amount: amountPerPerson,
        items: [], // Not needed for "Split Evenly"
        paymentType: "Card" as PaymentType, // Default to Card
      }));
      setSplits(newSplits);
    } else if (splitOption === "Split by Item") {
      setUnassignedItems(items); // Start with all items unassigned
      setSplits(
        Array.from({ length: 2 }, (_, i) => ({
          id: i + 1,
          amount: 0,
          items: [],
          paymentType: "Card",
        }))
      );
    } else {
      // Custom Amount
      setSplits([
        {
          id: 1,
          amount: 0,
          items: [],
          paymentType: "Card",
        },
      ]);
    }
  }, [splitOption, numberOfPeople, activeOrderOutstandingTotal, items]);

  // Create a stable, string-based dependency for the item calculation effect
  const itemDependency = JSON.stringify(
    splits.map((s) => s.items.map((i) => i.id + i.quantity))
  );

  useEffect(() => {
    if (splitOption === "Split by Item") {
      setSplits((currentSplits) =>
        currentSplits.map((split) => {
          const newAmount = split.items.reduce(
            (acc, item) => acc + item.price * item.quantity,
            0
          );
          // Only update if the amount is actually different
          if (split.amount !== newAmount) {
            return { ...split, amount: newAmount };
          }
          return split;
        })
      );
    }
  }, [itemDependency, splitOption]);

  const totalPaid = splits.reduce((acc, split) => acc + split.amount, 0);
  const remainingBalance = activeOrderOutstandingTotal - totalPaid;

  const handleAssignItem = (itemToAssign: CartItem, targetSplitId: number) => {
    // Remove from unassigned
    setUnassignedItems((prev) =>
      prev.filter((item) => item.id !== itemToAssign.id)
    );
    // Add to the target split
    setSplits((prev) =>
      prev.map((split) =>
        split.id === targetSplitId
          ? { ...split, items: [...split.items, itemToAssign] }
          : split
      )
    );
  };

  const handleUnassignItem = (
    itemToUnassign: CartItem,
    sourceSplitId: number
  ) => {
    // Add back to unassigned
    setUnassignedItems((prev) => [...prev, itemToUnassign]);
    // Remove from the source split
    setSplits((prev) =>
      prev.map((split) =>
        split.id === sourceSplitId
          ? {
            ...split,
            items: split.items.filter(
              (item) => item.id !== itemToUnassign.id
            ),
          }
          : split
      )
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
    setUnassignedItems((prev) => [...prev, ...splitToRemove.items]);

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
            <Text className="text-2xl font-semibold text-accent-500 mb-3">
              Number of People:
            </Text>
            <View className="flex-row gap-3">
              {[2, 3, 4, 5, 6, 7, 8].map((num) => {
                const isSelected = numberOfPeople === num;
                return (
                  <TouchableOpacity
                    key={num}
                    onPress={() => setNumberOfPeople(num)}
                    className={`w-12 h-12 rounded-lg border items-center justify-center ${isSelected
                      ? "border-primary-400 bg-primary-400"
                      : "border-gray-300"
                      }`}
                  >
                    <Text
                      className={`text-2xl font-semibold ${isSelected ? "text-white" : "text-gray-600"
                        }`}
                    >
                      {num}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );
      case "Split by Item":
        return (
          <View className="mt-6 gap-y-4">
            {/* Unassigned Items Section */}
            <View>
              <Text className="text-2xl font-semibold text-accent-500 mb-3">
                Unassigned Items
              </Text>
              {unassignedItems.length > 0 ? (
                unassignedItems.map((item) => (
                  <View key={item.id} className="p-3 border-b border-gray-200">
                    <Text className="text-2xl font-semibold">
                      {item.name} (x{item.quantity})
                    </Text>
                    <View className="flex-row gap-2 mt-1">
                      {splits.map((split) => (
                        <TouchableOpacity
                          key={split.id}
                          onPress={() => handleAssignItem(item, split.id)}
                          className="py-2 px-3 bg-gray-200 rounded-md"
                        >
                          <Text className="text-xl font-bold text-gray-700">
                            To Split {split.id}
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
            {/* Assigned Items Section */}
            <View className="gap-y-4">
              {splits.map((split) => (
                <View
                  key={split.id}
                  className="p-4 bg-white border border-gray-200 rounded-lg"
                >
                  <View className="flex-row justify-between items-center mb-2">
                    <Text className="text-2xl font-bold text-primary-400 mb-2">
                      Split {split.id} - ${split.amount.toFixed(2)}
                    </Text>
                    {splits.length > 1 && ( // Only show remove button if there's more than one split
                      <TouchableOpacity
                        onPress={() => handleRemoveSplit(split)}
                        className="p-2 bg-red-100 rounded-full"
                      >
                        <Minus color="#ef4444" size={24} />
                      </TouchableOpacity>
                    )}
                  </View>
                  {split.items.map((item) => (
                    <View
                      key={item.id}
                      className="flex-row justify-between items-center"
                    >
                      <Text className="text-2xl text-gray-700">
                        {item.name} (x{item.quantity})
                      </Text>
                      <TouchableOpacity
                        onPress={() => handleUnassignItem(item, split.id)}
                      >
                        <Text className="text-xl text-red-500 font-semibold">
                          Unassign
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ))}
            </View>
            <TouchableOpacity
              onPress={handleAddSplit}
              className="py-3 border border-dashed border-gray-400 rounded-lg items-center"
            >
              <Text className="text-2xl font-bold text-gray-600">
                + Add Another Split
              </Text>
            </TouchableOpacity>
          </View>
        );
      case "Custom Amount":
        return (
          <View className="mt-6 gap-y-4">
            <Text className="text-2xl font-semibold text-accent-500 mb-2">
              Enter amount for each split:
            </Text>

            {splits.map((split, index) => {
              // Convert amount to string for the TextInput, handling the '0' case
              const displayValue =
                split.amount > 0 ? split.amount.toString() : "";

              return (
                <View
                  key={split.id}
                  className="flex-row items-center justify-between p-4 bg-white border border-gray-200 rounded-lg"
                >
                  <Text className="text-2xl font-bold text-primary-400 w-28">
                    Split {index + 1}
                  </Text>
                  <View className="flex-1 flex-row items-center bg-gray-100 rounded-md px-2">
                    <Text className="font-bold text-2xl text-gray-500">$</Text>
                    <TextInput
                      className="flex-1 p-3 text-2xl font-semibold text-right"
                      value={displayValue} // Use the string displayValue
                      onChangeText={(text) =>
                        handleCustomAmountChange(split.id, text)
                      }
                      placeholder="0.00"
                      keyboardType="decimal-pad" // Use decimal-pad for better UX
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
              );
            })}

            {/* Only show the "Add Split" button if the balance hasn't been met */}
            {remainingBalance > 0.005 && ( // Use a small epsilon for float comparison
              <TouchableOpacity
                onPress={handleAddSplitInCustomMode}
                className="py-3 border border-dashed border-gray-400 rounded-lg items-center"
              >
                <Text className="text-2xl font-bold text-gray-600">
                  + Add Another Split
                </Text>
              </TouchableOpacity>
            )}
          </View>
        );
    }
  };

  return (
    <View className="rounded-[36px] overflow-hidden bg-[#11111A]">
      {/* Dark Header */}
      <View className="p-6 rounded-t-[36px]">
        <Text className="text-3xl text-[#F1F1F1] font-bold">Split Payment</Text>
        <Text className="text-2xl text-[#F1F1F1] mt-1">Purchase</Text>
      </View>

      {/* White Content */}
      <View className="p-6 rounded-[36px] bg-background-100">
        <ScrollView
          className="max-h-[500px]"
          showsVerticalScrollIndicator={false}
        >
          {/* Bill Preview */}
          {billSummary.map((item, index) => (
            <View key={`${item.name}_${index}`} className="flex-row justify-between mb-1">
              <Text className="text-2xl font-semibold text-accent-500">
                {item.displayName}
              </Text>
              <Text className="text-2xl text-accent-500">
                ${item.totalPrice.toFixed(2)}
              </Text>
            </View>
          ))}

          {/* Totals Summary */}
          <View className="gap-y-3 mb-4 mt-4">
            <View className="flex-row justify-between">
              <Text className="text-2xl text-accent-500">Subtotal</Text>
              <Text className="text-2xl text-accent-500">
                ${activeOrderSubtotal.toFixed(2)}
              </Text>
            </View>
            {activeOrderDiscount > 0 && (
              <View className="flex-row justify-between">
                <Text className="text-2xl text-green-600">Discount</Text>
                <Text className="text-2xl text-green-600">
                  -${activeOrderDiscount.toFixed(2)}
                </Text>
              </View>
            )}
            <View className="flex-row justify-between">
              <Text className="text-2xl text-accent-500">Tax</Text>
              <Text className="text-2xl text-accent-500">
                ${activeOrderTax.toFixed(2)}
              </Text>
            </View>
          </View>

          {/* Total */}
          <View className="flex-row justify-between pt-4 border-dashed border-gray-300 mb-6">
            <Text className="text-3xl font-bold text-accent-500">Total</Text>
            <Text className="text-3xl font-bold text-accent-500">
              ${activeOrderOutstandingTotal.toFixed(2)}
            </Text>
          </View>

          {/* Split Options */}
          <View className="mt-6">
            <Text className="text-2xl font-semibold text-accent-500 mb-3">
              Split Options
            </Text>
            <View className="flex-row gap-3">
              {["Split Evenly", "Split by Item", "Custom Amount"].map((opt) => {
                const isSelected = splitOption === opt;
                return (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => setSplitOption(opt as SplitOption)}
                    className={`py-3 px-6 rounded-lg border ${isSelected
                      ? "border-primary-400 bg-primary-400"
                      : "border-gray-300"
                      }`}
                  >
                    <Text
                      className={`text-xl font-semibold ${isSelected ? "text-white" : "text-gray-600"
                        }`}
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
              <View key={split.id} className="flex-row items-center">
                <Text className="text-2xl font-semibold text-accent-500 w-24">
                  Split {split.id}:
                </Text>
                <View className="flex-row gap-3 items-center">
                  <TouchableOpacity
                    onPress={() => handleSetPaymentType(split.id, "Card")}
                    className={`py-3 px-6 rounded-lg border ${split.paymentType === "Card"
                      ? "border-primary-400 bg-primary-400"
                      : "border-gray-300"
                      }`}
                  >
                    <Text
                      className={`text-xl font-semibold ${split.paymentType === "Card"
                        ? "text-white"
                        : "text-gray-600"
                        }`}
                    >
                      Card
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleSetPaymentType(split.id, "Cash")}
                    className={`py-3 px-6 rounded-lg border ${split.paymentType === "Cash"
                      ? "border-primary-400 bg-primary-400"
                      : "border-gray-300"
                      }`}
                  >
                    <Text
                      className={`text-xl font-semibold ${split.paymentType === "Cash"
                        ? "text-white"
                        : "text-gray-600"
                        }`}
                    >
                      Cash
                    </Text>
                  </TouchableOpacity>
                  <Text className="text-2xl font-bold text-accent-500">
                    ${split.amount.toFixed(2)}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* Total Split Amount */}
          <View className="flex-row justify-between items-center mt-6">
            <Text className="text-2xl font-semibold text-accent-500">
              Total Split
            </Text>
            <Text className="text-3xl font-bold text-accent-500">
              ${activeOrderOutstandingTotal.toFixed(2)}
            </Text>
          </View>
        </ScrollView>

        {/* Actions */}
        <View className="flex-row gap-3 mt-6 border-t border-gray-200 pt-4">
          <TouchableOpacity
            onPress={handleNext}
            className="flex-1 py-4 bg-primary-400 rounded-lg items-center"
          >
            <Text className="text-2xl font-bold text-white">Next Split</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default SplitPaymentView;
