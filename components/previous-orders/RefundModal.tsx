import { useToast } from "@/contexts/ToastContext";
import { useRefundFraudGuard, type FraudGuardCheckResult } from "@/hooks/useRefundFraudGuard";
import { PaymentType, PreviousOrder } from "@/lib/types";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { usePreviousOrdersStore, type RefundFraudMetadata } from "@/stores/usePreviousOrdersStore";
import { Check, X } from "lucide-react-native";
import React, { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { resolveRefundToast } from "./refundOutcome";
import RefundApprovalModal from "./RefundApprovalModal";

interface RefundModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: PreviousOrder | null;
}

const RefundModal: React.FC<RefundModalProps> = ({
  isOpen,
  onClose,
  order,
}) => {
  const [refundType, setRefundType] = useState<"full" | "partial">("full");
  const [reason, setReason] = useState("");
  const [selectedItems, setSelectedItems] = useState<
    Array<{ itemId: string; quantity: number; reason: string }>
  >([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentType>("Card");
  const { show } = useToast();

  const { refundFullOrder, refundItems } = usePreviousOrdersStore();
  const { checkRefund, recordAndNotify } = useRefundFraudGuard();
  const [approvalModalVisible, setApprovalModalVisible] = useState(false);
  const [pendingRefundType, setPendingRefundType] = useState<"full" | "partial" | null>(null);
  const lastGuardRef = useRef<FraudGuardCheckResult | null>(null);

  if (!order) return null;

  const getActiveEmployee = (): { staffId: string | null; name: string } => {
    const empStore = useEmployeeStore.getState();
    const activeEmpId = empStore.activeEmployeeId;
    const emp = activeEmpId ? empStore.getEmployeeById(activeEmpId) : null;
    return { staffId: emp?.profileId ?? null, name: emp?.fullName || "Cashier" };
  };

  const buildFraudMetadata = (guard: FraudGuardCheckResult, managerId?: string, managerName?: string): RefundFraudMetadata | undefined => {
    if (!guard.isSelfRefund || !guard.isCashRefund) return undefined;
    const flags: string[] = ["same_cashier_refund"];
    if (guard.velocity.shouldBlock) flags.push("velocity_blocked");
    return { fraudFlags: flags, velocityCount: guard.velocity.selfRefundCount, approvedByManagerId: managerId, approvedByManagerName: managerName };
  };

  const processFullRefund = async (managerId?: string, managerName?: string) => {
    const { staffId, name } = getActiveEmployee();
    if (!staffId) {
      show({ title: "Employee Required", message: "An active employee must be signed in to process refunds.", type: "error" });
      return;
    }
    const guard = lastGuardRef.current;
    const metadata = guard ? buildFraudMetadata(guard, managerId, managerName) : undefined;
    const outcome = await refundFullOrder(order.orderId, reason, staffId, name, paymentMethod, metadata);
    const result = resolveRefundToast(outcome, {
      successTitle: "Refund Successful",
      successMessage: "The full refund has been processed successfully.",
    });
    if (!result.ok) {
      show(result.toast);
      return;
    }
    if (guard?.isSelfRefund && guard?.isCashRefund) {
      const velocity = recordAndNotify({ orderId: order.orderId, amount: order.total, approvedByManagerId: managerId, approvedByManagerName: managerName });
      show(velocity?.shouldAlert ? { title: "Refund Flagged", message: `Same-cashier cash refund #${velocity.selfRefundCount} in the past hour. This has been flagged for review.`, type: "warning" } : result.toast);
    } else {
      show(result.toast);
    }
    onClose();
  };

  const processPartialRefund = async (managerId?: string, managerName?: string) => {
    const { staffId, name } = getActiveEmployee();
    if (!staffId) {
      show({ title: "Employee Required", message: "An active employee must be signed in to process refunds.", type: "error" });
      return;
    }
    const guard = lastGuardRef.current;
    const metadata = guard ? buildFraudMetadata(guard, managerId, managerName) : undefined;
    const outcome = await refundItems(order.orderId, selectedItems, staffId, name, paymentMethod, metadata);
    const result = resolveRefundToast(outcome, {
      successTitle: "Refund Successful",
      successMessage: "The partial refund has been processed successfully.",
    });
    if (!result.ok) {
      show(result.toast);
      return;
    }
    if (guard?.isSelfRefund && guard?.isCashRefund) {
      const velocity = recordAndNotify({ orderId: order.orderId, amount: calculateRefundAmount(), approvedByManagerId: managerId, approvedByManagerName: managerName });
      show(velocity?.shouldAlert ? { title: "Refund Flagged", message: `Same-cashier cash refund #${velocity.selfRefundCount} in the past hour. This has been flagged for review.`, type: "warning" } : result.toast);
    } else {
      show(result.toast);
    }
    onClose();
  };

  const handleFullRefund = () => {
    if (!reason.trim()) {
      show({ title: "Reason Required", message: "A reason must be provided to process a full refund.", type: "error" });
      return;
    }
    const guard = checkRefund({ orderCreatedByStaffProfileId: order.created_by_staff_profile_id, paymentMethod });
    lastGuardRef.current = guard;
    if (guard.isSelfRefund && guard.isCashRefund && guard.velocity.shouldBlock) {
      setPendingRefundType("full");
      setApprovalModalVisible(true);
      return;
    }
    processFullRefund();
  };

  const handlePartialRefund = () => {
    if (selectedItems.length === 0) {
      show({ title: "No Items Selected", message: "Please select one or more items to process a partial refund.", type: "error" });
      return;
    }
    const guard = checkRefund({ orderCreatedByStaffProfileId: order.created_by_staff_profile_id, paymentMethod });
    lastGuardRef.current = guard;
    if (guard.isSelfRefund && guard.isCashRefund && guard.velocity.shouldBlock) {
      setPendingRefundType("partial");
      setApprovalModalVisible(true);
      return;
    }
    processPartialRefund();
  };

  const onManagerApproved = async (managerProfileId: string, managerName: string) => {
    setApprovalModalVisible(false);
    if (pendingRefundType === "full") await processFullRefund(managerProfileId, managerName);
    else if (pendingRefundType === "partial") await processPartialRefund(managerProfileId, managerName);
    setPendingRefundType(null);
  };

  const toggleItemSelection = (itemId: string, maxQuantity: number) => {
    const existingIndex = selectedItems.findIndex(
      (item) => item.itemId === itemId
    );

    if (existingIndex >= 0) {
      // Remove item
      setSelectedItems((prev) => prev.filter((item) => item.itemId !== itemId));
    } else {
      // Add item with full quantity
      setSelectedItems((prev) => [
        ...prev,
        { itemId, quantity: maxQuantity, reason: "" },
      ]);
    }
  };

  const updateItemQuantity = (itemId: string, quantity: number) => {
    setSelectedItems((prev) =>
      prev.map((item) =>
        item.itemId === itemId ? { ...item, quantity } : item
      )
    );
  };

  const updateItemReason = (itemId: string, reason: string) => {
    setSelectedItems((prev) =>
      prev.map((item) => (item.itemId === itemId ? { ...item, reason } : item))
    );
  };

  const getSelectedItemQuantity = (itemId: string) => {
    const item = selectedItems.find((item) => item.itemId === itemId);
    return item?.quantity || 0;
  };

  const getSelectedItemReason = (itemId: string) => {
    const item = selectedItems.find((item) => item.itemId === itemId);
    return item?.reason || "";
  };

  const calculateRefundAmount = () => {
    if (refundType === "full") {
      return order.total;
    }

    return selectedItems.reduce((total, selectedItem) => {
      const item = order.items.find((i) => i.id === selectedItem.itemId);
      return total + (item ? item.price * selectedItem.quantity : 0);
    }, 0);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[600px] max-h-[80vh] bg-white rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-gray-800">
            Process Refund
          </DialogTitle>
          <Text className="text-gray-600 mt-2">
            Order #{order.orderId} - ${order.total.toFixed(2)}
          </Text>
        </DialogHeader>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
        >
          <ScrollView className="flex-1">
            {/* Refund Type Selection */}
            <View className="mb-6">
              <Text className="text-lg font-semibold text-gray-800 mb-3">
                Refund Type
              </Text>
              <View className="flex-row gap-3">
                <TouchableOpacity
                  onPress={() => setRefundType("full")}
                  className={`flex-1 py-3 px-4 rounded-lg border-2 ${
                    refundType === "full"
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-300"
                  }`}
                >
                  <Text
                    className={`font-semibold text-center ${
                      refundType === "full" ? "text-blue-600" : "text-gray-600"
                    }`}
                  >
                    Full Refund
                  </Text>
                  <Text className="text-sm text-center text-gray-500 mt-1">
                    ${order.total.toFixed(2)}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setRefundType("partial")}
                  className={`flex-1 py-3 px-4 rounded-lg border-2 ${
                    refundType === "partial"
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-300"
                  }`}
                >
                  <Text
                    className={`font-semibold text-center ${
                      refundType === "partial"
                        ? "text-blue-600"
                        : "text-gray-600"
                    }`}
                  >
                    Partial Refund
                  </Text>
                  <Text className="text-sm text-center text-gray-500 mt-1">
                    Select Items
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Payment Method */}
            <View className="mb-6">
              <Text className="text-lg font-semibold text-gray-800 mb-3">
                Refund Method
              </Text>
              <View className="flex-row gap-3">
                {(["Card", "Cash"] as PaymentType[]).map((method) => (
                  <TouchableOpacity
                    key={method}
                    onPress={() => setPaymentMethod(method)}
                    className={`flex-1 py-3 px-4 rounded-lg border-2 ${
                      paymentMethod === method
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-300"
                    }`}
                  >
                    <Text
                      className={`font-semibold text-center ${
                        paymentMethod === method
                          ? "text-blue-600"
                          : "text-gray-600"
                      }`}
                    >
                      {method}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Full Refund Section */}
            {refundType === "full" && (
              <View className="mb-6">
                <Text className="text-lg font-semibold text-gray-800 mb-3">
                  Reason for Refund
                </Text>
                <TextInput
                  value={reason}
                  onChangeText={setReason}
                  placeholder="Enter reason for refund..."
                  multiline
                  numberOfLines={3}
                  className="w-full p-3 border border-gray-300 rounded-lg text-gray-800 h-20"
                />
              </View>
            )}

            {/* Partial Refund Section */}
            {refundType === "partial" && (
              <View className="mb-6">
                <Text className="text-lg font-semibold text-gray-800 mb-3">
                  Select Items to Refund
                </Text>
                <ScrollView className="max-h-60">
                  {order.items.map((item) => {
                    const isSelected = selectedItems.some(
                      (selected) => selected.itemId === item.id
                    );
                    const selectedQuantity = getSelectedItemQuantity(item.id);
                    const selectedReason = getSelectedItemReason(item.id);

                    return (
                      <View
                        key={item.id}
                        className="mb-4 p-4 border border-gray-200 rounded-lg"
                      >
                        <View className="flex-row items-center justify-between mb-2">
                          <Text className="font-semibold text-gray-800">
                            {item.name}
                          </Text>
                          <Text className="text-gray-600">
                            ${item.price.toFixed(2)} each
                          </Text>
                        </View>

                        <View className="flex-row items-center justify-between mb-2">
                          <Text className="text-gray-600">
                            Quantity: {item.quantity}
                          </Text>
                          <TouchableOpacity
                            onPress={() =>
                              toggleItemSelection(item.id, item.quantity)
                            }
                            className={`p-2 rounded-lg ${
                              isSelected ? "bg-blue-500" : "bg-gray-200"
                            }`}
                          >
                            {isSelected ? (
                              <Check color="white" size={16} />
                            ) : (
                              <X color="gray" size={16} />
                            )}
                          </TouchableOpacity>
                        </View>

                        {isSelected && (
                          <View className="gap-y-2">
                            <View className="flex-row items-center gap-2">
                              <Text className="text-gray-600">Refund Qty:</Text>
                              <TextInput
                                value={selectedQuantity.toString()}
                                onChangeText={(text) => {
                                  const qty = parseInt(text) || 0;
                                  if (qty >= 0 && qty <= item.quantity) {
                                    updateItemQuantity(item.id, qty);
                                  }
                                }}
                                keyboardType="numeric"
                                className="flex-1 p-2 border border-gray-300 rounded text-center h-20"
                              />
                              <Text className="text-gray-600">
                                / {item.quantity}
                              </Text>
                            </View>

                            <TextInput
                              value={selectedReason}
                              onChangeText={(text) =>
                                updateItemReason(item.id, text)
                              }
                              placeholder="Reason for this item..."
                              className="w-full p-2 border border-gray-300 rounded text-sm h-20"
                            />
                          </View>
                        )}
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Refund Summary */}
            <View className="mb-6 p-4 bg-gray-50 rounded-lg">
              <Text className="text-lg font-semibold text-gray-800 mb-2">
                Refund Summary
              </Text>
              <View className="flex-row justify-between">
                <Text className="text-gray-600">Original Total:</Text>
                <Text className="font-semibold">${order.total.toFixed(2)}</Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-gray-600">Refund Amount:</Text>
                <Text className="font-semibold text-red-600">
                  ${calculateRefundAmount().toFixed(2)}
                </Text>
              </View>
              <View className="flex-row justify-between border-t border-gray-300 pt-2 mt-2">
                <Text className="text-gray-600">Remaining:</Text>
                <Text className="font-semibold">
                  ${(order.total - calculateRefundAmount()).toFixed(2)}
                </Text>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Action Buttons */}
        <View className="flex-row gap-3 pt-4 border-t border-gray-200">
          <TouchableOpacity
            onPress={onClose}
            className="flex-1 py-3 border border-gray-300 rounded-lg"
          >
            <Text className="font-bold text-gray-700 text-center">Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={
              refundType === "full" ? handleFullRefund : handlePartialRefund
            }
            className="flex-1 py-3 bg-red-500 rounded-lg"
          >
            <Text className="font-bold text-white text-center">
              Process Refund
            </Text>
          </TouchableOpacity>
        </View>

        <RefundApprovalModal
          visible={approvalModalVisible}
          employeeName={lastGuardRef.current?.activeEmployeeName || "Cashier"}
          refundCount={lastGuardRef.current?.velocity.selfRefundCount || 0}
          onApproved={onManagerApproved}
          onCancel={() => { setApprovalModalVisible(false); setPendingRefundType(null); }}
        />
      </DialogContent>
    </Dialog>
  );
};

export default RefundModal;
