/**
 * CashDrawerSheet
 *
 * Full cash drawer lifecycle: Open -> Active (view operations) -> Close with variance display.
 * Presented as a bottom sheet modal.
 */

import DenominationCounter from "@/components/cash-drawer/DenominationCounter";
import NoSaleModal from "@/components/cash-drawer/NoSaleModal";
import PayInOutModal from "@/components/cash-drawer/PayInOutModal";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { bottomSheetTheme, colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import {
  computeLocalTimeline,
  computeLocalVarianceFlags,
  fetchSessionVarianceAnalysis,
  type VarianceAnalysis,
} from "@/services/cashDrawerAuditService";
import {
  closeDrawerSession,
  openDrawerSession,
} from "@/services/cashDrawerService";
import {
  DenominationCount,
  isDebitOperation,
  isNoEffectOperation,
  useCashDrawerStore,
} from "@/stores/useCashDrawerStore";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useLocationConfigStore } from "@/stores/useLocationConfigStore";
import { usePaymentDetailSheetStore } from "@/stores/usePaymentDetailSheetStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { formatCurrency } from "@/utils/currency";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
} from "@/components/ui/bottomSheet";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  ExternalLink,
  Inbox,
  Lock,
  Receipt,
  Unlock,
} from "lucide-react-native";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";

interface CashDrawerSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

type DrawerView = "open" | "active" | "close" | "close_summary";

const OP_LABELS: Record<string, string> = {
  cash_sale: "Cash Sale",
  pay_in: "Pay In",
  pay_out: "Pay Out",
  cash_drop: "Cash Drop",
  no_sale: "No Sale",
  cash_refund: "Cash Refund",
  opening_count: "Opening Count",
  closing_count: "Closing Count",
  tip_out: "Tip Out",
};

function getOpStyle(operationType: string): { bg: string; text: string } {
  switch (operationType) {
    case "cash_sale":
    case "pay_in":
      return { bg: colors.teal + "25", text: colors.teal };
    case "cash_refund":
    case "pay_out":
    case "tip_out":
      return { bg: colors.danger + "25", text: colors.danger };
    case "cash_drop":
      return { bg: colors.info + "25", text: colors.info };
    default:
      return { bg: colors.muted + "25", text: colors.muted };
  }
}

