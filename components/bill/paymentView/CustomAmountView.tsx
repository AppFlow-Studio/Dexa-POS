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
      style={{ flex: 1, backgroundColor: colors.screen }}
    >
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <TouchableOpacity
          onPress={() => setView("split-options")}
          style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", marginRight: 14 }}
        >
          <ArrowLeft size={18} color={colors.label} />
        </TouchableOpacity>
        <View>
          <Text style={{ fontSize: 18, fontWeight: "700", color: colors.heading }}>Custom Amounts</Text>
          <Text style={{ fontSize: 12, color: colors.muted }}>Manually assign amounts to each guest.</Text>
        </View>
      </View>

      <View style={{ flex: 1, flexDirection: "row", padding: 20, gap: 16 }}>
        {/* LEFT: Summary */}
        <View style={{ width: "33%", backgroundColor: colors.panel, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 20, justifyContent: "space-between" }}>
          <View>
            <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 20 }}>Summary</Text>

            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 14 }}>
              <Text style={{ color: colors.muted, fontSize: 15 }}>Total Bill</Text>
              <Text style={{ color: colors.heading, fontWeight: "700", fontSize: 15 }}>${effectiveTotal.toFixed(2)}</Text>
            </View>

            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ color: colors.muted, fontSize: 15 }}>Allocated</Text>
              <Text style={{ color: colors.teal, fontWeight: "700", fontSize: 15 }}>${totalAllocated.toFixed(2)}</Text>
            </View>

            <View>
              <Text style={{ color: colors.muted, fontSize: 15, marginBottom: 6 }}>Remaining</Text>
              <Text style={{ fontSize: 40, fontWeight: "700", color: isPerfect ? colors.success : isOver ? colors.danger : colors.heading }}>
                ${Math.abs(remaining).toFixed(2)}
              </Text>
              {isOver && <Text style={{ color: colors.danger, fontSize: 12, marginTop: 6 }}>Exceeds bill by ${Math.abs(remaining).toFixed(2)}</Text>}
              {isPerfect && <Text style={{ color: colors.success, fontSize: 12, marginTop: 6 }}>Perfectly split!</Text>}
            </View>
          </View>

          <View style={{ gap: 12 }}>
            {!canProceed && (
              <View style={{ backgroundColor: colors.screen, padding: 14, borderRadius: 12 }}>
                <Text style={{ color: colors.muted, fontSize: 13, textAlign: "center" }}>Assign amounts to enable payment.</Text>
              </View>
            )}
            {canProceed && !isPerfect && (
              <View style={{ backgroundColor: colors.screen, padding: 14, borderRadius: 12 }}>
                <Text style={{ color: "#F59E0B", fontSize: 13, textAlign: "center" }}>${remaining.toFixed(2)} remaining will stay unpaid.</Text>
              </View>
            )}

            <TouchableOpacity
              onPress={handleProceed}
              disabled={!canProceed}
              style={{
                width: "100%", paddingVertical: 16, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                backgroundColor: canProceed ? colors.teal : colors.screen,
                borderWidth: canProceed ? 0 : 1, borderColor: colors.border,
                opacity: canProceed ? 1 : 0.6,
              }}
            >
              {canProceed
                ? <Check size={18} color="#000" />
                : <ArrowRight size={18} color={colors.muted} />
              }
              <Text style={{ fontWeight: "700", fontSize: 15, color: canProceed ? "#000" : colors.muted }}>
                {isPerfect ? "Finalize Split" : "Pay Allocated Amount"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* RIGHT: Guest List */}
        <View style={{ flex: 1, backgroundColor: colors.panel, borderRadius: 20, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
          <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 }}>Guest List</Text>
            <TouchableOpacity
              onPress={handleAddGuest}
              style={{ width: 32, height: 32, backgroundColor: colors.screen, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}
            >
              <Plus size={18} color={colors.teal} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 14 }}>
            {splits.map((split) => (
              <View
                key={split.id}
                style={{ flexDirection: "row", alignItems: "center", marginBottom: 10, backgroundColor: colors.screen, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", flex: 1, marginRight: 12 }}>
                  <View style={{ width: 36, height: 36, backgroundColor: colors.panel, borderRadius: 18, alignItems: "center", justifyContent: "center", marginRight: 10 }}>
                    <User size={16} color={colors.muted} />
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: colors.label, width: 90 }} numberOfLines={1}>
                    {split.customerName}
                  </Text>
                </View>

                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  {remaining > 0 && (
                    <TouchableOpacity
                      onPress={() => handleFillRemaining(split.id)}
                      style={{ backgroundColor: `${colors.teal}15`, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: `${colors.teal}40` }}
                    >
                      <Text style={{ color: colors.teal, fontSize: 12, fontWeight: "700" }}>Fill</Text>
                    </TouchableOpacity>
                  )}

                  <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.panel, borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, width: 140, height: 52 }}>
                    <Text style={{ fontWeight: "700", fontSize: 18, color: colors.muted, marginRight: 4 }}>$</Text>
                    <TextInput
                      style={{ flex: 1, fontSize: 18, fontWeight: "700", color: colors.heading, textAlign: "right", height: "100%" }}
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
                    style={{ padding: 10, backgroundColor: colors.screen, borderRadius: 10 }}
                  >
                    <Trash2 size={18} color={colors.muted} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            {splits.length === 0 && (
              <View style={{ alignItems: "center", paddingVertical: 60 }}>
                <Text style={{ color: colors.muted }}>No guests added.</Text>
                <TouchableOpacity
                  onPress={handleAddGuest}
                  style={{ marginTop: 16, backgroundColor: colors.teal, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
                >
                  <Text style={{ color: "#000", fontWeight: "700" }}>Add Guest</Text>
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
