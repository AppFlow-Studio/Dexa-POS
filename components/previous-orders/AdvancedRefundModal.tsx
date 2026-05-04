import { useToast } from "@/contexts/ToastContext";
import { orderHistoryKeys } from "@/hooks/orders/useOrderHistory";
import {
    useRefundFraudGuard,
    type FraudGuardCheckResult,
} from "@/hooks/useRefundFraudGuard";
import { useRefundVerification } from "@/hooks/useRefundVerification";
import { bottomSheetTheme, colors } from "@/lib/theme";
import { CartItem, OrderProfile, PaymentType } from "@/lib/types";
import {
    getRefundJournalById,
    type RefundJournalEntry,
} from "@/services/refundJournal";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import {
    usePreviousOrdersStore,
    type RefundFraudMetadata,
} from "@/stores/usePreviousOrdersStore";
import BottomSheet, {
    BottomSheetBackdrop,
    BottomSheetFooter,
    BottomSheetScrollView,
    BottomSheetTextInput,
    BottomSheetView,
} from "@gorhom/bottom-sheet";
import { BottomSheetDefaultFooterProps } from "@gorhom/bottom-sheet/lib/typescript/components/bottomSheetFooter/types";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { useQueryClient } from "@tanstack/react-query";
import { Check, CreditCard, DollarSign, X } from "lucide-react-native";
import React, {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from "react";
import { Text, TouchableOpacity, View } from "react-native";
import RefundApprovalModal from "./RefundApprovalModal";

interface AdvancedRefundModalProps {
  onClose: () => void;
  order: OrderProfile | null;
}

export interface AdvancedRefundModalRef {
  open: () => void;
  close: () => void;
}

interface RefundItem {
  itemId: string;
  quantity: number;
  reason: string;
}

const AdvancedRefundModalComponent: React.ForwardRefRenderFunction<
  AdvancedRefundModalRef,
  AdvancedRefundModalProps
> = ({ onClose, order }, ref) => {
  const bottomSheetRef = useRef<BottomSheetMethods>(null);
  const snapPoints = useMemo(() => ["95%"], []);

  const [refundType, setRefundType] = useState<"full" | "partial">("full");
  const [reason, setReason] = useState("");
  const [selectedItems, setSelectedItems] = useState<RefundItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentType>("Card");

  // Wave R-2: refund verifying state (in-flow recovery)
  type RefundView = "form" | "verifying" | "reconciliation";
  const [refundView, setRefundView] = useState<RefundView>("form");
  const [activeRecoveryJournal, setActiveRecoveryJournal] =
    useState<RefundJournalEntry | null>(null);
  const [reconciliationAdoptionError, setReconciliationAdoptionError] =
    useState<string | null>(null);

  const {
    isVerifying,
    elapsedMs,
    totalMs,
    matchedRefund,
    canRetryNow,
    manualCheckNow,
    markComplete,
    retryRefund,
    markRefundAsCompleted,
    markRefundAsNotCompleted,
    isAdopting,
    adoptionError,
  } = useRefundVerification(activeRecoveryJournal);

  const { show } = useToast();
  const queryClient = useQueryClient();
  const { refundFullOrder, refundItems } = usePreviousOrdersStore();
  const { checkRefund, recordAndNotify } = useRefundFraudGuard();
  const [approvalModalVisible, setApprovalModalVisible] = useState(false);
  const [pendingRefundType, setPendingRefundType] = useState<
    "full" | "partial" | null
  >(null);
  const lastGuardRef = useRef<FraudGuardCheckResult | null>(null);

  useImperativeHandle(ref, () => ({
    open: () => {
      // Ensure the previous orders store has data for the refund lookup
      usePreviousOrdersStore.getState().refreshPreviousOrders({ force: true });
      bottomSheetRef.current?.snapToIndex(0);
    },
    close: () => bottomSheetRef.current?.close(),
  }));

  const orderId = order?.id ?? "";
  const orderTotal = order?.total_amount ?? 0;

  const refundedAmount = useMemo(
    () =>
      (order?.payments || []).reduce((sum, payment) => {
        return sum + (payment.refundedAmount ?? 0);
      }, 0),
    [order?.payments],
  );

  const canDoFullRefund = refundedAmount < 0.01;

  useEffect(() => {
    if (!order) return;

    setRefundType(canDoFullRefund ? "full" : "partial");
    setReason("");
    setSelectedItems([]);
    setPaymentMethod("Card");
  }, [order, canDoFullRefund]);

  const refundableItems = useMemo(() => {
    if (!order) return [];
    return order.items.filter(
      (item) => (item.refundedQuantity || 0) < item.quantity,
    );
  }, [order]);

  const selectedMap = useMemo(() => {
    const map = new Map<string, RefundItem>();
    selectedItems.forEach((item) => map.set(item.itemId, item));
    return map;
  }, [selectedItems]);

  const calculateRefundAmount = () => {
    if (refundType === "full") return orderTotal;
    if (!order) return 0;

    return selectedItems.reduce((total, selectedItem) => {
      const item = order.items.find((i) => i.id === selectedItem.itemId);
      return total + (item ? item.price * selectedItem.quantity : 0);
    }, 0);
  };

  const toggleItemSelection = (item: CartItem) => {
    const exists = selectedItems.some(
      (selected) => selected.itemId === item.id,
    );

    if (exists) {
      setSelectedItems((prev) =>
        prev.filter((selected) => selected.itemId !== item.id),
      );
      return;
    }

    const maxRefundableQty = item.quantity - (item.refundedQuantity || 0);
    setSelectedItems((prev) => [
      ...prev,
      { itemId: item.id, quantity: maxRefundableQty, reason: "" },
    ]);
  };

  const updateItemQuantity = (itemId: string, quantity: number) => {
    setSelectedItems((prev) =>
      prev.map((item) => {
        if (item.itemId !== itemId) return item;
        return { ...item, quantity };
      }),
    );
  };

  const updateItemReason = (itemId: string, itemReason: string) => {
    setSelectedItems((prev) =>
      prev.map((item) => {
        if (item.itemId !== itemId) return item;
        return { ...item, reason: itemReason };
      }),
    );
  };

  const getActiveEmployee = (): { staffId: string | null; name: string } => {
    const empStore = useEmployeeStore.getState();
    const activeEmpId = empStore.activeEmployeeId;
    const emp = activeEmpId ? empStore.getEmployeeById(activeEmpId) : null;
    return {
      staffId: emp?.profileId ?? null,
      name: emp?.fullName || "Cashier",
    };
  };

  const buildFraudMetadata = (
    guard: FraudGuardCheckResult,
    managerId?: string,
    managerName?: string,
  ): RefundFraudMetadata | undefined => {
    if (!guard.isSelfRefund || !guard.isCashRefund) return undefined;
    const flags: string[] = ["same_cashier_refund"];
    if (guard.velocity.shouldBlock) flags.push("velocity_blocked");
    return {
      fraudFlags: flags,
      velocityCount: guard.velocity.selfRefundCount,
      approvedByManagerId: managerId,
      approvedByManagerName: managerName,
    };
  };

  const processFullRefund = async (
    managerId?: string,
    managerName?: string,
  ) => {
    const { staffId, name } = getActiveEmployee();
    if (!staffId) {
      show({
        title: "Employee Required",
        message: "An active employee must be signed in to process refunds.",
        type: "error",
      });
      return;
    }
    const guard = lastGuardRef.current;
    const metadata = guard
      ? buildFraudMetadata(guard, managerId, managerName)
      : undefined;

    const outcome = await refundFullOrder(
      orderId,
      reason,
      staffId,
      name,
      paymentMethod,
      metadata,
    );

    // Wave R-2: terminal approved but backend RPC had transient error — show verifying view
    if (outcome?.kind === "verifying") {
      const journal = getRefundJournalById(outcome.journalId);
      setActiveRecoveryJournal(journal ?? null);
      setRefundView("verifying");
      return;
    }

    if (outcome?.kind === "error") {
      show({
        title: "Refund Failed",
        message: outcome.error || "The refund could not be processed.",
        type: "error",
      });
      return;
    }

    // Success (kind === 'success' or undefined for backward-compat)
    if (guard?.isSelfRefund && guard?.isCashRefund) {
      const velocity = recordAndNotify({
        orderId,
        amount: orderTotal,
        approvedByManagerId: managerId,
        approvedByManagerName: managerName,
      });
      if (velocity?.shouldAlert) {
        show({
          title: "Refund Flagged",
          message: `Same-cashier cash refund #${velocity.selfRefundCount} in the past hour. This has been flagged for review.`,
          type: "warning",
        });
      } else {
        show({
          title: "Refund Successful",
          message: "The full refund has been processed successfully.",
          type: "success",
        });
      }
    } else {
      show({
        title: "Refund Successful",
        message: "The full refund has been processed successfully.",
        type: "success",
      });
    }

    queryClient.invalidateQueries({ queryKey: orderHistoryKeys.all });
    bottomSheetRef.current?.close();
  };

  const processPartialRefund = async (
    managerId?: string,
    managerName?: string,
  ) => {
    const { staffId, name } = getActiveEmployee();
    if (!staffId) {
      show({
        title: "Employee Required",
        message: "An active employee must be signed in to process refunds.",
        type: "error",
      });
      return;
    }
    const guard = lastGuardRef.current;
    const metadata = guard
      ? buildFraudMetadata(guard, managerId, managerName)
      : undefined;

    const outcome = await refundItems(
      orderId,
      selectedItems,
      staffId,
      name,
      paymentMethod,
      metadata,
    );

    // Wave R-2: verifying state
    if (outcome?.kind === "verifying") {
      const journal = getRefundJournalById(outcome.journalId);
      setActiveRecoveryJournal(journal ?? null);
      setRefundView("verifying");
      return;
    }

    if (outcome?.kind === "error") {
      show({
        title: "Refund Failed",
        message: outcome.error || "The refund could not be processed.",
        type: "error",
      });
      return;
    }

    if (guard?.isSelfRefund && guard?.isCashRefund) {
      const refundAmt = calculateRefundAmount();
      const velocity = recordAndNotify({
        orderId,
        amount: refundAmt,
        approvedByManagerId: managerId,
        approvedByManagerName: managerName,
      });
      if (velocity?.shouldAlert) {
        show({
          title: "Refund Flagged",
          message: `Same-cashier cash refund #${velocity.selfRefundCount} in the past hour. This has been flagged for review.`,
          type: "warning",
        });
      } else {
        show({
          title: "Refund Successful",
          message: "The partial refund has been processed successfully.",
          type: "success",
        });
      }
    } else {
      show({
        title: "Refund Successful",
        message: "The partial refund has been processed successfully.",
        type: "success",
      });
    }

    queryClient.invalidateQueries({ queryKey: orderHistoryKeys.all });
    bottomSheetRef.current?.close();
  };

  const handleFullRefund = async () => {
    if (!reason.trim()) {
      show({
        title: "Reason Required",
        message: "Please provide a reason for the full refund.",
        type: "error",
      });
      return;
    }

    const guard = checkRefund({
      orderCreatedByStaffProfileId: order?.created_by_staff_profile_id,
      paymentMethod,
    });
    lastGuardRef.current = guard;

    if (
      guard.isSelfRefund &&
      guard.isCashRefund &&
      guard.velocity.shouldBlock
    ) {
      setPendingRefundType("full");
      setApprovalModalVisible(true);
      return;
    }

    await processFullRefund();
  };

  const handlePartialRefund = async () => {
    if (selectedItems.length === 0) {
      show({
        title: "No Items Selected",
        message: "Please select one or more items to process a partial refund.",
        type: "error",
      });
      return;
    }

    const itemsWithReasons = selectedItems.filter((item) => item.reason.trim());
    if (itemsWithReasons.length !== selectedItems.length) {
      show({
        title: "Reason Required",
        message: "Please provide a reason for each item selected for refund.",
        type: "error",
      });
      return;
    }

    const guard = checkRefund({
      orderCreatedByStaffProfileId: order?.created_by_staff_profile_id,
      paymentMethod,
    });
    lastGuardRef.current = guard;

    if (
      guard.isSelfRefund &&
      guard.isCashRefund &&
      guard.velocity.shouldBlock
    ) {
      setPendingRefundType("partial");
      setApprovalModalVisible(true);
      return;
    }

    await processPartialRefund();
  };

  const onManagerApproved = async (
    managerProfileId: string,
    managerName: string,
  ) => {
    setApprovalModalVisible(false);
    if (pendingRefundType === "full") {
      await processFullRefund(managerProfileId, managerName);
    } else if (pendingRefundType === "partial") {
      await processPartialRefund(managerProfileId, managerName);
    }
    setPendingRefundType(null);
  };

  const renderBackdrop = useMemo(
    () => (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.7}
      />
    ),
    [],
  );

  const renderFooter = useCallback(
    (props: BottomSheetDefaultFooterProps) => (
      <BottomSheetFooter {...props} bottomInset={0}>
        <View
          style={{
            paddingHorizontal: 16,
            paddingVertical: 10,
            backgroundColor: colors.panel,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <TouchableOpacity
            onPress={
              refundType === "full" ? handleFullRefund : handlePartialRefund
            }
            style={{
              width: "100%",
              paddingVertical: 8,
              backgroundColor: colors.teal,
              borderRadius: 8,
              alignItems: "center",
            }}
          >
            <Text
              style={{ fontSize: 12, fontWeight: "700", color: colors.onSolid }}
            >
              PROCESS REFUND
            </Text>
          </TouchableOpacity>
        </View>
      </BottomSheetFooter>
    ),
    [refundType],
  );

  if (!order) return null;

  const refundAmount = calculateRefundAmount();

  // Wave R-2: handle match-found on verifying view
  const onVerifyingMarkComplete = () => {
    markComplete();
    setActiveRecoveryJournal(null);
    setRefundView("form");
    queryClient.invalidateQueries({ queryKey: orderHistoryKeys.all });
    show({
      title: "Refund Confirmed",
      message: "The refund was successfully reconciled.",
      type: "success",
    });
    bottomSheetRef.current?.close();
  };

  const onVerifyingRetry = () => {
    retryRefund();
    // Stay on verifying view — polling will resume
  };

  const onVerifyingReconcile = () => {
    // Open reconciliation modal for TCP-in-flight (no terminalTxnId)
    setRefundView("reconciliation");
  };

  const onReconciliationYes = async () => {
    setReconciliationAdoptionError(null);
    await markRefundAsCompleted();
    if (!adoptionError) {
      setActiveRecoveryJournal(null);
      setRefundView("form");
      queryClient.invalidateQueries({ queryKey: orderHistoryKeys.all });
      show({
        title: "Refund Recorded",
        message: "The terminal-approved refund has been recorded.",
        type: "success",
      });
      bottomSheetRef.current?.close();
    }
  };

  const onReconciliationNo = () => {
    markRefundAsNotCompleted();
    setActiveRecoveryJournal(null);
    setRefundView("form");
    show({
      title: "Refund Discarded",
      message: "The refund attempt has been marked as not completed.",
      type: "info",
    });
  };

  const progressPct = Math.min(1, elapsedMs / Math.max(1, totalMs));

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      footerComponent={renderFooter}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      onClose={onClose}
      {...bottomSheetTheme}
    >
      <BottomSheetView style={{ flex: 1, backgroundColor: colors.panel }}>
        {/* Wave R-2: Verifying overlay — shown when refund hit a transient backend error */}
        {refundView === "verifying" && (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 100,
              backgroundColor: colors.panel,
              justifyContent: "center",
              alignItems: "center",
              paddingHorizontal: 24,
            }}
          >
            <View style={{ width: "100%", maxWidth: 380 }}>
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "700",
                  color: "#0C4FD1",
                  textAlign: "center",
                  marginBottom: 4,
                }}
              >
                Verifying Refund
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: colors.label,
                  textAlign: "center",
                  marginBottom: 24,
                }}
              >
                The terminal approved the refund. Confirming with the server…
              </Text>

              {/* Progress bar */}
              <View
                style={{
                  height: 4,
                  backgroundColor: colors.border,
                  borderRadius: 2,
                  marginBottom: 12,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    height: "100%",
                    width: `${Math.round(progressPct * 100)}%`,
                    backgroundColor: "#0C4FD1",
                    borderRadius: 2,
                  }}
                />
              </View>
              <Text
                style={{
                  fontSize: 11,
                  color: colors.muted,
                  textAlign: "center",
                  marginBottom: 24,
                }}
              >
                {Math.ceil((totalMs - elapsedMs) / 1000)}s remaining
              </Text>

              {matchedRefund?.matched && (
                <TouchableOpacity
                  onPress={onVerifyingMarkComplete}
                  style={{
                    backgroundColor: "#0C4FD1",
                    borderRadius: 8,
                    paddingVertical: 10,
                    alignItems: "center",
                    marginBottom: 10,
                  }}
                >
                  <Text
                    style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}
                  >
                    Refund Confirmed — Close
                  </Text>
                </TouchableOpacity>
              )}

              {canRetryNow && !matchedRefund?.matched && (
                <TouchableOpacity
                  onPress={onVerifyingRetry}
                  style={{
                    backgroundColor: colors.teal,
                    borderRadius: 8,
                    paddingVertical: 10,
                    alignItems: "center",
                    marginBottom: 10,
                  }}
                >
                  <Text
                    style={{
                      color: colors.onSolid,
                      fontWeight: "700",
                      fontSize: 13,
                    }}
                  >
                    Try Again
                  </Text>
                </TouchableOpacity>
              )}

              {/* Manual reconciliation for TCP-in-flight (no terminalTxnId) */}
              {activeRecoveryJournal?.status === "initiated" &&
                !activeRecoveryJournal?.terminalTxnId && (
                  <TouchableOpacity
                    onPress={onVerifyingReconcile}
                    style={{
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 8,
                      paddingVertical: 10,
                      alignItems: "center",
                      marginBottom: 10,
                    }}
                  >
                    <Text
                      style={{
                        color: colors.label,
                        fontWeight: "600",
                        fontSize: 12,
                      }}
                    >
                      Manual Reconciliation
                    </Text>
                  </TouchableOpacity>
                )}

              <TouchableOpacity
                onPress={() => manualCheckNow()}
                style={{ paddingVertical: 8, alignItems: "center" }}
              >
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  Check Now
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Wave R-3: Reconciliation overlay — operator confirms terminal display */}
        {refundView === "reconciliation" && (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 100,
              backgroundColor: colors.panel,
              justifyContent: "center",
              alignItems: "center",
              paddingHorizontal: 24,
            }}
          >
            <View style={{ width: "100%", maxWidth: 380 }}>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "700",
                  color: colors.heading,
                  textAlign: "center",
                  marginBottom: 8,
                }}
              >
                Check Terminal Display
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: colors.label,
                  textAlign: "center",
                  marginBottom: 28,
                }}
              >
                Did the terminal display "APPROVED" for the refund of $
                {(activeRecoveryJournal?.amount ?? 0).toFixed(2)}?
              </Text>

              {(adoptionError || reconciliationAdoptionError) && (
                <Text
                  style={{
                    color: "#DC2626",
                    fontSize: 12,
                    textAlign: "center",
                    marginBottom: 12,
                  }}
                >
                  {adoptionError || reconciliationAdoptionError}
                </Text>
              )}

              <TouchableOpacity
                onPress={onReconciliationYes}
                disabled={isAdopting}
                style={{
                  backgroundColor: "#16A34A",
                  borderRadius: 8,
                  paddingVertical: 12,
                  alignItems: "center",
                  marginBottom: 10,
                  opacity: isAdopting ? 0.6 : 1,
                }}
              >
                <Text
                  style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}
                >
                  {isAdopting ? "Recording…" : "Yes — Terminal showed APPROVED"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={onReconciliationNo}
                disabled={isAdopting}
                style={{
                  borderWidth: 1,
                  borderColor: "#DC2626",
                  borderRadius: 8,
                  paddingVertical: 12,
                  alignItems: "center",
                  opacity: isAdopting ? 0.4 : 1,
                }}
              >
                <Text
                  style={{ color: "#DC2626", fontWeight: "600", fontSize: 13 }}
                >
                  No — Terminal did not approve
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setRefundView("verifying")}
                disabled={isAdopting}
                style={{
                  paddingVertical: 10,
                  alignItems: "center",
                  marginTop: 8,
                }}
              >
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  Back to Verifying
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View
          style={{
            paddingHorizontal: 16,
            paddingBottom: 10,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <View>
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: "700",
                  color: colors.heading,
                }}
              >
                Process Refund
              </Text>
              <Text style={{ fontSize: 12, color: colors.label }}>
                Order #{order.display_number || order.order_number || orderId} |
                ${orderTotal.toFixed(2)}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => bottomSheetRef.current?.close()}
              style={{
                padding: 6,
                backgroundColor: colors.teal + "10",
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.teal + "30",
              }}
            >
              <X color={colors.teal} size={16} />
            </TouchableOpacity>
          </View>
        </View>

        <BottomSheetScrollView
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 80,
          }}
          showsVerticalScrollIndicator
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: "600",
              color: colors.muted,
              textTransform: "uppercase",
              letterSpacing: 0.6,
              marginBottom: 6,
            }}
          >
            Refund Type
          </Text>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
            <ChoiceButton
              title="Full Refund"
              subtitle={`$${orderTotal.toFixed(2)}`}
              active={refundType === "full"}
              disabled={!canDoFullRefund}
              onPress={() => setRefundType("full")}
            />
            <ChoiceButton
              title="Partial"
              subtitle="Select items"
              active={refundType === "partial"}
              onPress={() => setRefundType("partial")}
            />
          </View>

          <SectionDivider />

          <Text
            style={{
              fontSize: 11,
              fontWeight: "600",
              color: colors.muted,
              textTransform: "uppercase",
              letterSpacing: 0.6,
              marginBottom: 6,
            }}
          >
            Refund Method
          </Text>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
            <MethodButton
              label="Card"
              active={paymentMethod === "Card"}
              icon={
                <CreditCard
                  color={paymentMethod === "Card" ? colors.teal : colors.label}
                  size={14}
                />
              }
              onPress={() => setPaymentMethod("Card")}
            />
            <MethodButton
              label="Cash"
              active={paymentMethod === "Cash"}
              icon={
                <DollarSign
                  color={paymentMethod === "Cash" ? colors.teal : colors.label}
                  size={14}
                />
              }
              onPress={() => setPaymentMethod("Cash")}
            />
          </View>

          <SectionDivider />

          {refundType === "full" && (
            <>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "600",
                  color: colors.muted,
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                  marginBottom: 6,
                }}
              >
                Reason
              </Text>
              <BottomSheetTextInput
                value={reason}
                onChangeText={setReason}
                placeholder="Enter reason for the refund..."
                placeholderTextColor={colors.muted}
                multiline
                style={{
                  backgroundColor: colors.screen,
                  color: colors.heading,
                  padding: 10,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                  fontSize: 13,
                  minHeight: 68,
                  textAlignVertical: "top",
                }}
              />
              <SectionDivider />
            </>
          )}

          {refundType === "partial" && (
            <>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "600",
                  color: colors.muted,
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                  marginBottom: 6,
                }}
              >
                Select Items
              </Text>
              <View style={{ gap: 8 }}>
                {refundableItems.map((item) => {
                  const isSelected = selectedMap.has(item.id);
                  const maxRefundable =
                    item.quantity - (item.refundedQuantity || 0);
                  const currentQty =
                    selectedMap.get(item.id)?.quantity || maxRefundable;
                  const currentReason = selectedMap.get(item.id)?.reason || "";

                  return (
                    <View
                      key={item.id}
                      style={{
                        padding: 10,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: isSelected
                          ? colors.teal + "50"
                          : colors.border,
                        backgroundColor: isSelected
                          ? colors.teal + "10"
                          : colors.screen,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: "600",
                              color: colors.heading,
                            }}
                          >
                            {item.name}
                          </Text>
                          <Text style={{ fontSize: 11, color: colors.label }}>
                            {maxRefundable} x ${item.price?.toFixed(2)}
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => toggleItemSelection(item)}
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: 8,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: isSelected
                              ? colors.danger + "15"
                              : colors.success + "15",
                            borderWidth: 1,
                            borderColor: isSelected
                              ? colors.danger + "40"
                              : colors.success + "40",
                          }}
                        >
                          {isSelected ? (
                            <X color={colors.danger} size={14} />
                          ) : (
                            <Check color={colors.success} size={14} />
                          )}
                        </TouchableOpacity>
                      </View>

                      {isSelected && (
                        <View style={{ marginTop: 8, gap: 6 }}>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <Text style={{ fontSize: 12, color: colors.label }}>
                              Qty:
                            </Text>
                            <BottomSheetTextInput
                              value={String(currentQty)}
                              onChangeText={(value) =>
                                updateItemQuantity(
                                  item.id,
                                  parseInt(value, 10) || 0,
                                )
                              }
                              keyboardType="numeric"
                              style={{
                                flex: 1,
                                backgroundColor: colors.screen,
                                color: colors.heading,
                                padding: 7,
                                borderRadius: 8,
                                borderWidth: 1,
                                borderColor: colors.border,
                                fontSize: 12,
                                textAlign: "center",
                              }}
                            />
                            <Text style={{ fontSize: 12, color: colors.label }}>
                              / {maxRefundable}
                            </Text>
                          </View>

                          <BottomSheetTextInput
                            value={currentReason}
                            onChangeText={(value) =>
                              updateItemReason(item.id, value)
                            }
                            placeholder="Reason..."
                            placeholderTextColor={colors.muted}
                            style={{
                              backgroundColor: colors.screen,
                              color: colors.heading,
                              padding: 8,
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: colors.border,
                              fontSize: 12,
                            }}
                          />
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
              <SectionDivider />
            </>
          )}

          <Text
            style={{
              fontSize: 11,
              fontWeight: "600",
              color: colors.muted,
              textTransform: "uppercase",
              letterSpacing: 0.6,
              marginBottom: 6,
            }}
          >
            Summary
          </Text>
          <View
            style={{
              padding: 10,
              backgroundColor: colors.screen,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 4,
              }}
            >
              <Text style={{ fontSize: 12, color: colors.label }}>
                Original Total
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  color: colors.heading,
                }}
              >
                ${orderTotal.toFixed(2)}
              </Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <Text style={{ fontSize: 12, color: colors.danger }}>
                Refund Amount
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "700",
                  color: colors.danger,
                }}
              >
                -${refundAmount.toFixed(2)}
              </Text>
            </View>
            <View
              style={{
                height: 1,
                backgroundColor: colors.border,
                marginBottom: 8,
              }}
            />
            <View
              style={{ flexDirection: "row", justifyContent: "space-between" }}
            >
              <Text
                style={{
                  fontSize: 13,
                  color: colors.heading,
                  fontWeight: "700",
                }}
              >
                New Total
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: colors.heading,
                  fontWeight: "700",
                }}
              >
                ${(orderTotal - refundAmount).toFixed(2)}
              </Text>
            </View>
          </View>
        </BottomSheetScrollView>
      </BottomSheetView>

      <RefundApprovalModal
        visible={approvalModalVisible}
        employeeName={lastGuardRef.current?.activeEmployeeName || "Cashier"}
        refundCount={lastGuardRef.current?.velocity.selfRefundCount || 0}
        onApproved={onManagerApproved}
        onCancel={() => {
          setApprovalModalVisible(false);
          setPendingRefundType(null);
        }}
      />
    </BottomSheet>
  );
};

