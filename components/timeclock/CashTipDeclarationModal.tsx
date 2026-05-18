/**
 * CashTipDeclarationModal
 *
 * 3-screen wizard shown at clock-out:
 *   Screen 1 — Shift summary (duration, charged tips, gross sales)
 *   Screen 2 — Cash tip numpad input
 *   Screen 3 — Confirmation + "Clock Out & Submit"
 */

import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { getBusinessDayBounds, getCurrentBusinessDay } from "@/lib/businessDay";
import { colors } from "@/lib/theme";
import {
  fetchShiftTipSummary,
  ShiftTipSummary,
} from "@/services/cashTipDeclarationService";
import { getIsOnline } from "@/services/offlineSyncService";
import { useOrderStore } from "@/stores/useOrderStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { computeEmployeeTipData } from "@/utils/computeEmployeeTipData";
import { formatCurrency } from "@/utils/currency";
import {
  AlertTriangle,
  ArrowRight,
  ChevronLeft,
  Clock,
  DollarSign,
  TrendingUp,
} from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// ── Types ───────────────────────────────────────────────────────────────────

interface CashTipDeclarationModalProps {
  isOpen: boolean;
  shiftId: string;
  staffProfileId: string;
  locationId: string;
  employeeName: string;
  clockInTime: Date;
  onComplete: (declaredAmount: number) => void;
  onCancel: () => void;
}

type DeclarationStep = "summary" | "input" | "confirm";

const NUM_PAD_ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  [".", "0", "⌫"],
];

const MAX_TIP_AMOUNT = 10_000;

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(startDate: Date): string {
  const ms = Date.now() - startDate.getTime();
  if (isNaN(ms) || ms < 0) return "0h 00m";
  const hours = Math.floor(ms / 3_600_000);
  const minutes = String(Math.floor((ms % 3_600_000) / 60_000)).padStart(
    2,
    "0",
  );
  return `${hours}h ${minutes}m`;
}

// ── Component ───────────────────────────────────────────────────────────────

