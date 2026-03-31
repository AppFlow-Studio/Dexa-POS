import { useCFDDisplayData } from "@/contexts/CFDDisplayDataContext";
import { colors } from "@/lib/theme";
import { Delete } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface Props {
  onTipSelected: (tipAmount: number, tipPercentage: number | null) => void;
}

export function TipSelectionScreen({ onTipSelected }: Props) {
  const {
    tipConfig,
    tipAmount: externalTipAmount,
    tipPercentage: externalTipPercentage,
  } = useCFDDisplayData();

  const [selectedPercentage, setSelectedPercentage] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [showModal, setShowModal] = useState(false);
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
  const hasSelection = hasMadeSelection && (!showCustom || customAmount.trim().length > 0);

  const handlePresetSelect = (percentage: number) => {
    setSelectedPercentage(percentage);
    setShowCustom(false);
    setHasMadeSelection(true);
    const amount = Math.round(subtotal * (percentage / 100));
    onTipSelected(amount, percentage);
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
      setShowModal(false);
      return;
    }
    if (selectedPercentage !== null) {
      onTipSelected(selectedTipAmount, selectedPercentage);
      return;
    }
    onTipSelected(0, 0);
  };

  const handleNumpadPress = (key: string) => {
    setShowCustom(true);
    setSelectedPercentage(null);
    setHasMadeSelection(true);
    setCustomAmount((prev) => {
      if (key === "⌫") return prev.slice(0, -1);
      if (key === "." && prev.includes(".")) return prev;
      if (prev.includes(".") && prev.split(".")[1]?.length >= 2) return prev;
      return prev + key;
    });
  };

  return (
    <View style={styles.outer}>
      <View style={styles.container}>
        {/* Title */}
        <View style={styles.titleSection}>
          <Text style={styles.title}>Add a tip</Text>
          <Text style={styles.subtitle}>Order total: {formatCurrency(subtotal)}</Text>
        </View>

        {/* Preset cards */}
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

        {/* Custom Amount button */}
        {tipConfig?.allowCustom !== false && (
          <Pressable
            onPress={() => {
              setShowCustom(true);
              setSelectedPercentage(null);
              setHasMadeSelection(true);
              setShowModal(true);
            }}
            style={[styles.customBtn, showCustom && styles.customBtnActive]}
          >
            <Text style={[styles.customBtnText, showCustom && styles.customBtnTextActive]}>
              {showCustom && customAmount ? `$${customAmount}` : "Custom Amount"}
            </Text>
          </Pressable>
        )}

        {/* No Tip */}
        <Pressable onPress={handleNoTip} style={styles.noTipBtn}>
          <Text style={styles.noTipText}>No Tip</Text>
        </Pressable>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Powered by DEXA</Text>
      </View>

      {/* Custom Amount Modal */}
      <Modal visible={showModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Custom Tip</Text>

            {/* Amount display */}
            <View style={styles.modalAmountBox}>
              <Text style={styles.modalAmountText}>
                {customAmount ? `$${customAmount}` : "$0"}
              </Text>
            </View>

            {/* Numpad */}
            <View style={styles.numpad}>
              {[["1","2","3"],["4","5","6"],["7","8","9"],[".", "0", "⌫"]].map((row, i) => (
                <View key={i} style={styles.numpadRow}>
                  {row.map((key) => (
                    <TouchableOpacity
                      key={key}
                      activeOpacity={0.7}
                      onPress={() => handleNumpadPress(key)}
                      style={[styles.numKey, key === "⌫" && styles.numKeyAction]}
                    >
                      {key === "⌫"
                        ? <Delete size={18} color={colors.label} />
                        : <Text style={styles.numKeyText}>{key}</Text>
                      }
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </View>

            {/* Confirm */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleConfirmTip}
              disabled={!hasSelection}
              style={[styles.confirmBtn, !hasSelection && styles.confirmBtnDisabled]}
            >
              <Text style={styles.confirmBtnText}>
                {customAmountCents > 0 ? `Confirm ${formatCurrency(customAmountCents)} Tip` : "Confirm Tip"}
              </Text>
            </TouchableOpacity>

            {/* Cancel */}
            <TouchableOpacity onPress={() => setShowModal(false)} style={styles.cancelBtn}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    backgroundColor: "#0A0D18",
  },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    paddingVertical: 24,
    gap: 16,
  },
  titleSection: {
    alignItems: "center",
    gap: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#ffffff",
  },
  subtitle: {
    fontSize: 14,
    color: "#7A8099",
    fontWeight: "400",
  },
  presetsRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  presetCard: {
    flex: 1,
    paddingVertical: 24,
    borderRadius: 16,
    backgroundColor: "#1A1F35",
    borderWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  presetCardSelected: {
    backgroundColor: "#1A1F35",
    borderWidth: 2,
    borderColor: colors.teal,
  },
  presetPct: {
    fontSize: 26,
    fontWeight: "800",
    color: "#ffffff",
  },
  presetPctSelected: {
    color: "#ffffff",
  },
  presetAmt: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.teal,
  },
  presetAmtSelected: {
    color: colors.teal,
  },
  customBtn: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.teal,
    backgroundColor: "#0D1F1E",
    alignItems: "center",
  },
  customBtnActive: {
    backgroundColor: "#0D1F1E",
  },
  customBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.teal,
  },
  customBtnTextActive: {
    color: colors.teal,
  },
  noTipBtn: {
    paddingVertical: 8,
  },
  noTipText: {
    fontSize: 14,
    color: "#7A8099",
    fontWeight: "500",
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
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCard: {
    width: 380,
    backgroundColor: colors.panel,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    gap: 16,
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.heading,
  },
  modalAmountBox: {
    width: "100%",
    paddingVertical: 14,
    backgroundColor: colors.screen,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  modalAmountText: {
    fontSize: 32,
    fontWeight: "700",
    color: colors.teal,
  },
  numpad: {
    width: "100%",
    gap: 10,
  },
  numpadRow: {
    flexDirection: "row",
    gap: 10,
  },
  numKey: {
    flex: 1,
    height: 56,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  numKeyAction: {
    backgroundColor: colors.screen,
  },
  numKeyText: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.heading,
  },
  confirmBtn: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.teal,
    alignItems: "center",
  },
  confirmBtnDisabled: {
    backgroundColor: colors.card,
  },
  confirmBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0A0D18",
  },
  cancelBtn: {
    paddingVertical: 8,
  },
  cancelBtnText: {
    fontSize: 14,
    color: "#7A8099",
    fontWeight: "500",
  },
});
