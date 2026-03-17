import { colors } from "@/lib/theme";
import { PaymentView, usePaymentStore } from "@/stores/usePaymentStore";
import { Banknote, CheckCircle2, Columns, CreditCard, Keyboard } from "lucide-react-native";
import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

type PaymentMethod = "Card Reader" | "Manual Key-in" | "Split" | "Cash";

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.screen },
  header: { alignItems: "center", paddingVertical: 20, paddingHorizontal: 16 },
  title: { fontSize: 20, fontWeight: "700", color: colors.heading, marginBottom: 4 },
  subtitle: { fontSize: 13, color: colors.muted },
  list: { gap: 10, paddingHorizontal: 16 },
  card: {
    flexDirection: "row", alignItems: "center", padding: 16,
    borderRadius: 14, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.panel,
  },
  cardActive: {
    borderColor: colors.teal,
    backgroundColor: `${colors.teal}10`,
  },
  iconBox: {
    width: 44, height: 44, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
    backgroundColor: `${colors.border}60`, marginRight: 14,
  },
  iconBoxActive: { backgroundColor: `${colors.teal}20` },
  methodTitle: { fontSize: 15, fontWeight: "600", color: colors.muted },
  methodTitleActive: { color: colors.heading },
  methodDesc: { fontSize: 12, color: colors.muted, marginTop: 2 },
  methodDescActive: { color: colors.teal },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.border },
  footer: {
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28,
    borderTopWidth: 1, borderTopColor: colors.border,
    backgroundColor: colors.screen, flexDirection: "row", gap: 12,
  },
  backBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.panel, alignItems: "center",
  },
  proceedBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    backgroundColor: colors.teal, alignItems: "center",
  },
});

const PaymentMethodSelectionView: React.FC = () => {
  const setView = usePaymentStore((s) => s.setView);
  const close = usePaymentStore((s) => s.close);
  const markPaymentAsDirty = usePaymentStore((s) => s.markPaymentAsDirty);
  const activeSplitId = usePaymentStore((s) => s.activeSplitId);
  const splits = usePaymentStore((s) => s.splits);
  const splitSourceView = usePaymentStore((s) => s.splitSourceView);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>("Card Reader");

  const activeSplit = splits.find((s) => s.id === activeSplitId);

  const paymentMethods = [
    { name: "Card Reader" as PaymentMethod, icon: CreditCard, title: "Card Reader", description: "Credit, Debit, or Corporate Cards", view: "card" as PaymentView },
    { name: "Manual Key-in" as PaymentMethod, icon: Keyboard, title: "Manual Key-in", description: "Manually enter card details", view: "manual" as PaymentView },
    { name: "Split" as PaymentMethod, icon: Columns, title: "Split Bill", description: "Split by amount, item, or evenly", view: "split-options" as PaymentView },
    { name: "Cash" as PaymentMethod, icon: Banknote, title: "Cash", description: "Standard cash transaction", view: "cash" as PaymentView },
  ];

  const availableMethods = paymentMethods.filter((m) => !(activeSplit && m.name === "Split"));

  const handleProceed = () => {
    const selected = availableMethods.find((p) => p.name === selectedMethod);
    if (selected) { markPaymentAsDirty(); setView(selected.view); }
  };

  const handleBack = () => {
    usePaymentStore.setState({ activeSplitId: null });
    setView(splitSourceView || "split-options");
  };

  return (
    <View style={styles.container}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>
            {activeSplit ? `Payment for ${activeSplit.customerName}` : "Select Payment Method"}
          </Text>
          <Text style={styles.subtitle}>
            {activeSplit ? `Amount Due: $${activeSplit.amount.toFixed(2)}` : "Choose how the customer would like to pay"}
          </Text>
        </View>

        <View style={styles.list}>
          {availableMethods.map((method) => {
            const isSelected = selectedMethod === method.name;
            const Icon = method.icon;
            return (
              <TouchableOpacity
                key={method.name}
                onPress={() => setSelectedMethod(method.name)}
                activeOpacity={0.8}
                style={[styles.card, isSelected && styles.cardActive]}
              >
                <View style={[styles.iconBox, isSelected && styles.iconBoxActive]}>
                  <Icon color={isSelected ? colors.teal : colors.label} size={20} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.methodTitle, isSelected && styles.methodTitleActive]}>{method.title}</Text>
                  <Text style={[styles.methodDesc, isSelected && styles.methodDescActive]}>{method.description}</Text>
                </View>
                <View style={{ marginLeft: 12 }}>
                  {isSelected
                    ? <CheckCircle2 size={22} color={colors.teal} fill={colors.teal} stroke={colors.screen} />
                    : <View style={styles.radio} />
                  }
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.backBtn} onPress={() => activeSplit ? handleBack() : close()}>
          <Text style={{ color: colors.muted, fontWeight: "600", fontSize: 15 }}>
            {activeSplit ? "Back" : "Cancel"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.proceedBtn} onPress={handleProceed}>
          <Text style={{ color: "#000", fontWeight: "700", fontSize: 15 }}>Proceed</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default PaymentMethodSelectionView;
