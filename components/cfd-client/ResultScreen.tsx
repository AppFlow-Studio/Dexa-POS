import { useCFDDisplayData } from "@/contexts/CFDDisplayDataContext";
import { colors } from "@/lib/theme";
import { Check, UtensilsCrossed, X } from "lucide-react-native";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

interface Props {
  success: boolean;
}

export function ResultScreen({ success }: Props) {
  const { branding, total, totalCash, totalCard, paymentMethod, tipAmount } = useCFDDisplayData();

  const isCash = paymentMethod === "cash";
  const displayTotal = isCash ? (totalCash || total) : (totalCard || total);
  const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconBox}>
            <UtensilsCrossed size={20} color={colors.teal} />
          </View>
          <Text style={styles.restaurantName}>
            {branding?.restaurantName ?? "Restaurant"}
          </Text>
        </View>
        <Text style={[styles.statusBadge, success ? styles.successBadge : styles.failBadge]}>
          {success ? "Payment Approved" : "Payment Declined"}
        </Text>
      </View>

      {/* Body */}
      <View style={styles.body}>
        {/* Icon circle */}
        <View style={[styles.iconCircle, success ? styles.successCircle : styles.failCircle]}>
          {success ? (
            <Check size={48} color={colors.screen} strokeWidth={3} />
          ) : (
            <X size={48} color={colors.screen} strokeWidth={3} />
          )}
        </View>

        {/* Title */}
        <Text style={[styles.title, success ? styles.successText : styles.failText]}>
          {success ? "Approved" : "Declined"}
        </Text>

        {/* Amount */}
        {success && displayTotal > 0 && (
          <Text style={styles.amount}>{formatCurrency(displayTotal)}</Text>
        )}

        {/* Tip line */}
        {success && tipAmount > 0 && (
          <Text style={styles.tipLine}>Including {formatCurrency(tipAmount)} tip</Text>
        )}

        {/* Subtitle */}
        <Text style={styles.subtitle}>
          {success ? "Thank you for your payment!" : "Please try a different payment method"}
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
  },
  statusBadge: {
    fontSize: 13,
    fontWeight: "600",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    overflow: "hidden",
  },
  successBadge: {
    color: colors.teal,
    backgroundColor: `${colors.teal}18`,
  },
  failBadge: {
    color: "#f87171",
    backgroundColor: "#f8717118",
  },
  body: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  successCircle: {
    backgroundColor: colors.teal,
  },
  failCircle: {
    backgroundColor: "#ef4444",
  },
  title: {
    fontSize: 56,
    fontWeight: "700",
    marginBottom: 8,
  },
  successText: {
    color: colors.teal,
  },
  failText: {
    color: "#f87171",
  },
  amount: {
    fontSize: 32,
    fontWeight: "600",
    color: colors.heading,
    marginBottom: 6,
  },
  tipLine: {
    fontSize: 15,
    color: colors.label,
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 18,
    color: colors.label,
    textAlign: "center",
    marginTop: 12,
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