function formatTime(iso: string) {
  const date = new Date(iso);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getSignedAmountColor(value: number) {
  if (value > 0) return colors.teal;
  if (value < 0) return colors.danger;
  return colors.muted;
}

function formatSignedAmount(value: number) {
  if (value > 0) return formatCurrency(value);
  if (value < 0) return formatCurrency(Math.abs(value));
  return formatCurrency(0);
}

function renderSignedAmount(value: number, scale: number) {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  const amountColor = getSignedAmountColor(value);
  const s = (n: number) => Math.round(n * scale);

  return (
    <Text style={{ fontSize: s(13), fontWeight: "700" }}>
      {sign ? <Text style={{ color: amountColor }}>{sign}</Text> : null}
      <Text style={{ color: amountColor }}>{formatSignedAmount(value)}</Text>
    </Text>
  );
}

const CashDrawerSheet: React.FC<CashDrawerSheetProps> = ({
  isOpen,
  onClose,
}) => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const supabase = useSupabaseClient();

  const activeSession = useCashDrawerStore((s) => s.activeSession);
  const operations = useCashDrawerStore((s) => s.operations);
  const drawerId = useCashDrawerStore((s) => s.drawerId);
  const drawerName = useCashDrawerStore((s) => s.drawerName);
  const getRunningBalance = useCashDrawerStore((s) => s.getRunningBalance);
  const getVariance = useCashDrawerStore((s) => s.getVariance);
  const getNoSaleCount = useCashDrawerStore((s) => s.getNoSaleCount);

  const loggedInEmployee = useEmployeeStore((s) => s.loggedInEmployee);
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const cashDrawerSettings = useLocationConfigStore((s) => s.config.cashDrawer);

  const [view, setView] = useState<DrawerView>(
    activeSession?.status === "open" ? "active" : "open",
  );
  const [openingTotal, setOpeningTotal] = useState(0);
  const [openingDetails, setOpeningDetails] = useState<DenominationCount[]>([]);
  const [closingTotal, setClosingTotal] = useState(0);
  const [closingDetails, setClosingDetails] = useState<DenominationCount[]>([]);
  const [varianceNotes, setVarianceNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isQuickStart, setIsQuickStart] = useState(false);
  const [quickStartAmount, setQuickStartAmount] = useState(
    String(cashDrawerSettings.defaultOpeningAmount),
  );

  // Sub-modal states — rendered OUTSIDE the BottomSheetModal so they appear above it
  const [payInOutMode, setPayInOutMode] = useState<
    "pay_in" | "pay_out" | "cash_drop"
  >("pay_in");
  const [isPayInOutOpen, setPayInOutOpen] = useState(false);
  const [isNoSaleOpen, setNoSaleOpen] = useState(false);

  // Close summary data
  const [closeSummary, setCloseSummary] = useState<{
    expected: number;
    actual: number;
    variance: number;
  } | null>(null);

  // Variance analysis state
  const [varianceDetailExpanded, setVarianceDetailExpanded] = useState(false);
  const [varianceAnalysis, setVarianceAnalysis] =
    useState<VarianceAnalysis | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);

  useEffect(() => {
    if (isOpen) {
      bottomSheetRef.current?.present();
      setView(activeSession?.status === "open" ? "active" : "open");
      setCloseSummary(null);
    } else {
      bottomSheetRef.current?.dismiss();
    }
  }, [isOpen, activeSession?.status]);

  const handleOpen = useCallback(async () => {
    if (!drawerId || !selectedStore || !loggedInEmployee) return;
    setIsSubmitting(true);

    const amount = isQuickStart
      ? parseFloat(quickStartAmount) || 0
      : openingTotal;
    const details = isQuickStart ? undefined : openingDetails;

    const result = await openDrawerSession(supabase, {
      cashDrawerId: drawerId,
      merchantId: selectedStore.merchant_id,
      locationId: selectedStore.id,
      openedBy: loggedInEmployee.profileId,
      openingAmount: amount,
      openingCountDetails: details,
    });

    setIsSubmitting(false);
    if (result.success) {
      setView("active");
    }
  }, [
    drawerId,
    selectedStore,
    loggedInEmployee,
    openingTotal,
    openingDetails,
    isQuickStart,
    quickStartAmount,
    supabase,
  ]);

  const handleClose = useCallback(async () => {
    if (!activeSession || !drawerId || !loggedInEmployee) return;
    setIsSubmitting(true);

    const expected = getRunningBalance();
    const result = await closeDrawerSession(supabase, {
      sessionId: activeSession.id,
      cashDrawerId: drawerId,
      closedBy: loggedInEmployee.profileId,
      closingAmount: closingTotal,
      closingCountDetails: closingDetails,
      varianceNotes: varianceNotes || undefined,
    });

    setIsSubmitting(false);
    if (result.success) {
      if (cashDrawerSettings.blindCloseCount) {
        setCloseSummary({
          expected,
          actual: closingTotal,
          variance: result.variance ?? closingTotal - expected,
        });
        setView("close_summary");
      } else {
        onClose();
      }
    }
  }, [
    activeSession,
    drawerId,
    loggedInEmployee,
    closingTotal,
    closingDetails,
    varianceNotes,
    supabase,
    onClose,
    cashDrawerSettings.blindCloseCount,
    getRunningBalance,
  ]);

  const openPayInOut = useCallback(
    (mode: "pay_in" | "pay_out" | "cash_drop") => {
      setPayInOutMode(mode);
      setPayInOutOpen(true);
    },
    [],
  );

  // PERF: This sheet stays mounted (gorhom BottomSheetModal renders content
  // even while dismissed) so these recompute on every operations/session
  // change even while closed. Skip the work entirely while closed — none of
  // it is visible and it's all recomputed fresh in the effect above when
  // `isOpen` flips back to true.
  const runningBalance = useMemo(
    () => (isOpen ? getRunningBalance() : 0),
    [isOpen, operations, activeSession],
  );
  const variance = useMemo(
    () => (isOpen ? getVariance(closingTotal) : 0),
    [isOpen, closingTotal, operations, activeSession],
  );

  // Totals for the session summary bar
  const sessionTotals = useMemo(() => {
    if (!isOpen) return { cashIn: 0, cashOut: 0, sales: 0 };
    let cashIn = 0;
    let cashOut = 0;
    let sales = 0;
    for (const op of operations) {
      if (isNoEffectOperation(op.operationType)) continue;
      if (op.operationType === "cash_sale") {
        sales += op.amount;
        cashIn += op.amount;
      } else if (isDebitOperation(op.operationType)) {
        cashOut += op.amount;
      } else {
        cashIn += op.amount;
      }
    }
    return { cashIn, cashOut, sales };
  }, [isOpen, operations]);

  const recentOps = useMemo(
    () => (isOpen ? [...operations].reverse().slice(0, 30) : []),
    [isOpen, operations],
  );

  const isBlind = cashDrawerSettings.blindCloseCount;
  const { varianceWarningThreshold, varianceAlertThreshold } =
    cashDrawerSettings;

  // Local variance flags for the close view (no RPC needed)
  const localVarianceFlags = useMemo(
    () => (isOpen ? computeLocalVarianceFlags(operations, variance) : []),
    [isOpen, operations, variance],
  );
  const localTimeline = useMemo(
    () =>
      isOpen
        ? computeLocalTimeline(operations, activeSession?.openingAmount || 0)
        : [],
    [isOpen, operations, activeSession?.openingAmount],
  );

  const handleFetchAnalysis = useCallback(async () => {
    if (!activeSession || loadingAnalysis) return;
    setLoadingAnalysis(true);
    const result = await fetchSessionVarianceAnalysis(
      supabase,
      activeSession.id,
    );
    setVarianceAnalysis(result);
    setLoadingAnalysis(false);
  }, [activeSession, supabase, loadingAnalysis]);

  // ── Open view ──────────────────────────────────────────────────────────────
  const renderOpenView = () => (
    <View style={{ gap: s(10) }}>
      <View
        style={{
          borderRadius: s(18),
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          padding: s(14),
          gap: s(12),
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: s(12),
          }}
        >
          <View style={{ flex: 1, gap: s(6) }}>
            <View
              style={{
                alignSelf: "flex-start",
                paddingHorizontal: s(10),
                paddingVertical: s(5),
                borderRadius: 999,
                backgroundColor: colors.teal + "15",
                borderWidth: 1,
                borderColor: colors.teal + "35",
              }}
            >
              <Text
                style={{
                  fontSize: s(10),
                  fontWeight: "700",
                  color: colors.teal,
                  letterSpacing: 0.6,
                }}
              >
                Open drawer
              </Text>
            </View>
            <Text
              style={{
                fontSize: s(20),
                fontWeight: "800",
                color: colors.heading,
                lineHeight: s(24),
              }}
            >
              {drawerName || "Cash Drawer"}
            </Text>
            <Text
              style={{
                fontSize: s(12),
                color: colors.label,
                lineHeight: s(17),
              }}
            >
              Choose a quick start amount or count the drawer by denomination.
            </Text>
          </View>

          <View
            style={{
              minWidth: s(92),
              borderRadius: s(14),
              paddingVertical: s(10),
              paddingHorizontal: s(12),
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: s(10),
                color: colors.muted,
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Mode
            </Text>
            <Text
              style={{
                fontSize: s(13),
                fontWeight: "800",
                color: colors.heading,
                marginTop: s(2),
              }}
            >
              {isQuickStart ? "Quick" : "Count"}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s(8) }}>
          <View
            style={{
              flexGrow: 1,
              flexBasis: s(132),
              borderRadius: s(14),
              padding: s(10),
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text
              style={{
                fontSize: s(10),
                color: colors.muted,
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Opening float
            </Text>
            <Text
              style={{
                fontSize: s(16),
                fontWeight: "800",
                color: colors.teal,
                marginTop: s(2),
              }}
            >
              {formatCurrency(
                isQuickStart ? parseFloat(quickStartAmount) || 0 : openingTotal,
              )}
            </Text>
          </View>
          <View
            style={{
              flexGrow: 1,
              flexBasis: s(132),
              borderRadius: s(14),
              padding: s(10),
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: s(10),
                color: colors.muted,
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Count type
            </Text>
            <Text
              style={{
                fontSize: s(16),
                fontWeight: "800",
                color: colors.heading,
                marginTop: s(2),
              }}
            >
              {isQuickStart ? "Quick start" : "Denominations"}
            </Text>
          </View>
        </View>
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: s(12),
          borderRadius: s(14),
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.panel,
          paddingHorizontal: s(12),
          paddingVertical: s(10),
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: s(12),
              color: colors.heading,
              fontWeight: "700",
            }}
          >
            Quick Start
          </Text>
          <Text
            style={{ fontSize: s(11), color: colors.muted, marginTop: s(2) }}
          >
            Use a preset or switch to counted denominations.
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => setIsQuickStart(!isQuickStart)}
          style={{
            paddingHorizontal: s(12),
            paddingVertical: s(7),
            borderRadius: 999,
            borderWidth: 1,
            borderColor: isQuickStart ? colors.teal + "50" : colors.border,
            backgroundColor: isQuickStart ? colors.teal + "20" : colors.screen,
            minWidth: s(70),
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontSize: s(11),
              fontWeight: "700",
              color: isQuickStart ? colors.teal : colors.label,
            }}
          >
            {isQuickStart ? "On" : "Off"}
          </Text>
        </TouchableOpacity>
      </View>

      {isQuickStart ? (
        <View
          style={{
            borderRadius: s(16),
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.panel,
            padding: s(12),
            gap: s(12),
          }}
        >
          <View style={{ gap: s(4) }}>
            <Text
              style={{
                fontSize: s(12),
                color: colors.heading,
                fontWeight: "700",
              }}
            >
              Opening Amount
            </Text>
            <Text style={{ fontSize: s(11), color: colors.muted }}>
              Enter the starting float for this drawer.
            </Text>
          </View>
          <TextInput
            value={quickStartAmount}
            onChangeText={setQuickStartAmount}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={colors.muted}
            style={{
              height: s(54),
              paddingHorizontal: s(14),
              paddingVertical: 0,
              backgroundColor: colors.inset,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: s(14),
              color: colors.heading,
              fontSize: s(22),
              lineHeight: s(26),
              fontWeight: "800",
              textAlign: "center",
              textAlignVertical: "center",
              includeFontPadding: false,
            }}
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s(8) }}>
            {[50, 100, 150, 200, 300, 500].map((preset) => {
              const isSelected = quickStartAmount === String(preset);
              return (
                <TouchableOpacity
                  key={preset}
                  onPress={() => setQuickStartAmount(String(preset))}
                  style={{
                    borderRadius: 999,
                    paddingHorizontal: s(13),
                    paddingVertical: s(8),
                    borderWidth: 1,
                    backgroundColor: isSelected
                      ? colors.teal + "26"
                      : colors.screen,
                    borderColor: isSelected ? colors.teal : colors.border,
                  }}
                >
                  <Text
                    style={{
                      fontSize: s(12),
                      fontWeight: "700",
                      color: isSelected ? colors.teal : colors.label,
                    }}
                  >
                    ${preset}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ) : (
        <View
          style={{
            borderRadius: s(16),
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.panel,
            padding: s(12),
          }}
        >
          <View style={{ gap: s(4), marginBottom: s(10) }}>
            <Text
              style={{
                fontSize: s(12),
                color: colors.heading,
                fontWeight: "700",
              }}
            >
              Denomination Count
            </Text>
            <Text style={{ fontSize: s(11), color: colors.muted }}>
              Count bills and coins to build the opening total.
            </Text>
          </View>
          <DenominationCounter
            onTotalChange={(total, details) => {
              setOpeningTotal(total);
              setOpeningDetails(details);
            }}
          />
        </View>
      )}
    </View>
  );

  const renderOpenViewButton = () => (
    <TouchableOpacity
      onPress={handleOpen}
      disabled={isSubmitting}
      style={{
        minHeight: s(50),
        borderRadius: s(14),
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: isSubmitting ? colors.border : colors.teal,
        opacity: isSubmitting ? 0.7 : 1,
        shadowColor: colors.teal,
        shadowOpacity: isSubmitting ? 0 : 0.16,
        shadowRadius: s(14),
        shadowOffset: { width: 0, height: s(8) },
        elevation: isSubmitting ? 0 : 2,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: s(8) }}>
        <Unlock size={s(16)} color={colors.onSolid} />
        <Text
          style={{ fontSize: s(14), fontWeight: "800", color: colors.onSolid }}
        >
          {isSubmitting
            ? "Opening..."
            : `Open drawer ${formatCurrency(
                isQuickStart ? parseFloat(quickStartAmount) || 0 : openingTotal,
              )}`}
        </Text>
      </View>
    </TouchableOpacity>
  );

  // ── Active view ────────────────────────────────────────────────────────────
  const renderActiveView = () => (
    <View style={{ gap: s(10) }}>
      <View
        style={{
          borderRadius: s(18),
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          padding: s(12),
          gap: s(10),
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "stretch",
            justifyContent: "space-between",
            gap: s(8),
          }}
        >
          <View
            style={{
              flex: 1,
              borderRadius: s(14),
              paddingHorizontal: s(12),
              paddingVertical: s(10),
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                fontSize: s(10),
                color: colors.muted,
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Drawer
            </Text>
            <Text
              style={{
                fontSize: s(15),
                color: colors.heading,
                fontWeight: "800",
                marginTop: s(2),
              }}
            >
              {drawerName || "Cash Drawer"}
            </Text>
          </View>

          <View
            style={{
              minWidth: s(118),
              borderRadius: s(14),
              paddingHorizontal: s(10),
              paddingVertical: s(10),
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                fontSize: s(10),
                color: colors.muted,
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Balance
            </Text>
            <Text
              style={{
                fontSize: s(16),
                fontWeight: "800",
                color: colors.teal,
                marginTop: s(2),
              }}
            >
              {formatCurrency(runningBalance)}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => setView("close")}
            style={{
              minWidth: s(112),
              borderRadius: s(14),
              paddingHorizontal: s(10),
              paddingVertical: s(10),
              backgroundColor: colors.danger + "15",
              borderWidth: 1,
              borderColor: colors.danger + "35",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Lock size={s(14)} color={colors.danger} />
            <Text
              style={{
                fontSize: s(11),
                fontWeight: "700",
                color: colors.danger,
                marginTop: s(4),
              }}
            >
              Close
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ flexDirection: "row", gap: s(8) }}>
          <View
            style={{
              flex: 1,
              borderRadius: s(12),
              paddingHorizontal: s(10),
              paddingVertical: s(9),
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: s(9),
                color: colors.muted,
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Sales
            </Text>
            <Text
              style={{
                fontSize: s(14),
                fontWeight: "800",
                color: colors.teal,
                marginTop: s(2),
              }}
            >
              {formatCurrency(sessionTotals.sales)}
            </Text>
          </View>
          <View
            style={{
              flex: 1,
              borderRadius: s(12),
              paddingHorizontal: s(10),
              paddingVertical: s(9),
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: s(9),
                color: colors.muted,
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Cash In
            </Text>
            <Text
              style={{
                fontSize: s(14),
                fontWeight: "800",
                color: colors.teal,
                marginTop: s(2),
              }}
            >
              {formatCurrency(sessionTotals.cashIn)}
            </Text>
          </View>
          <View
            style={{
              flex: 1,
              borderRadius: s(12),
              paddingHorizontal: s(10),
              paddingVertical: s(9),
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: s(9),
                color: colors.muted,
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Cash Out
            </Text>
            <Text
              style={{
                fontSize: s(14),
                fontWeight: "800",
                color: colors.danger,
                marginTop: s(2),
              }}
            >
              {formatCurrency(sessionTotals.cashOut)}
            </Text>
          </View>
          <View
            style={{
              flex: 1,
              borderRadius: s(12),
              paddingHorizontal: s(10),
              paddingVertical: s(9),
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: s(9),
                color: colors.muted,
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Ops
            </Text>
            <Text
              style={{
                fontSize: s(14),
                fontWeight: "800",
                color: colors.heading,
                marginTop: s(2),
              }}
            >
              {operations.length}
            </Text>
          </View>
        </View>
      </View>

      <View
        style={{
          borderRadius: s(16),
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.panel,
          padding: s(10),
          gap: s(8),
        }}
      >
        <Text
          style={{
            fontSize: s(11),
            color: colors.muted,
            fontWeight: "700",
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          Drawer Actions
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s(8) }}>
          <TouchableOpacity
            onPress={() => openPayInOut("pay_in")}
            style={{
              flexGrow: 1,
              flexBasis: s(130),
              minHeight: s(50),
              borderRadius: s(12),
              backgroundColor: colors.teal + "15",
              borderWidth: 1,
              borderColor: colors.teal + "35",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ArrowDownCircle size={s(16)} color={colors.teal} />
            <Text
              style={{
                fontSize: s(11),
                fontWeight: "700",
                color: colors.teal,
                marginTop: s(2),
              }}
            >
              Pay In
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => openPayInOut("pay_out")}
            style={{
              flexGrow: 1,
              flexBasis: s(130),
              minHeight: s(50),
              borderRadius: s(12),
              backgroundColor: colors.danger + "15",
              borderWidth: 1,
              borderColor: colors.danger + "35",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ArrowUpCircle size={s(16)} color={colors.danger} />
            <Text
              style={{
                fontSize: s(11),
                fontWeight: "700",
                color: colors.danger,
                marginTop: s(2),
              }}
            >
              Pay Out
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => openPayInOut("cash_drop")}
            style={{
              flexGrow: 1,
              flexBasis: s(130),
              minHeight: s(50),
              borderRadius: s(12),
              backgroundColor: colors.teal + "15",
              borderWidth: 1,
              borderColor: colors.teal + "35",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Inbox size={s(16)} color={colors.teal} />
            <Text
              style={{
                fontSize: s(11),
                fontWeight: "700",
                color: colors.teal,
                marginTop: s(2),
              }}
            >
              Drop
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setNoSaleOpen(true)}
            style={{
              flexGrow: 1,
              flexBasis: s(130),
              minHeight: s(50),
              borderRadius: s(12),
              backgroundColor: colors.teal + "15",
              borderWidth: 1,
              borderColor: colors.teal + "35",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Banknote size={s(16)} color={colors.teal} />
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: s(2),
                gap: s(4),
              }}
            >
              <Text
                style={{
                  fontSize: s(11),
                  fontWeight: "700",
                  color: colors.teal,
                }}
              >
                No Sale
              </Text>
              {getNoSaleCount() > 0 && (
                <View
                  style={{
                    paddingHorizontal: s(5),
                    paddingVertical: s(1),
                    borderRadius: s(8),
                    backgroundColor:
                      cashDrawerSettings.noSaleAlertThreshold > 0 &&
                      getNoSaleCount() >=
                        cashDrawerSettings.noSaleAlertThreshold
                        ? colors.danger
                        : colors.muted + "60",
                  }}
                >
                  <Text
                    style={{
                      fontSize: s(9),
                      fontWeight: "800",
                      color: "#fff",
                    }}
                  >
                    {getNoSaleCount()}
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <View
        style={{
          borderRadius: s(16),
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.panel,
          padding: s(12),
          gap: s(10),
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text
            style={{
              fontSize: s(12),
              fontWeight: "800",
              color: colors.heading,
            }}
          >
            Transactions
          </Text>
          <Text style={{ fontSize: s(10), color: colors.muted }}>
            {operations.length}
          </Text>
        </View>

        {recentOps.length === 0 ? (
          <View style={{ paddingVertical: s(18), alignItems: "center" }}>
            <Receipt size={s(22)} color={colors.muted} />
            <Text
              style={{ fontSize: s(11), color: colors.muted, marginTop: s(6) }}
            >
              No transactions yet
            </Text>
          </View>
        ) : (
          recentOps.map((op) => {
            const isDebit = isDebitOperation(op.operationType);
            const isNoEffect = isNoEffectOperation(op.operationType);
            const signedAmountValue = isNoEffect
              ? 0
              : isDebit
                ? -op.amount
                : op.amount;

            const handleCardPress = () => {
              if (op.orderId) {
                usePaymentDetailSheetStore.getState().open(op.orderId);
              }
            };

            return (
              <TouchableOpacity
                key={op.id}
                onPress={handleCardPress}
                disabled={!op.orderId}
                activeOpacity={op.orderId ? 0.7 : 1}
                style={{
                  paddingHorizontal: s(10),
                  paddingVertical: s(9),
                  borderRadius: s(10),
                  marginBottom: s(6),
                  backgroundColor: colors.panel,
                  borderWidth: 1,
                  borderColor: op.orderId ? colors.teal + "40" : colors.border,
                }}
              >
                {/* Top row: Type + Amount */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: s(6),
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: s(6),
                    }}
                  >
                    <Text
                      style={{
                        fontSize: s(13),
                        fontWeight: "700",
                        color: colors.heading,
                      }}
                    >
                      {OP_LABELS[op.operationType] ??
                        op.operationType.replace(/_/g, " ")}
                    </Text>
                    {op.orderId && (
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: s(2),
                          backgroundColor: colors.panel,
                          paddingHorizontal: s(6),
                          paddingVertical: s(2),
                          borderRadius: s(4),
                        }}
                      >
                        <ExternalLink size={s(9)} color={colors.muted} />
                        <Text style={{ fontSize: s(10), color: colors.muted }}>
                          Order
                        </Text>
                      </View>
                    )}
                  </View>
                  {/* Amount */}
                  <Text
                    style={{
                      fontSize: s(13),
                      fontWeight: "700",
                      color: isNoEffect
                        ? colors.muted
                        : getSignedAmountColor(signedAmountValue),
                    }}
                  >
                    {isNoEffect
                      ? "—"
                      : renderSignedAmount(signedAmountValue, uiScale)}
                  </Text>
                </View>

                {/* Bottom row: reason + time */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: s(6),
                    flexWrap: "wrap",
                  }}
                >
                  {op.reason && (
                    <Text style={{ fontSize: s(10), color: colors.label }}>
                      {op.reason}
                    </Text>
                  )}
                  {op.performedAt && (
                    <Text style={{ fontSize: s(9), color: colors.muted }}>
                      {formatTime(op.performedAt)}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </View>
  );

  // ── Close view ─────────────────────────────────────────────────────────────
  const renderCloseView = () => (
    <View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: s(12),
        }}
      >
        <View>
          <Text
            style={{
              fontSize: s(16),
              fontWeight: "700",
              color: colors.heading,
            }}
          >
            Close Drawer
          </Text>
          <Text
            style={{ fontSize: s(11), color: colors.muted, marginTop: s(1) }}
          >
            Count the cash to end your session
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => setView("active")}
          style={{
            paddingHorizontal: s(10),
            paddingVertical: s(5),
            borderRadius: s(8),
            backgroundColor: colors.panel,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text style={{ fontSize: s(11), color: colors.label }}>Back</Text>
        </TouchableOpacity>
      </View>

      <DenominationCounter
        onTotalChange={(total, details) => {
          setClosingTotal(total);
          setClosingDetails(details);
        }}
      />

      {/* Variance Display */}
      <View
        style={{
          backgroundColor: colors.panel,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: s(12),
          padding: s(12),
          marginTop: s(12),
        }}
      >
        {!isBlind && (
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginBottom: s(8),
            }}
          >
            <Text style={{ fontSize: s(12), color: colors.label }}>
              Expected
            </Text>
            <Text
              style={{
                fontSize: s(12),
                fontWeight: "600",
                color: colors.heading,
              }}
            >
              {formatCurrency(runningBalance)}
            </Text>
          </View>
        )}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            marginBottom: s(8),
          }}
        >
          <Text style={{ fontSize: s(12), color: colors.label }}>Counted</Text>
          <Text
            style={{
              fontSize: s(12),
              fontWeight: "600",
              color: colors.heading,
            }}
          >
            {formatCurrency(closingTotal)}
          </Text>
        </View>
        {!isBlind && (
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: colors.border,
              paddingTop: s(8),
            }}
          >
            <View
              style={{ flexDirection: "row", justifyContent: "space-between" }}
            >
              <Text
                style={{
                  fontSize: s(12),
                  fontWeight: "700",
                  color: colors.heading,
                }}
              >
                Variance
              </Text>
              <Text
                style={{
                  fontSize: s(13),
                  fontWeight: "700",
                  color: getSignedAmountColor(variance),
                }}
              >
                {renderSignedAmount(variance, uiScale)}
              </Text>
            </View>
          </View>
        )}
      </View>

      <View style={{ marginTop: s(10) }}>
        <Text
          style={{ fontSize: s(11), color: colors.label, marginBottom: s(6) }}
        >
          Notes (optional)
        </Text>
        <TextInput
          value={varianceNotes}
          onChangeText={setVarianceNotes}
          placeholder="Add variance notes..."
          placeholderTextColor={colors.muted}
          multiline
          numberOfLines={2}
          style={{
            minHeight: s(40),
            paddingHorizontal: s(10),
            paddingVertical: s(8),
            backgroundColor: colors.inset,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: s(8),
            color: colors.heading,
            fontSize: s(12),
            textAlignVertical: "top",
          }}
        />
      </View>

      {/* Variance Detail Panel — shown when variance exceeds warning threshold */}
      {!isBlind && Math.abs(variance) >= varianceWarningThreshold && (
        <View style={{ marginTop: s(12) }}>
          <TouchableOpacity
            onPress={() => setVarianceDetailExpanded(!varianceDetailExpanded)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: s(10),
              paddingVertical: s(8),
              backgroundColor:
                Math.abs(variance) >= varianceAlertThreshold
                  ? colors.danger + "15"
                  : colors.warning + "20",
              borderWidth: 1,
              borderColor:
                Math.abs(variance) >= varianceAlertThreshold
                  ? colors.danger + "45"
                  : colors.warning + "50",
              borderRadius: s(10),
            }}
          >
            <Text
              style={{
                fontSize: s(12),
                fontWeight: "700",
                color:
                  Math.abs(variance) >= varianceAlertThreshold
                    ? colors.danger
                    : colors.warning,
              }}
            >
              {varianceDetailExpanded ? "Hide" : "Show"} Variance Analysis
            </Text>
            <Text
              style={{
                fontSize: s(11),
                color: colors.muted,
              }}
            >
              {localVarianceFlags.length > 0
                ? `${localVarianceFlags.length} flag(s)`
                : "No flags"}
            </Text>
          </TouchableOpacity>

          {varianceDetailExpanded && (
            <View
              style={{
                marginTop: s(8),
                backgroundColor: colors.panel,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: s(10),
                padding: s(10),
              }}
            >
              {/* Suspicious patterns */}
              {localVarianceFlags.length > 0 && (
                <View style={{ marginBottom: s(10) }}>
                  <Text
                    style={{
                      fontSize: s(11),
                      fontWeight: "700",
                      color: colors.danger,
                      marginBottom: s(6),
                    }}
                  >
                    Suspicious Patterns
                  </Text>
                  {localVarianceFlags.map((flag, i) => (
                    <View
                      key={i}
                      style={{
                        paddingHorizontal: s(8),
                        paddingVertical: s(6),
                        backgroundColor: colors.danger + "10",
                        borderWidth: 1,
                        borderColor: colors.danger + "30",
                        borderRadius: s(8),
                        marginBottom: s(4),
                      }}
                    >
                      <Text
                        style={{
                          fontSize: s(11),
                          color: colors.danger,
                          fontWeight: "600",
                        }}
                      >
                        {flag.description}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Operations timeline */}
              <Text
                style={{
                  fontSize: s(11),
                  fontWeight: "700",
                  color: colors.label,
                  marginBottom: s(6),
                }}
              >
                Operations Timeline
              </Text>
              {localTimeline.map((op) => {
                const isNoSale = op.operationType === "no_sale";
                const opColor = getOpStyle(op.operationType);
                return (
                  <View
                    key={op.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: s(4),
                      paddingHorizontal: s(6),
                      borderRadius: s(6),
                      marginBottom: s(2),
                      backgroundColor: isNoSale
                        ? colors.warning + "15"
                        : "transparent",
                      borderWidth: isNoSale ? 1 : 0,
                      borderColor: isNoSale
                        ? colors.warning + "30"
                        : "transparent",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: s(10),
                        color: colors.muted,
                        width: s(60),
                      }}
                    >
                      {formatTime(op.performedAt)}
                    </Text>
                    <View
                      style={{
                        paddingHorizontal: s(6),
                        paddingVertical: s(2),
                        borderRadius: s(4),
                        width: s(80),
                        backgroundColor: opColor.bg,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: s(10),
                          fontWeight: "600",
                          color: opColor.text,
                        }}
                      >
                        {OP_LABELS[op.operationType] || op.operationType}
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontSize: s(10),
                        fontWeight: "600",
                        color: isNoEffectOperation(op.operationType)
                          ? colors.muted
                          : isDebitOperation(op.operationType)
                            ? colors.danger
                            : colors.teal,
                        width: s(60),
                        textAlign: "right",
                      }}
                    >
                      {isNoEffectOperation(op.operationType)
                        ? "—"
                        : `${
                            isDebitOperation(op.operationType) ? "-" : "+"
                          }${formatCurrency(op.amount)}`}
                    </Text>
                    <Text
                      style={{
                        fontSize: s(10),
                        color: colors.heading,
                        fontWeight: "500",
                        flex: 1,
                        textAlign: "right",
                      }}
                    >
                      {formatCurrency(op.runningBalance)}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}
    </View>
  );

  const renderCloseViewButton = () => (
    <TouchableOpacity
      onPress={handleClose}
      disabled={isSubmitting}
      style={{
        paddingVertical: s(11),
        borderRadius: s(10),
        alignItems: "center",
        flexDirection: "row",
        justifyContent: "center",
        gap: s(6),
        backgroundColor: isSubmitting ? colors.border : colors.danger,
        opacity: isSubmitting ? 0.6 : 1,
      }}
    >
      <Lock size={s(14)} color={isSubmitting ? colors.muted : colors.onSolid} />
      <Text
        style={{
          fontSize: s(13),
          fontWeight: "700",
          color: isSubmitting ? colors.muted : colors.onSolid,
        }}
      >
        {isSubmitting ? "Closing..." : "Confirm Close"}
      </Text>
    </TouchableOpacity>
  );

  // ── Close summary ──────────────────────────────────────────────────────────
  const renderCloseSummary = () => {
    if (!closeSummary) return null;
    const v = closeSummary.variance;
    return (
      <View>
        <Text
          style={{
            fontSize: s(16),
            fontWeight: "700",
            color: colors.heading,
            marginBottom: s(12),
            textAlign: "center",
          }}
        >
          Drawer Closed
        </Text>
        <View
          style={{
            backgroundColor: colors.panel,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: s(12),
            padding: s(12),
            marginBottom: s(14),
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginBottom: s(8),
            }}
          >
            <Text style={{ fontSize: s(12), color: colors.label }}>
              Expected
            </Text>
            <Text
              style={{
                fontSize: s(12),
                fontWeight: "600",
                color: colors.heading,
              }}
            >
              {formatCurrency(closeSummary.expected)}
            </Text>
          </View>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginBottom: s(8),
            }}
          >
            <Text style={{ fontSize: s(12), color: colors.label }}>Actual</Text>
            <Text
              style={{
                fontSize: s(12),
                fontWeight: "600",
                color: colors.heading,
              }}
            >
              {formatCurrency(closeSummary.actual)}
            </Text>
          </View>
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: colors.border,
              paddingTop: s(8),
            }}
          >
            <View
              style={{ flexDirection: "row", justifyContent: "space-between" }}
            >
              <Text
                style={{
                  fontSize: s(12),
                  fontWeight: "700",
                  color: colors.heading,
                }}
              >
                Variance
              </Text>
              <Text
                style={{
                  fontSize: s(13),
                  fontWeight: "700",
                  color: getSignedAmountColor(v),
                }}
              >
                {renderSignedAmount(v, uiScale)}
              </Text>
            </View>
          </View>
        </View>

        {/* View Full Analysis button — shown when any non-zero variance exists */}
        {Math.abs(v) >= varianceWarningThreshold && (
          <View style={{ marginBottom: s(10) }}>
            <TouchableOpacity
              onPress={handleFetchAnalysis}
              disabled={loadingAnalysis}
              style={{
                paddingVertical: s(9),
                borderRadius: s(10),
                alignItems: "center",
                backgroundColor: colors.danger + "15",
                borderWidth: 1,
                borderColor: colors.danger + "45",
              }}
            >
              <Text
                style={{
                  fontSize: s(12),
                  fontWeight: "700",
                  color: colors.danger,
                }}
              >
                {loadingAnalysis
                  ? "Loading Analysis..."
                  : "View Full Variance Analysis"}
              </Text>
            </TouchableOpacity>

            {/* Server-side analysis results */}
            {varianceAnalysis && (
              <View
                style={{
                  marginTop: s(8),
                  backgroundColor: colors.panel,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: s(10),
                  padding: s(10),
                }}
              >
                {varianceAnalysis.suspiciousPatterns.length > 0 && (
                  <View style={{ marginBottom: s(8) }}>
                    <Text
                      style={{
                        fontSize: s(11),
                        fontWeight: "700",
                        color: colors.danger,
                        marginBottom: s(4),
                      }}
                    >
                      Suspicious Patterns (
                      {varianceAnalysis.suspiciousPatterns.length})
                    </Text>
                    {varianceAnalysis.suspiciousPatterns.map((flag, i) => (
                      <View
                        key={i}
                        style={{
                          paddingHorizontal: s(8),
                          paddingVertical: s(6),
                          backgroundColor: colors.danger + "10",
                          borderWidth: 1,
                          borderColor: colors.danger + "30",
                          borderRadius: s(8),
                          marginBottom: s(4),
                        }}
                      >
                        <Text
                          style={{
                            fontSize: s(11),
                            color: colors.danger,
                            fontWeight: "600",
                          }}
                        >
                          {flag.description}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {varianceAnalysis.noSaleEvents.length > 0 && (
                  <View style={{ marginBottom: s(8) }}>
                    <Text
                      style={{
                        fontSize: s(11),
                        fontWeight: "700",
                        color: colors.warning,
                        marginBottom: s(4),
                      }}
                    >
                      No-Sale Events ({varianceAnalysis.noSaleEvents.length})
                    </Text>
                    {varianceAnalysis.noSaleEvents.map((ev) => (
                      <View
                        key={ev.id}
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          paddingHorizontal: s(8),
                          paddingVertical: s(4),
                          backgroundColor: colors.warning + "10",
                          borderRadius: s(6),
                          marginBottom: s(2),
                        }}
                      >
                        <Text
                          style={{
                            fontSize: s(10),
                            color: colors.warning,
                            fontWeight: "600",
                          }}
                        >
                          {formatTime(ev.performedAt)} —{" "}
                          {ev.performedByName || "Unknown"}
                        </Text>
                        <Text style={{ fontSize: s(10), color: colors.muted }}>
                          {ev.reason || "No reason"}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {varianceAnalysis.suspiciousPatterns.length === 0 &&
                  varianceAnalysis.noSaleEvents.length === 0 && (
                    <Text
                      style={{
                        fontSize: s(11),
                        color: colors.muted,
                        textAlign: "center",
                      }}
                    >
                      No suspicious patterns detected
                    </Text>
                  )}
              </View>
            )}
          </View>
        )}

        <TouchableOpacity
          onPress={onClose}
          style={{
            paddingVertical: s(11),
            borderRadius: s(10),
            alignItems: "center",
            backgroundColor: colors.teal,
          }}
        >
          <Text
            style={{
              fontSize: s(13),
              fontWeight: "700",
              color: colors.onSolid,
            }}
          >
            Done
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <>
      <BottomSheetModal
        ref={bottomSheetRef}
        snapPoints={["75%", "100%"]}
        index={1}
        onDismiss={onClose}
        enablePanDownToClose
        {...bottomSheetTheme}
        backdropComponent={(props) => (
          <BottomSheetBackdrop
            {...props}
            appearsOnIndex={0}
            disappearsOnIndex={-1}
            opacity={0.5}
          />
        )}
      >
        <BottomSheetScrollView
          contentContainerStyle={{
            paddingHorizontal: s(14),
            paddingVertical: s(12),
            paddingBottom: s(12),
          }}
        >
          {/* PERF: This sheet stays mounted while dismissed (gorhom keeps the
              content tree alive), so skip building the view JSX entirely
              while closed — it's all rebuilt by the effect above on reopen. */}
          {isOpen && view === "open" && (
            <>
              {renderOpenView()}
              <View
                style={{
                  marginTop: s(12),
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                  paddingTop: s(12),
                }}
              >
                {renderOpenViewButton()}
              </View>
            </>
          )}
          {isOpen && view === "active" && renderActiveView()}
          {isOpen && view === "close" && (
            <>
              {renderCloseView()}
              <View
                style={{
                  marginTop: s(12),
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                  paddingTop: s(12),
                }}
              >
                {renderCloseViewButton()}
              </View>
            </>
          )}
          {isOpen && view === "close_summary" && renderCloseSummary()}
        </BottomSheetScrollView>
      </BottomSheetModal>

      {/* Rendered OUTSIDE BottomSheetModal so they appear above it */}
      <PayInOutModal
        isOpen={isPayInOutOpen}
        onClose={() => setPayInOutOpen(false)}
        mode={payInOutMode}
      />
      <NoSaleModal isOpen={isNoSaleOpen} onClose={() => setNoSaleOpen(false)} />
    </>
  );
};

export default CashDrawerSheet;
