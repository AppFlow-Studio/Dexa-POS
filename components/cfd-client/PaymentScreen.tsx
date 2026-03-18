import { useCFDDisplayData } from "@/contexts/CFDDisplayDataContext";
import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

interface Props {
  processing?: boolean;
}

export function PaymentScreen({ processing }: Props) {
  const { total, outstandingTotal, amountPaid } = useCFDDisplayData();

  const amountDue = amountPaid > 0 ? outstandingTotal : total;
  const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <View style={styles.container}>
      {processing ? (
        <>
          <ActivityIndicator
            size="large"
            color="#10b981"
            style={styles.spinner}
          />
          <Text style={styles.title}>Processing...</Text>
        </>
      ) : (
        <>
          <Text style={styles.title}>Please Present Card</Text>
          <Text style={styles.amount}>{formatCurrency(amountDue)}</Text>
          <Text style={styles.hint}>Tap, insert, or swipe your card</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
  spinner: { marginBottom: 24 },
  title: {
    fontSize: 36,
    fontWeight: "600",
    color: "#ffffff",
    marginBottom: 16,
  },
  amount: {
    fontSize: 64,
    fontWeight: "700",
    color: "#10b981",
    marginBottom: 24,
  },
  hint: { fontSize: 18, color: "#6b7280" },
});
