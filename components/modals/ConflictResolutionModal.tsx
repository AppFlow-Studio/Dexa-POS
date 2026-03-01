// components/modals/ConflictResolutionModal.tsx
// DEXA POS Phase 6: Payment Conflict Resolution Modal
// Shown when a payment conflict is detected that requires user action

import React from "react";
import {
  Modal,
  Pressable,
  Text,
  TouchableOpacity,
  View,
  Animated,
} from "react-native";
import { AlertTriangle, RefreshCw, ArrowRight, X } from "lucide-react-native";
import {
  ConflictInfo,
  ConflictResolution,
} from "@/types/conflict-resolution";
import {
  useConflictStore,
  usePaymentConflicts,
} from "@/stores/useConflictStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { colors } from "@/lib/theme";

// ============================================================================
// TYPES
// ============================================================================

interface ConflictResolutionModalProps {
  isVisible?: boolean;
  onClose?: () => void;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatCurrency(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return "$0.00";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatTime(timestamp: string | undefined): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const ConflictResolutionModal: React.FC<ConflictResolutionModalProps> = ({
  isVisible: propIsVisible,
  onClose,
}) => {
  const paymentConflicts = usePaymentConflicts();
  const resolvePaymentConflict = useConflictStore(
    (state) => state.resolvePaymentConflict
  );
  const refreshOrderFromBackend = useOrderStore(
    (state) => state._refreshOrderFromBackend
  );

  // Use first unresolved conflict
  const conflict = paymentConflicts[0];
  const isVisible = propIsVisible ?? (conflict != null);

  const handleRefreshOrder = async () => {
    if (!conflict) return;

    // Resolve the conflict by accepting server state
    resolvePaymentConflict(conflict.orderId, "accept_server");

    // Refresh the order from backend to get latest state
    if (refreshOrderFromBackend) {
      await refreshOrderFromBackend(conflict.orderId);
    }

    onClose?.();
  };

  const handleContinueAnyway = () => {
    if (!conflict) return;

    // User chooses to continue with local state (risky)
    resolvePaymentConflict(conflict.orderId, "keep_local");
    onClose?.();
  };

  const handleDismiss = () => {
    if (!conflict) return;

    // Just dismiss the modal without resolving
    // Conflict will persist and show again
    onClose?.();
  };

  if (!conflict) {
    return null;
  }

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <Pressable
        className="flex-1 bg-black/60 justify-center items-center"
        onPress={handleDismiss}
      >
        <Pressable
          className="bg-surface rounded-2xl w-[90%] max-w-md overflow-hidden"
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View className="bg-red-600/20 px-6 py-4 flex-row items-center border-b border-red-600/30">
            <AlertTriangle color={colors.danger} size={28} />
            <Text className="text-red-500 text-xl font-bold ml-3 flex-1">
              Payment Conflict
            </Text>
            <TouchableOpacity onPress={handleDismiss} className="p-1">
              <X color={colors.muted} size={24} />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <View className="px-6 py-5">
            {/* Order Info */}
            <View className="bg-panel rounded-xl p-4 mb-4">
              <Text className="text-gray-400 text-sm mb-1">Order</Text>
              <Text className="text-white text-lg font-semibold">
                {conflict.orderNumber || `#${conflict.orderId.slice(-6)}`}
              </Text>
            </View>

            {/* Conflict Description */}
            <Text className="text-gray-300 text-base leading-6 mb-4">
              This order was modified by{" "}
              <Text className="text-blue-400 font-semibold">
                {conflict.sourceStationName || "another station"}
              </Text>{" "}
              while you were working on it.
            </Text>

            {/* Changes Summary */}
            <View className="bg-panel rounded-xl p-4 mb-4">
              <Text className="text-gray-400 text-sm mb-2">What Changed</Text>

              {conflict.conflictType === "payment" && (
                <View className="flex-row items-center">
                  <View className="w-2 h-2 bg-yellow-500 rounded-full mr-2" />
                  <Text className="text-yellow-400 text-sm">
                    Payment was processed
                  </Text>
                </View>
              )}

              {conflict.serverChanges.map((change, index) => (
                <View key={index} className="flex-row items-center mt-1">
                  <View className="w-2 h-2 bg-blue-500 rounded-full mr-2" />
                  <Text className="text-blue-400 text-sm">
                    {formatChangeDescription(change)}
                  </Text>
                </View>
              ))}

              {conflict.itemConflicts.length > 0 && (
                <View className="mt-2">
                  {conflict.itemConflicts.slice(0, 3).map((itemConflict, index) => (
                    <View key={index} className="flex-row items-center mt-1">
                      <View className="w-2 h-2 bg-purple-500 rounded-full mr-2" />
                      <Text className="text-purple-400 text-sm">
                        {itemConflict.itemName}: {itemConflict.changeType}
                      </Text>
                    </View>
                  ))}
                  {conflict.itemConflicts.length > 3 && (
                    <Text className="text-gray-500 text-xs mt-1 ml-4">
                      +{conflict.itemConflicts.length - 3} more items
                    </Text>
                  )}
                </View>
              )}
            </View>

            {/* Version Info */}
            <View className="flex-row justify-between mb-4">
              <View className="bg-panel rounded-lg px-3 py-2">
                <Text className="text-gray-500 text-xs">Your Version</Text>
                <Text className="text-gray-300 text-sm">v{conflict.localVersion}</Text>
              </View>
              <View className="items-center justify-center">
                <ArrowRight color={colors.muted} size={20} />
              </View>
              <View className="bg-panel rounded-lg px-3 py-2">
                <Text className="text-gray-500 text-xs">Server Version</Text>
                <Text className="text-green-400 text-sm">v{conflict.serverVersion}</Text>
              </View>
            </View>

            {/* Timestamp */}
            <Text className="text-gray-500 text-xs text-center mb-4">
              Detected at {formatTime(conflict.detectedAt)}
            </Text>
          </View>

          {/* Actions */}
          <View className="px-6 pb-6">
            {/* Primary Action - Refresh Order (Recommended) */}
            <TouchableOpacity
              onPress={handleRefreshOrder}
              className="bg-blue-600 rounded-xl py-4 flex-row items-center justify-center mb-3"
            >
              <RefreshCw color="#fff" size={20} />
              <Text className="text-white font-bold text-base ml-2">
                Refresh Order (Recommended)
              </Text>
            </TouchableOpacity>

            {/* Secondary Action - Continue Anyway (Risky) */}
            <TouchableOpacity
              onPress={handleContinueAnyway}
              className="bg-panel border border-gray-700 rounded-xl py-3 flex-row items-center justify-center"
            >
              <Text className="text-gray-400 font-medium text-sm">
                Continue Anyway
              </Text>
            </TouchableOpacity>

            <Text className="text-gray-600 text-xs text-center mt-3">
              Continuing may result in duplicate charges or inconsistent data
            </Text>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

// ============================================================================
// HELPER COMPONENT
// ============================================================================

function formatChangeDescription(change: { field: string; previousValue: unknown; newValue: unknown }): string {
  switch (change.field) {
    case "amount_paid":
      return `Amount paid changed to ${formatCurrency(change.newValue as number)}`;
    case "paid_status":
      return `Status changed to ${change.newValue}`;
    case "order_status":
      return `Order status changed to ${change.newValue}`;
    case "total_amount":
      return `Total changed to ${formatCurrency(change.newValue as number)}`;
    case "total_discount":
      return `Discount changed to ${formatCurrency(change.newValue as number)}`;
    default:
      return `${change.field} was updated`;
  }
}

export default ConflictResolutionModal;
