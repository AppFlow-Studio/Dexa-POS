import { useCFDDisplayData } from "@/contexts/CFDDisplayDataContext";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

interface Props {
  onTipSelected: (tipAmount: number, tipPercentage: number | null) => void;
}

export function TipSelectionScreen({ onTipSelected }: Props) {
  const {
    tipConfig,
    branding,
    tipAmount: externalTipAmount,
    tipPercentage: externalTipPercentage,
  } = useCFDDisplayData();
  const [selectedPercentage, setSelectedPercentage] = useState<number | null>(
    null,
  );
  const [customAmount, setCustomAmount] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  useEffect(() => {
    setSelectedPercentage(externalTipPercentage);
    if (externalTipPercentage === null && externalTipAmount > 0) {
      setCustomAmount((externalTipAmount / 100).toFixed(2));
      setShowCustom(true);
    } else if (externalTipAmount === 0) {
      setCustomAmount("");
      setShowCustom(false);
    }
  }, [externalTipPercentage, externalTipAmount]);

  const subtotal = tipConfig?.subtotalForTip ?? 0;
  const presets = tipConfig?.presetPercentages ?? [15, 18, 20, 25];

  const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const handlePresetSelect = (percentage: number) => {
    setSelectedPercentage(percentage);
    setShowCustom(false);
    const amount = Math.round(subtotal * (percentage / 100));
    onTipSelected(amount, percentage);
  };

  const handleNoTip = () => {
    setSelectedPercentage(null);
    setCustomAmount("");
    setShowCustom(false);
    onTipSelected(0, 0);
  };

  const handleConfirmCustom = () => {
    const amount = Math.round(parseFloat(customAmount) * 100) || 0;
    onTipSelected(amount, null);
  };

  const isSynced =
    (selectedPercentage !== null &&
      selectedPercentage === externalTipPercentage) ||
    (showCustom &&
      Math.round(parseFloat(customAmount) * 100) === externalTipAmount);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Add a Tip?</Text>
        <Text style={styles.subtitle}>
          For your service at {branding?.restaurantName ?? "the restaurant"}
        </Text>
      </View>

      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Order Total</Text>
        <Text style={styles.totalAmount}>{formatCurrency(subtotal)}</Text>
      </View>

      <View style={styles.presetsGrid}>
        {presets.map((pct) => {
          const tipAmount = Math.round(subtotal * (pct / 100));
          const isSelected = selectedPercentage === pct && !showCustom;
          return (
            <Pressable
              key={pct}
              onPress={() => handlePresetSelect(pct)}
              style={[
                styles.presetCard,
                isSelected && styles.presetCardSelected,
              ]}
            >
              <Text
                style={[
                  styles.presetPct,
                  isSelected && styles.presetTextSelected,
                ]}
              >
                {pct}%
              </Text>
              <Text
                style={[
                  styles.presetAmt,
                  isSelected && styles.presetTextSelected,
                ]}
              >
                {formatCurrency(tipAmount)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {tipConfig?.allowCustom && (
        <View style={styles.customSection}>
          <Pressable
            onPress={() => {
              setShowCustom(true);
              setSelectedPercentage(null);
            }}
            style={[
              styles.customToggle,
              showCustom && styles.customToggleActive,
            ]}
          >
            {showCustom ? (
              <View style={styles.customInputWrapper}>
                <Text style={styles.currencySymbol}>$</Text>
                <TextInput
                  value={customAmount}
                  onChangeText={setCustomAmount}
                  onBlur={handleConfirmCustom}
                  keyboardType="decimal-pad"
                  style={styles.customInput}
                  placeholder="0.00"
                  placeholderTextColor="#525252"
                  autoFocus
                />
                <Pressable
                  onPress={handleConfirmCustom}
                  style={styles.miniConfirm}
                >
                  <Text style={styles.miniConfirmText}>Apply</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.customToggleText}>Custom Amount</Text>
            )}
          </Pressable>
        </View>
      )}

      <View style={styles.footer}>
        <Pressable onPress={handleNoTip} style={styles.noTipBtn}>
          <Text style={styles.noTipBtnText}>No Tip</Text>
        </Pressable>
        {isSynced &&
          (externalTipAmount > 0 || externalTipPercentage !== null) && (
            <View style={styles.syncIndicator}>
              <Text style={styles.syncText}>
                ✓ Selection synced with Registry
              </Text>
            </View>
          )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
    padding: 40,
    justifyContent: "space-between",
  },
  header: { alignItems: "center", marginTop: 20 },
  title: {
    fontSize: 42,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: -1,
  },
  subtitle: { fontSize: 20, color: "#737373", marginTop: 10 },
  totalCard: {
    backgroundColor: "#171717",
    padding: 24,
    borderRadius: 24,
    alignItems: "center",
    alignSelf: "center",
    width: "60%",
    borderWidth: 1,
    borderColor: "#262626",
  },
  totalLabel: {
    fontSize: 16,
    color: "#737373",
    textTransform: "uppercase",
    letterSpacing: 1,
    fontWeight: "600",
  },
  totalAmount: {
    fontSize: 48,
    fontWeight: "800",
    color: "#ffffff",
    marginTop: 4,
  },
  presetsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 20,
  },
  presetCard: {
    width: 160,
    height: 140,
    backgroundColor: "#171717",
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#262626",
  },
  presetCardSelected: {
    backgroundColor: "#10b981",
    borderColor: "#34d399",
  },
  presetPct: { fontSize: 32, fontWeight: "800", color: "#ffffff" },
  presetAmt: { fontSize: 18, color: "#737373", marginTop: 4 },
  presetTextSelected: { color: "#ffffff" },
  customSection: { alignItems: "center" },
  customToggle: {
    backgroundColor: "#171717",
    paddingHorizontal: 32,
    paddingVertical: 20,
    borderRadius: 20,
    minWidth: 300,
    alignItems: "center",
  },
  customToggleActive: {
    borderColor: "#10b981",
    borderWidth: 2,
    backgroundColor: "#0a0a0a",
  },
  customToggleText: { fontSize: 20, color: "#a3a3a3", fontWeight: "500" },
  customInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    justifyContent: "center",
  },
  currencySymbol: {
    fontSize: 32,
    color: "#ffffff",
    marginRight: 8,
    fontWeight: "600",
  },
  customInput: {
    fontSize: 32,
    color: "#ffffff",
    fontWeight: "700",
    minWidth: 120,
  },
  miniConfirm: {
    marginLeft: 16,
    backgroundColor: "#10b981",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  miniConfirmText: { color: "#ffffff", fontWeight: "700", fontSize: 14 },
  footer: { alignItems: "center", gap: 24, marginBottom: 20 },
  noTipBtn: {
    paddingHorizontal: 40,
    paddingVertical: 18,
    borderRadius: 20,
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#262626",
  },
  noTipBtnText: { fontSize: 20, color: "#737373", fontWeight: "600" },
  syncIndicator: {
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 40,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.2)",
  },
  syncText: { fontSize: 14, color: "#10b981", fontWeight: "600" },
});