const ChoiceButton = ({
  title,
  subtitle,
  active,
  onPress,
  disabled = false,
}: {
  title: string;
  subtitle: string;
  active: boolean;
  onPress: () => void;
  disabled?: boolean;
}) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={disabled}
    style={{
      flex: 1,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: active ? colors.teal + "50" : colors.border,
      backgroundColor: active ? colors.teal + "10" : colors.screen,
      opacity: disabled ? 0.5 : 1,
    }}
  >
    <Text
      style={{
        fontSize: 12,
        fontWeight: "700",
        textAlign: "center",
        color: active ? colors.teal : colors.heading,
      }}
    >
      {title}
    </Text>
    <Text
      style={{
        fontSize: 11,
        textAlign: "center",
        marginTop: 2,
        color: active ? colors.teal : colors.label,
      }}
    >
      {subtitle}
    </Text>
  </TouchableOpacity>
);

const MethodButton = ({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onPress: () => void;
}) => (
  <TouchableOpacity
    onPress={onPress}
    style={{
      flex: 1,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: active ? colors.teal + "50" : colors.border,
      backgroundColor: active ? colors.teal + "10" : colors.screen,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    }}
  >
    {icon}
    <Text
      style={{
        fontSize: 12,
        fontWeight: "600",
        color: active ? colors.teal : colors.heading,
      }}
    >
      {label}
    </Text>
  </TouchableOpacity>
);

const SectionDivider = () => (
  <View
    style={{ height: 1, backgroundColor: colors.border, marginBottom: 12 }}
  />
);

const AdvancedRefundModal = forwardRef(AdvancedRefundModalComponent);
AdvancedRefundModal.displayName = "AdvancedRefundModal";

export default AdvancedRefundModal;
