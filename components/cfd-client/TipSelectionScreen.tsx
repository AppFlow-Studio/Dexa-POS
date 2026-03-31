import { useCFDDisplayData } from "@/contexts/CFDDisplayDataContext";
import { colors } from "@/lib/theme";
import { UtensilsCrossed } from "lucide-react-native";
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

  const [selectedPercentage, setSelectedPercentage] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [hasMadeSelection, setHasMadeSelection] = useState(false);

  useEffect(() => {
    setSelectedPercentage(externalTipPercentage);
    if (externalTipPercentage === null && externalTipAmount > 0) {
      setCustomAmount((externalTipAmount / 100).toFixed(2));
      setShowCustom(true);
      setHasMadeSelection(true);
    } else if (externalTipAmount === 0) {
      setCustomAmount("");
      setShowCustom(false);
      setHasMadeSelection(false);
    }
  }, [externalTipPercentage, externalTipAmount]);

  const subtotal = tipConfig?.subtotalForTip ?? 0;
  const presets = tipConfig?.presetPercentages ?? [15, 20, 25];
  const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const customAmountCents = Math.round((parseFloat(customAmount) || 0) * 100);
  const selectedTipAmount = showCustom
    ? customAmountCents
    : selectedPercentage != null
      ? Math.round(subtotal * (selectedPercentage / 100))
      : 0;
  const hasSelection =
    hasMadeSelection && (!showCustom || customAmount.trim().length > 0);

  const handlePresetSelect = (percentage: number) => {
    setSelectedPercentage(percentage);
    setShowCustom(false);
    setHasMadeSelection(true);
  };

  const handleNoTip = () => {
    setSelectedPercentage(null);
    setCustomAmount("");
    setShowCustom(false);
    setHasMadeSelection(false);
    onTipSelected(0, 0);
  };

  const handleConfirmTip = () => {
    if (showCustom) {
      onTipSelected(selectedTipAmount, null);
      return;
    }

    if (selectedPercentage !== null) {
      onTipSelected(selectedTipAmount, selectedPercentage);
      return;
    }

    onTipSelected(0, 0);
  };

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
      </View>

      {/* Body */}
      <View style={styles.body}>
        <Text style={styles.title}>Add a tip</Text>
        <Text style={styles.subtitle}>Order total: {formatCurrency(subtotal)}</Text>

        {/* Preset grid */}
        <View style={styles.presetsRow}>
          {presets.map((pct) => {
            const tipAmt = Math.round(subtotal * (pct / 100));
            const isSelected = selectedPercentage === pct && !showCustom;
            return (
              <Pressable
                key={pct}
                onPress={() => handlePresetSelect(pct)}
                style={[styles.presetCard, isSelected && styles.presetCardSelected]}
              >
                <Text style={[styles.presetPct, isSelected && styles.presetPctSelected]}>
                  {pct}%
                </Text>
                <Text style={[styles.presetAmt, isSelected && styles.presetAmtSelected]}>
                  {formatCurrency(tipAmt)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Custom Amount */}
        {tipConfig?.allowCustom !== false && (
          <Pressable
            onPress={() => {
              setShowCustom(true);
              setSelectedPercentage(null);
              setHasMadeSelection(true);
            }}
            style={[styles.customBtn, showCustom && styles.customBtnActive]}
          >
            {showCustom ? (
              <View style={styles.customInputRow}>
                <Text style={styles.currencySymbol}>$</Text>
                <TextInput
                  value={customAmount}
                  onChangeText={setCustomAmount}
                  keyboardType="decimal-pad"
                  style={styles.customInput}
                  placeholder="0.00"
                  placeholderTextColor={colors.muted}
                  autoFocus
                />
                <Pressable onPress={handleConfirmTip} style={styles.applyBtn}>
                  <Text style={styles.applyBtnText}>Use</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.customBtnText}>Custom Amount</Text>
            )}
          </Pressable>
        )}

        {/* No Tip */}
        <Pressable onPress={handleNoTip} style={styles.noTipBtn}>
          <Text style={styles.noTipText}>No Tip</Text>
        </Pressable>

        <Pressable
          onPress={handleConfirmTip}
          disabled={!hasSelection}
          style={[
            styles.confirmBtn,
            !hasSelection && styles.confirmBtnDisabled,
          ]}
        >
          <Text style={styles.confirmBtnText}>
            Confirm {formatCurrency(selectedTipAmount)} Tip
          </Text>
        </Pressable>
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
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 20,
  },
  title: {
    fontSize: 36,
    fontWeight: "700",
    color: colors.heading,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 16,
    color: colors.label,
    marginBottom: 12,
  },
  presetsRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 4,
  },
  presetCard: {
    flex: 1,
    paddingVertical: 28,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 100,
  },
  presetCardSelected: {
    backgroundColor: `${colors.teal}18`,
    borderColor: colors.teal,
  },
  presetPct: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.heading,
    marginBottom: 6,
  },
  presetPctSelected: {
    color: colors.teal,
  },
  presetAmt: {
    fontSize: 15,
    fontWeight: "500",
    color: colors.label,
  },
  presetAmtSelected: {
    color: colors.teal,
  },
  customBtn: {
    width: "100%",
    paddingVertical: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  customBtnActive: {
    borderColor: colors.teal,
    backgroundColor: `${colors.teal}10`,
  },
  customBtnText: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.teal,
  },
  customInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  currencySymbol: {
    fontSize: 24,
    color: colors.heading,
    fontWeight: "600",
  },
  customInput: {
    fontSize: 24,
    color: colors.heading,
    fontWeight: "700",
    minWidth: 100,
  },
  applyBtn: {
    backgroundColor: colors.teal,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  applyBtnText: {
    color: colors.screen,
    fontWeight: "700",
    fontSize: 14,
  },
  noTipBtn: {
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  noTipText: {
    fontSize: 16,
    color: colors.label,
    fontWeight: "500",
  },
  confirmBtn: {
    width: "100%",
    paddingVertical: 18,
    borderRadius: 14,
    backgroundColor: colors.teal,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBtnDisabled: {
    backgroundColor: colors.border,
  },
  confirmBtnText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#000",
  },
  footer: {
    marginTop: 6,
    paddingTop: 4,
    paddingBottom: 6,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerText: {
    fontSize: 9,
    color: colors.label,
    fontWeight: "500",
  },
});
