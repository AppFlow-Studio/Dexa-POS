import { colors } from "@/lib/theme";
import { useActiveOrderTotals } from "@/stores/selectors/orderSelectors";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Plus,
  Trash2,
  User,
} from "lucide-react-native";
import React, { useMemo } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const CustomAmountView = () => {
  const splits = usePaymentStore((s) => s.splits);
  const updateSplitAmount = usePaymentStore((s) => s.updateSplitAmount);
  const setView = usePaymentStore((s) => s.setView);
  const addSplit = usePaymentStore((s) => s.addSplit);
  const removeSplit = usePaymentStore((s) => s.removeSplit);
  const startSplitPaymentFlow = usePaymentStore((s) => s.startSplitPaymentFlow);
  const orderTotals = useActiveOrderTotals();
  const activeOrderOutstandingTotal = orderTotals?.amountDue ?? 0;
  const activeOrderTotal = orderTotals?.total ?? 0;

  // Check if order already has payments (for effectiveTotal fallback)
  const activeOrder = useOrderStore((s) =>
    s.activeOrderId ? s.ordersById[s.activeOrderId] : null
  );
  const hasPayments = (activeOrder?.payments ?? []).some(p => !p.isVoided);

  // Fallback to activeOrderTotal only if no payments exist (handles async timing)
  // If payments exist and outstanding is 0, the order is fully paid — don't show full total
  const effectiveTotal =
    activeOrderOutstandingTotal > 0
      ? activeOrderOutstandingTotal
      : hasPayments ? 0 : activeOrderTotal;

  // --- MATH LOGIC ---
  const totalAllocated = useMemo(() => {
    return splits.reduce((sum, split) => sum + (split.amount || 0), 0);
  }, [splits]);

  const remaining = effectiveTotal - totalAllocated;

  // Logic to determine status color
  const isPerfect = Math.abs(remaining) < 0.01;
  const isOver = remaining < -0.01;
  // Allow proceeding with any positive allocation that doesn't exceed total
  const canProceed = totalAllocated > 0.01 && !isOver;

  const statusColor = isPerfect
    ? "text-green-400"
    : isOver
      ? "text-red-400"
      : "text-white";

  const handleAddGuest = () => {
    addSplit(`Guest ${splits.length + 1}`);
  };

  const handleFillRemaining = (splitId: string) => {
    if (remaining > 0) {
      const currentAmount = splits.find((s) => s.id === splitId)?.amount || 0;
      updateSplitAmount(
        splitId,
        parseFloat((currentAmount + remaining).toFixed(2))
      );
    }
  };

  const handleProceed = () => {
    // START THE PAYMENT LOOP HERE
    startSplitPaymentFlow("split-custom-amount");
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "padding"}
      className="flex-1 bg-panel"
    >
      {/* Header */}
      <View className="flex-row items-center p-4 border-b border-border">
        <TouchableOpacity
          onPress={() => setView("split-options")}
          className="p-2 bg-surface rounded-lg mr-4"
        >
          <ArrowLeft size={20} color="white" />
        </TouchableOpacity>
        <View>
          <Text className="text-2xl font-bold text-white">Custom Amounts</Text>
          <Text className="text-gray-400">
            Manually assign amounts to each guest.
          </Text>
        </View>
      </View>

      <View className="flex-1 flex-row p-6 gap-6">
        {/* LEFT PANEL: The Math & Actions (Sticky) */}
        <View className="w-1/3 bg-surface rounded-3xl border border-border p-6 justify-between">
          <View>
            <Text className="text-gray-500 uppercase tracking-widest text-xs font-bold mb-6">
              Summary
            </Text>

            {/* Total Bill */}
            <View className="flex-row justify-between mb-4">
              <Text className="text-gray-400 text-lg">Total Bill</Text>
              <Text className="text-white font-bold text-lg">
                ${effectiveTotal.toFixed(2)}
              </Text>
            </View>

            {/* Allocated */}
            <View className="flex-row justify-between mb-4 pb-4 border-b border-border">
              <Text className="text-gray-400 text-lg">Allocated</Text>
              <Text className="text-teal font-bold text-lg">
                ${totalAllocated.toFixed(2)}
              </Text>
            </View>

            {/* Remaining */}
            <View>
              <Text className="text-gray-400 text-lg mb-1">Remaining</Text>
              <Text className={`text-5xl font-bold ${statusColor}`}>
                {isOver ? "" : ""}
                {/* Handle negative sign via styling or logic if needed */}$
                {Math.abs(remaining).toFixed(2)}
              </Text>
              {isOver && (
                <Text className="text-red-400 text-sm mt-2">
                  Total exceeds bill amount by ${Math.abs(remaining).toFixed(2)}
                </Text>
              )}
              {isPerfect && (
                <Text className="text-green-400 text-sm mt-2">
                  Perfectly split!
                </Text>
              )}
            </View>
          </View>

          {/* Bottom Actions Area */}
          <View className="gap-4">
            {/* Hint */}
            {!canProceed && (
              <View className="bg-surface p-4 rounded-xl">
                <Text className="text-gray-400 text-sm text-center">
                  Assign amounts to enable payment.
                </Text>
              </View>
            )}
            {canProceed && !isPerfect && (
              <View className="bg-surface p-4 rounded-xl">
                <Text className="text-yellow-400 text-sm text-center">
                  ${remaining.toFixed(2)} remaining will stay unpaid.
                </Text>
              </View>
            )}

            {/* Next Step Button */}
            <TouchableOpacity
              onPress={handleProceed}
              disabled={!canProceed}
              className={`w-full py-4 rounded-xl flex-row items-center justify-center shadow-lg
                        ${canProceed ? "bg-teal shadow-teal/20 active:bg-teal/80" : "bg-surface opacity-80"}`}
            >
              {canProceed ? (
                <Check size={20} color="white" className="mr-2" />
              ) : (
                <ArrowRight size={20} color={colors.label} className="mr-2" />
              )}
              <Text
                className={`font-bold text-lg ${canProceed ? "text-white" : "text-gray-400"}`}
              >
                {isPerfect ? "Finalize Split" : "Pay Allocated Amount"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* RIGHT PANEL: The Inputs (Scrollable) */}
        <View className="flex-1 bg-panel rounded-3xl border border-border overflow-hidden">
          <View className="p-4 border-b border-border bg-surface flex-row justify-between items-center">
            <Text className="text-gray-400 font-bold uppercase tracking-wider text-xs">
              Guest List
            </Text>
            <TouchableOpacity
              onPress={handleAddGuest}
              className="bg-surface p-2 rounded-lg border border-border"
            >
              <Plus size={20} color="white" />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {splits.map((split) => (
              <View
                key={split.id}
                className="flex-row items-center mb-3 bg-surface p-3 rounded-2xl border border-border"
              >
                {/* Icon & Name */}
                <View className="flex-row items-center flex-1 mr-4">
                  <View className="w-10 h-10 bg-surface rounded-full items-center justify-center mr-3">
                    <User size={18} color={colors.muted} />
                  </View>
                  <Text
                    className="text-lg font-bold text-gray-200 w-24"
                    numberOfLines={1}
                  >
                    {split.customerName}
                  </Text>
                </View>

                {/* Input Area */}
                <View className="flex-row items-center gap-3">
                  {/* Auto-Fill Button */}
                  {remaining > 0 && (
                    <TouchableOpacity
                      onPress={() => handleFillRemaining(split.id)}
                      className="bg-teal/10 px-3 py-2 rounded-lg border border-teal/30"
                    >
                      <Text className="text-teal text-xs font-bold">
                        Fill
                      </Text>
                    </TouchableOpacity>
                  )}

                  <View className="flex-row items-center bg-panel rounded-xl px-4 border border-border w-40 h-14">
                    <Text className="font-bold text-xl text-gray-500 mr-1">
                      $
                    </Text>
                    <TextInput
                      className="flex-1 text-xl font-bold text-white text-right h-full"
                      value={split.amount > 0 ? split.amount.toString() : ""}
                      onChangeText={(text) => {
                        if ((text.match(/\./g) || []).length > 1) return;
                        const amount = parseFloat(text);
                        updateSplitAmount(split.id, isNaN(amount) ? 0 : amount);
                      }}
                      placeholder="0.00"
                      placeholderTextColor={colors.muted}
                      keyboardType="decimal-pad"
                      selectTextOnFocus
                    />
                  </View>

                  <TouchableOpacity
                    onPress={() => removeSplit(split.id)}
                    className="p-3 bg-surface rounded-xl"
                  >
                    <Trash2 size={20} color={colors.muted} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            {splits.length === 0 && (
              <View className="items-center py-20">
                <Text className="text-gray-500">No guests added.</Text>
                <TouchableOpacity
                  onPress={handleAddGuest}
                  className="mt-4 bg-teal px-6 py-3 rounded-xl"
                >
                  <Text className="text-white font-bold">Add Guest</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

export default CustomAmountView;
