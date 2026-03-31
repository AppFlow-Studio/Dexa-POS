import { useCFDDisplayData } from "@/contexts/CFDDisplayDataContext";
import { colors } from "@/lib/theme";
import { Banknote, CreditCard, UtensilsCrossed } from "lucide-react-native";
import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

export function PaymentScreen({ processing }: { processing?: boolean }) {
  const {
    branding,
    orderType,
    tableName,
    serverName,
    orderNumber,
    customerName,
    total,
    totalCash,
    totalCard,
    outstandingTotal,
    amountPaid,
    tipAmount,
    savingsAmount,
    paymentMethod,
  } = useCFDDisplayData();

  const isCash = paymentMethod === "cash";
  const amountDue = isCash
    ? amountPaid > 0
      ? outstandingTotal
      : totalCash || total
    : amountPaid > 0
      ? outstandingTotal
      : totalCard || total;

  const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconBox}>
            <UtensilsCrossed size={20} color={colors.teal} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.restaurantName}>
              {branding?.restaurantName ?? "Restaurant"}
            </Text>
            <Text style={styles.headerSubtitle}>
              {orderType?.toUpperCase()}
              {tableName
                ? ` · Table ${tableName}`
                : serverName
                  ? ` · ${serverName}`
                  : ""}
            </Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.paymentMethodLabel}>
            {isCash ? "Cash Payment" : "Card Payment"}
          </Text>
          <Text style={styles.headerSubtitle}>
            {isCash ? "Hand cash to cashier" : "Present card to terminal"}
          </Text>
        </View>
      </View>

      {/* Body */}
      <View style={styles.body}>
        {/* Payment method icon */}
        <View style={styles.iconCircle}>
          {processing && !isCash ? (
            <ActivityIndicator size="large" color={colors.teal} />
          ) : isCash ? (
            <Banknote size={40} color={colors.teal} />
          ) : (
            <CreditCard size={40} color={colors.teal} />
          )}
        </View>

        {/* Amount */}
        <Text style={styles.amount}>{formatCurrency(amountDue)}</Text>

        {/* Tip line */}
        {tipAmount > 0 && (
          <Text style={styles.tipLine}>
            Including {formatCurrency(tipAmount)} tip
          </Text>
        )}

        {/* Savings line */}
        {isCash && savingsAmount > 0 && (
          <Text style={styles.savingsLine}>
            You saved {formatCurrency(savingsAmount)}
          </Text>
        )}

        {/* Instruction */}
        <Text style={styles.instruction}>
          {processing && !isCash
            ? "Processing payment..."
            : isCash
              ? "Please hand cash to the cashier"
              : processing
                ? "Processing payment..."
                : "Tap, insert, or swipe your card"}
        </Text>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Powered by DEXA</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.screen,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.panel,
  },
  headerLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  restaurantName: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.heading,
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: "500",
    color: colors.label,
  },
  headerRight: {
    alignItems: "flex-end",
  },
  paymentMethodLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.teal,
    marginBottom: 2,
  },
  body: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 32,
  },
  amount: {
    fontSize: 72,
    fontWeight: "700",
    color: colors.teal,
    marginBottom: 12,
  },
  tipLine: {
    fontSize: 16,
    color: colors.label,
    marginBottom: 8,
  },
  savingsLine: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.teal,
    marginBottom: 16,
  },
  instruction: {
    fontSize: 20,
    fontWeight: "500",
    color: colors.heading,
    textAlign: "center",
    marginTop: 8,
  },
  footer: {
    paddingVertical: 16,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerText: {
    fontSize: 12,
    color: colors.label,
    fontWeight: "500",
  },
});