const CashTipDeclarationModal: React.FC<CashTipDeclarationModalProps> = ({
  isOpen,
  shiftId,
  staffProfileId,
  locationId,
  employeeName,
  clockInTime,
  onComplete,
  onCancel,
}) => {
  const styles = getStyles();
  const supabase = useSupabaseClient();
  const [step, setStep] = useState<DeclarationStep>("summary");
  const [rawInput, setRawInput] = useState("0");
  const [summary, setSummary] = useState<ShiftTipSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [isOfflineEstimate, setIsOfflineEstimate] = useState(false);

  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const declaredAmount = parseFloat(rawInput) || 0;
  const bdConfig = {
    timezone: selectedStore?.timezone || "UTC",
    rolloverHour: selectedStore?.business_day_start_hour ?? 0,
  };
  const today = getCurrentBusinessDay(bdConfig);

  // Detect stale shift (clock-in from a previous business day)
  const clockInDate = clockInTime.toISOString().split("T")[0];
  const isStaleShift = clockInDate < today;

  // Reset state when modal opens — compute local estimate immediately, refine with backend if online
  useEffect(() => {
    if (!isOpen) return;

    setStep("summary");
    setRawInput("0");
    setSummaryLoading(false);

    // 1. Immediate local computation (no network needed)
    const bounds = getBusinessDayBounds(today, bdConfig);
    const ordersById = useOrderStore.getState().ordersById;
    const local = computeEmployeeTipData(
      staffProfileId,
      ordersById,
      bounds.startUtc,
      bounds.endUtc,
    );
    setSummary({
      cardTips: local.cardTips,
      cashPaymentTips: local.cashPaymentTips,
      grossSales: local.grossSales,
    });

    const online = getIsOnline();
    setIsOfflineEstimate(!online);

    // 2. If online, refine with authoritative backend data
    if (online) {
      setSummaryLoading(true);
      fetchShiftTipSummary(
        supabase,
        staffProfileId,
        locationId,
        today,
        bdConfig,
      )
        .then((backendSummary) => {
          setSummary(backendSummary);
          setIsOfflineEstimate(false);
        })
        .catch(() => {
          /* keep local estimate on failure */
        })
        .finally(() => setSummaryLoading(false));
    }
  }, [isOpen, staffProfileId, locationId, supabase, today]);

  // ── Numpad handlers ─────────────────────────────────────────────────────

  const handleNumpadKey = useCallback((key: string) => {
    setRawInput((prev) => {
      const next = prev === "0" && key !== "." ? key : prev + key;
      if (!/^\d*\.?\d{0,2}$/.test(next)) return prev;
      if (parseFloat(next) > MAX_TIP_AMOUNT) return prev;
      return next;
    });
  }, []);

  const handleBackspace = useCallback(() => {
    setRawInput((prev) => (prev.length <= 1 ? "0" : prev.slice(0, -1)));
  }, []);

  const handleDeclareZero = useCallback(() => {
    setRawInput("0");
    setStep("confirm");
  }, []);

  const handleNext = useCallback(() => {
    if (declaredAmount > 1000) {
      Alert.alert(
        "Large Amount",
        `You're declaring $${declaredAmount.toFixed(2)} in cash tips. Are you sure?`,
        [
          { text: "Edit", style: "cancel" },
          { text: "Yes, continue", onPress: () => setStep("confirm") },
        ],
      );
    } else {
      setStep("confirm");
    }
  }, [declaredAmount]);

  const handleSubmit = useCallback(() => {
    onComplete(declaredAmount);
  }, [declaredAmount, onComplete]);

  if (!isOpen) return null;

  const cardTips = summary?.cardTips ?? 0;
  const cashPaymentTips = summary?.cashPaymentTips ?? 0;
  const trackedTips = cardTips + cashPaymentTips;
  const grossSales = summary?.grossSales ?? 0;
  const totalTakeHome = trackedTips + declaredAmount;

  // ── Render: Summary Screen ────────────────────────────────────────────

  const renderSummary = () => (
    <View style={{ gap: 20 }}>
      <Text
        style={{
          fontSize: 18,
          fontWeight: "800",
          color: colors.heading,
          textAlign: "center",
        }}
      >
        Ending shift for {employeeName}
      </Text>

      {isOfflineEstimate && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: 6,
            paddingHorizontal: 12,
            borderRadius: 8,
            backgroundColor: colors.warning + "12",
            borderWidth: 1,
            borderColor: colors.warning + "30",
            gap: 6,
          }}
        >
          <AlertTriangle size={12} color={colors.warning} />
          <Text
            style={{ fontSize: 11, color: colors.warning, fontWeight: "500" }}
          >
            Offline — showing local estimates from this device
          </Text>
        </View>
      )}

      {isStaleShift && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: 6,
            paddingHorizontal: 12,
            borderRadius: 8,
            backgroundColor: colors.danger + "12",
            borderWidth: 1,
            borderColor: colors.danger + "30",
            gap: 6,
          }}
        >
          <AlertTriangle size={12} color={colors.danger} />
          <Text
            style={{ fontSize: 11, color: colors.danger, fontWeight: "500" }}
          >
            This shift started on {clockInDate} — tips will be recorded for
            today's close-out
          </Text>
        </View>
      )}

      <View style={{ gap: 12 }}>
        {/* Duration */}
        <View style={styles.statRow}>
          <View style={styles.statIcon}>
            <Clock size={16} color={colors.teal} />
          </View>
          <View style={styles.statBody}>
            <Text style={styles.statLabel}>Shift Duration</Text>
            <Text style={styles.statValue}>{formatDuration(clockInTime)}</Text>
          </View>
        </View>

        {/* Card Tips */}
        <View style={styles.statRow}>
          <View style={styles.statIcon}>
            <DollarSign size={16} color={colors.teal} />
          </View>
          <View style={styles.statBody}>
            <Text style={styles.statLabel}>Card Tips</Text>
            {summaryLoading ? (
              <ActivityIndicator size="small" color={colors.teal} />
            ) : (
              <Text style={styles.statValue}>{formatCurrency(cardTips)}</Text>
            )}
          </View>
        </View>

        {/* Cash Payment Tips */}
        {(cashPaymentTips > 0 || summaryLoading) && (
          <View style={styles.statRow}>
            <View style={styles.statIcon}>
              <DollarSign size={16} color={colors.teal} />
            </View>
            <View style={styles.statBody}>
              <Text style={styles.statLabel}>Cash Payment Tips (tracked)</Text>
              {summaryLoading ? (
                <ActivityIndicator size="small" color={colors.teal} />
              ) : (
                <Text style={styles.statValue}>
                  {formatCurrency(cashPaymentTips)}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Gross Sales */}
        <View style={styles.statRow}>
          <View style={styles.statIcon}>
            <TrendingUp size={16} color={colors.teal} />
          </View>
          <View style={styles.statBody}>
            <Text style={styles.statLabel}>Gross Sales</Text>
            {summaryLoading ? (
              <ActivityIndicator size="small" color={colors.teal} />
            ) : (
              <Text style={styles.statValue}>{formatCurrency(grossSales)}</Text>
            )}
          </View>
        </View>
      </View>

      <TouchableOpacity
        onPress={() => setStep("input")}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          paddingVertical: 14,
          borderRadius: 12,
          backgroundColor: colors.teal,
          gap: 8,
        }}
      >
        <Text
          style={{ fontSize: 14, fontWeight: "700", color: colors.onSolid }}
        >
          Next: Declare Cash Tips
        </Text>
        <ArrowRight size={16} color={colors.onSolid} />
      </TouchableOpacity>
    </View>
  );

  // ── Render: Input Screen ──────────────────────────────────────────────

  const renderInput = () => (
    <View style={{ gap: 14 }}>
      <Text style={{ fontSize: 13, color: colors.label, textAlign: "center" }}>
        Any additional cash tips not already tracked in the POS?{"\n"}
        {cashPaymentTips > 0
          ? `(${formatCurrency(cashPaymentTips)} from cash payments is already recorded)`
          : "Round to the nearest dollar if needed."}
      </Text>

      {/* Dollar display */}
      <View
        style={{
          alignItems: "center",
          paddingVertical: 20,
          borderRadius: 14,
          backgroundColor: colors.teal + "12",
          borderWidth: 1,
          borderColor: colors.teal + "40",
        }}
      >
        <Text style={{ fontSize: 36, fontWeight: "800", color: colors.teal }}>
          ${rawInput}
        </Text>
      </View>

      {/* Numpad */}
      <View style={{ gap: 6, paddingHorizontal: 20 }}>
        {NUM_PAD_ROWS.map((row, i) => (
          <View key={i} style={{ flexDirection: "row", gap: 6 }}>
            {row.map((key) => (
              <TouchableOpacity
                key={key}
                onPress={() =>
                  key === "⌫" ? handleBackspace() : handleNumpadKey(key)
                }
                style={{
                  flex: 1,
                  paddingVertical: 16,
                  borderRadius: 10,
                  backgroundColor:
                    key === "⌫" ? colors.danger + "12" : colors.panel,
                  borderWidth: 1,
                  borderColor:
                    key === "⌫" ? colors.danger + "35" : colors.border,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 20,
                    fontWeight: key === "⌫" ? "700" : "500",
                    color: key === "⌫" ? colors.danger : colors.heading,
                  }}
                >
                  {key}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>

      <Text style={{ fontSize: 10, color: colors.muted, textAlign: "center" }}>
        Declaring $0 is fine if you received no cash tips.{"\n"}
        You can't change this after clock-out without manager help.
      </Text>

      {/* Buttons */}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <TouchableOpacity
          onPress={handleDeclareZero}
          style={{
            flex: 1,
            paddingVertical: 13,
            borderRadius: 10,
            borderWidth: 1.5,
            borderColor: colors.danger + "50",
            backgroundColor: colors.danger + "10",
            alignItems: "center",
          }}
        >
          <Text
            style={{ fontSize: 13, fontWeight: "700", color: colors.danger }}
          >
            Declare $0
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleNext}
          disabled={declaredAmount <= 0}
          style={{
            flex: 1,
            paddingVertical: 13,
            borderRadius: 10,
            backgroundColor:
              declaredAmount > 0 ? colors.teal : colors.teal + "40",
            alignItems: "center",
          }}
        >
          <Text
            style={{ fontSize: 13, fontWeight: "700", color: colors.onSolid }}
          >
            Confirm ${rawInput}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ── Render: Confirmation Screen ───────────────────────────────────────

  const renderConfirmation = () => (
    <View style={{ gap: 20 }}>
      <Text
        style={{
          fontSize: 18,
          fontWeight: "800",
          color: colors.heading,
          textAlign: "center",
        }}
      >
        Confirm Cash Tips
      </Text>

      <View
        style={{
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.teal + "40",
          backgroundColor: colors.teal + "08",
          padding: 16,
          gap: 12,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 13, color: colors.label }}>
            Additional Cash Declared
          </Text>
          <Text
            style={{ fontSize: 15, fontWeight: "700", color: colors.heading }}
          >
            {formatCurrency(declaredAmount)}
          </Text>
        </View>
        <View style={{ height: 1, backgroundColor: colors.border }} />
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 13, color: colors.label }}>Card Tips</Text>
          <Text style={{ fontSize: 13, color: colors.heading }}>
            {formatCurrency(cardTips)}
          </Text>
        </View>
        {cashPaymentTips > 0 && (
          <>
            <View style={{ height: 1, backgroundColor: colors.border }} />
            <View
              style={{ flexDirection: "row", justifyContent: "space-between" }}
            >
              <Text style={{ fontSize: 13, color: colors.label }}>
                Cash Payment Tips (tracked)
              </Text>
              <Text style={{ fontSize: 13, color: colors.heading }}>
                {formatCurrency(cashPaymentTips)}
              </Text>
            </View>
          </>
        )}
        <View style={{ height: 1, backgroundColor: colors.border }} />
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: colors.teal }}>
            Total Take-Home (est.)
          </Text>
          <Text style={{ fontSize: 16, fontWeight: "800", color: colors.teal }}>
            {formatCurrency(totalTakeHome)}
          </Text>
        </View>
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 8,
          backgroundColor: colors.warning + "12",
          borderWidth: 1,
          borderColor: colors.warning + "30",
          gap: 8,
        }}
      >
        <AlertTriangle size={14} color={colors.warning} />
        <Text style={{ flex: 1, fontSize: 10, color: colors.warning }}>
          Your final tips may be adjusted after the manager approves today's
          distribution.
        </Text>
      </View>

      <View style={{ flexDirection: "row", gap: 10 }}>
        <TouchableOpacity
          onPress={() => setStep("input")}
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: 13,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
            gap: 6,
          }}
        >
          <ChevronLeft size={16} color={colors.label} />
          <Text
            style={{ fontSize: 13, fontWeight: "600", color: colors.label }}
          >
            Edit
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleSubmit}
          style={{
            flex: 2,
            paddingVertical: 13,
            borderRadius: 10,
            backgroundColor: colors.teal,
            alignItems: "center",
          }}
        >
          <Text
            style={{ fontSize: 14, fontWeight: "700", color: colors.onSolid }}
          >
            Clock Out & Submit
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ── Main Render ───────────────────────────────────────────────────────

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.7)",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <View
          style={{
            width: 460,
            borderRadius: 20,
            backgroundColor: colors.screen,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 20,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
              backgroundColor: colors.panel,
            }}
          >
            <Text
              style={{ fontSize: 15, fontWeight: "700", color: colors.heading }}
            >
              {step === "summary"
                ? "Shift Summary"
                : step === "input"
                  ? "Cash Tips"
                  : "Confirm & Clock Out"}
            </Text>
            <TouchableOpacity
              onPress={onCancel}
              hitSlop={8}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 8,
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text
                style={{ fontSize: 12, fontWeight: "600", color: colors.label }}
              >
                Cancel
              </Text>
            </TouchableOpacity>
          </View>

          {/* Content */}
          <View style={{ padding: 20 }}>
            {step === "summary" && renderSummary()}
            {step === "input" && renderInput()}
            {step === "confirm" && renderConfirmation()}
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ── Styles ──────────────────────────────────────────────────────────────────

const getStyles = () => ({
  statRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.teal + "12",
    borderWidth: 1,
    borderColor: colors.teal + "35",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginRight: 10,
  },
  statBody: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 8,
  },
  statLabel: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: "600" as const,
  },
  statValue: {
    fontSize: 15,
    fontWeight: "800" as const,
    color: colors.heading,
  },
});

export default CashTipDeclarationModal;
