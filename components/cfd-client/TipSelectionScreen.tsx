import { useCFDDisplayData } from "@/contexts/CFDDisplayDataContext";
import { colors } from "@/lib/theme";
import { Delete, UtensilsCrossed } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, {
  FadeInDown,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

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

  // Animate selected tip amount change
  const amountScale = useSharedValue(1);
  const prevTipRef = React.useRef(selectedTipAmount);
  useEffect(() => {
    if (selectedTipAmount !== prevTipRef.current) {
      prevTipRef.current = selectedTipAmount;
      amountScale.value = withSpring(1.12, { damping: 8, stiffness: 300 }, () => {
        amountScale.value = withSpring(1, { damping: 12, stiffness: 200 });
      });
    }
  }, [selectedTipAmount]);
  const amountStyle = useAnimatedStyle(() => ({
    transform: [{ scale: amountScale.value }],
  }));

  return (
    <View style={styles.outer}>
      <Animated.View entering={FadeIn.duration(250)} style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconBox}>
            <UtensilsCrossed size={20} color={colors.teal} />
          </View>
          <Text style={styles.restaurantName}>Add a tip</Text>
        </View>
        <Text style={styles.headerSubtitle}>Order total: {formatCurrency(subtotal)}</Text>
      </Animated.View>

      <View style={styles.body}>
        <View style={styles.contentColumn}>
          <Animated.View entering={FadeInDown.duration(300).delay(60)} style={styles.heroCard}>
            <View style={styles.selectionSummary}>
              <Text style={styles.selectionLabel}>Selected Tip</Text>
              <Animated.Text style={[styles.selectionAmount, amountStyle]}>
                {formatCurrency(selectedTipAmount)}
              </Animated.Text>
            </View>
          </Animated.View>

          <View style={styles.presetGrid}>
            {presets.map((pct, index) => {
              const tipAmt = Math.round(subtotal * (pct / 100));
              const isSelected = selectedPercentage === pct && !showCustom;
              return (
                <Animated.View
                  key={pct}
                  entering={FadeInDown.duration(300).delay(120 + index * 60)}
                >
                  <Pressable
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
                </Animated.View>
              );
            })}
          </View>

          <Animated.View entering={FadeInDown.duration(300).delay(300)} style={styles.actionsSection}>
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
                  {showCustom && customAmount ? `Custom Tip: $${customAmount}` : "Enter Custom Tip"}
                </Text>
              </Pressable>
            )}

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleConfirmTip}
              disabled={!hasSelection || showModal}
              style={[
                styles.confirmBtn,
                (!hasSelection || showModal) && styles.confirmBtnDisabled,
              ]}
            >
              <Text style={styles.confirmBtnText}>
                {selectedTipAmount > 0 ? `Confirm ${formatCurrency(selectedTipAmount)} Tip` : "Confirm Tip"}
              </Text>
            </TouchableOpacity>

            <Pressable onPress={handleNoTip} style={styles.noTipBtn}>
              <Text style={styles.noTipText}>No Tip</Text>
            </Pressable>
          </Animated.View>
        </View>
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
  headerSubtitle: {
    fontSize: 11,
    fontWeight: "500",
    color: colors.label,
  },
  container: {
    flexDirection: "row",
  },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  contentColumn: {
    width: "100%",
    maxWidth: 520,
    gap: 16,
  },
  heroCard: {
    width: "100%",
  },
  presetGrid: {
    flexDirection: "row",
    gap: 12,
    alignSelf: "center",
    justifyContent: "center",
  },
  presetCard: {
    width: 170,
    minHeight: 112,
    paddingVertical: 18,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  presetCardSelected: {
    backgroundColor: `${colors.teal}12`,
    borderColor: colors.teal,
  },
  presetPct: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.heading,
  },
  presetPctSelected: {
    color: colors.teal,
  },
  presetAmt: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.label,
  },
  presetAmtSelected: {
    color: colors.teal,
  },
  selectionSummary: {
    backgroundColor: colors.screen,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: "center",
    gap: 2,
  },
  selectionLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.label,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  selectionAmount: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.teal,
  },
  actionsSection: {
    width: "100%",
    gap: 12,
    alignItems: "center",
  },
  customBtn: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    alignItems: "center",
  },
  customBtnActive: {
    borderColor: colors.teal,
    backgroundColor: `${colors.teal}10`,
  },
  customBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.teal,
  },
  customBtnTextActive: {
    color: colors.teal,
  },
  noTipBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  noTipText: {
    fontSize: 14,
    color: colors.label,
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
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCard: {
    width: 340,
    backgroundColor: colors.panel,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 12,
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 18,
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
    fontSize: 28,
    fontWeight: "700",
    color: colors.teal,
  },
  numpad: {
    width: "100%",
    gap: 10,
  },
  numpadRow: {
    flexDirection: "row",
    gap: 8,
  },
  numKey: {
    flex: 1,
    height: 48,
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
    fontSize: 18,
    fontWeight: "700",
    color: colors.heading,
  },
  confirmBtn: {
    width: "100%",
    paddingVertical: 15,
    borderRadius: 14,
    backgroundColor: colors.teal,
    alignItems: "center",
  },
  confirmBtnDisabled: {
    backgroundColor: colors.card,
  },
  confirmBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#000",
  },
  cancelBtn: {
    paddingVertical: 8,
  },
  cancelBtnText: {
    fontSize: 14,
    color: colors.label,
    fontWeight: "500",
  },
});
