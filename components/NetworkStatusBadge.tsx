/**
 * NetworkStatusBadge Component
 *
 * Displays network status in the header center.
 * Tappable to expand and show a "Sync Order" button for manual database sync.
 * Click the badge again to collapse.
 */

import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { toastService } from "@/lib/toastService";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  CreditCard,
  Database,
  RefreshCw,
  WifiOff,
} from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  SlideInRight,
  SlideOutRight,
} from "react-native-reanimated";

type BadgeVariant = "online" | "pending" | "offline";

interface BadgeConfig {
  bgColor: string;
  textColor: string;
  borderColor: string;
  icon: React.ReactNode;
  label: string;
}

export function NetworkStatusBadge(): React.ReactElement {
  const { isOnline, pendingSyncCount, syncNow } = useNetworkStatus();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSyncingOrder, setIsSyncingOrder] = useState(false);
  // console.log(isOnline)
  // Get active order info from store
  const activeOrderId = useOrderStore((s) => s.activeOrderId);
  const syncOrderFromDatabase = useOrderStore((s) => s.syncOrderFromDatabase);

  // Payment offline status
  const {
    pendingPaymentsCount,
    failedPayments,
    refreshOfflinePaymentStatus,
    retryFailedPayment,
  } = usePaymentStore();

  // Refresh payment status when network status changes
  useEffect(() => {
    refreshOfflinePaymentStatus();
  }, [isOnline, pendingSyncCount]);

  // Check for any pending or failed payments
  const hasPendingPayments = pendingPaymentsCount > 0;
  const hasFailedPayments = failedPayments.length > 0;

  // Determine badge variant
  const variant: BadgeVariant = !isOnline
    ? "offline"
    : pendingSyncCount > 0
      ? "pending"
      : "online";

  // Toggle expanded state when badge is pressed
  const handleBadgePress = async () => {
    if (!isOnline) {
      // Can't expand when offline
      return;
    }

    // If there are pending syncs and we're not expanded, trigger sync
    if (pendingSyncCount > 0 && !isExpanded && !isSyncing) {
      setIsSyncing(true);
      try {
        await syncNow();
      } finally {
        setTimeout(() => setIsSyncing(false), 500);
      }
    }

    // Toggle expanded state
    setIsExpanded(!isExpanded);
  };

  // Handle manual order sync from database
  const handleSyncOrder = async () => {
    if (!activeOrderId || isSyncingOrder) return;

    setIsSyncingOrder(true);
    try {
      const result = await syncOrderFromDatabase(activeOrderId);

      if (result.success) {
        toastService.show({
          title: "Order Synced",
          message: "Order data refreshed from server",
          type: "success",
        });
        // Collapse after successful sync
        setIsExpanded(false);
      } else {
        toastService.show({
          title: "Sync Failed",
          message: result.error || "Unable to sync order",
          type: "error",
        });
      }
    } catch (error: any) {
      toastService.show({
        title: "Sync Error",
        message: error?.message || "An error occurred",
        type: "error",
      });
    } finally {
      setIsSyncingOrder(false);
    }
  };

  const getBadgeConfig = (): BadgeConfig => {
    switch (variant) {
      case "online":
        return {
          bgColor: isExpanded ? "bg-blue-900/40" : "bg-green-900/30",
          textColor: isExpanded ? "text-blue-400" : "text-green-400",
          borderColor: isExpanded ? "border-blue-600/50" : "border-green-600/50",
          icon: <CheckCircle size={14} color={isExpanded ? "#60a5fa" : "#4ade80"} />,
          label: isExpanded ? "Sync Options" : "Online",
        };
      case "pending":
        return {
          bgColor: "bg-amber-900/30",
          textColor: "text-amber-400",
          borderColor: "border-amber-600/50",
          icon: isSyncing ? (
            <ActivityIndicator size="small" color="#fbbf24" />
          ) : (
            <Clock size={14} color="#fbbf24" />
          ),
          label: isSyncing
            ? `Syncing ${pendingSyncCount}...`
            : `${pendingSyncCount} pending`,
        };
      case "offline":
        return {
          bgColor: "bg-red-900/30",
          textColor: "text-red-400",
          borderColor: "border-red-600/50",
          icon: <WifiOff size={14} color="#f87171" />,
          label:
            pendingSyncCount > 0
              ? `Offline - ${pendingSyncCount} pending`
              : "Offline",
        };
    }
  };

  const config = getBadgeConfig();
  const canExpand = isOnline;
  const showSyncButton = isExpanded && activeOrderId && isOnline;

  return (
    <View className="flex-row items-center gap-2">
      {/* Main Badge */}
      <Animated.View entering={FadeIn} exiting={FadeOut}>
        <TouchableOpacity
          onPress={handleBadgePress}
          disabled={!canExpand && !isSyncing}
          activeOpacity={0.7}
          className={`flex-row items-center gap-2 px-3 py-1.5 rounded-full border ${config.borderColor} ${config.bgColor}`}
        >
          {config.icon}
          <Text className={`text-sm font-medium ${config.textColor}`}>
            {config.label}
          </Text>
          {(pendingSyncCount > 0 || isExpanded) && isOnline && (
            <View className="ml-0.5">
              <RefreshCw
                size={12}
                color={isExpanded ? "#60a5fa" : "#fbbf24"}
                style={isExpanded ? { transform: [{ rotate: "180deg" }] } : undefined}
              />
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>

      {/* Expandable Sync Order Button */}
      {showSyncButton && (
        <Animated.View
          entering={SlideInRight.duration(200)}
          exiting={SlideOutRight.duration(200)}
        >
          <TouchableOpacity
            onPress={handleSyncOrder}
            disabled={isSyncingOrder}
            activeOpacity={0.7}
            className="flex-row items-center gap-2 px-3 py-1.5 rounded-full border border-cyan-600/50 bg-cyan-900/40"
          >
            {isSyncingOrder ? (
              <ActivityIndicator size="small" color="#22d3d3" />
            ) : (
              <Database size={14} color="#22d3d3" />
            )}
            <Text className="text-sm font-medium text-cyan-400">
              {isSyncingOrder ? "Syncing..." : "Sync Order"}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Collapsed indicator when no active order but expanded */}
      {isExpanded && !activeOrderId && isOnline && (
        <Animated.View
          entering={SlideInRight.duration(200)}
          exiting={SlideOutRight.duration(200)}
        >
          <View className="flex-row items-center gap-2 px-3 py-1.5 rounded-full border border-gray-600/50 bg-gray-900/40">
            <Text className="text-sm text-gray-500">No active order</Text>
          </View>
        </Animated.View>
      )}

      {/* Pending Payments Badge */}
      {hasPendingPayments && (
        <Animated.View
          entering={SlideInRight.duration(200)}
          exiting={SlideOutRight.duration(200)}
        >
          <View className="flex-row items-center gap-2 px-3 py-1.5 rounded-full border border-amber-600/50 bg-amber-900/40">
            <CreditCard size={14} color="#fbbf24" />
            <Text className="text-sm font-medium text-amber-400">
              {pendingPaymentsCount} payment{pendingPaymentsCount > 1 ? "s" : ""} queued
            </Text>
          </View>
        </Animated.View>
      )}

      {/* Failed Payments Badge - Critical! */}
      {hasFailedPayments && (
        <Animated.View
          entering={SlideInRight.duration(200)}
          exiting={SlideOutRight.duration(200)}
        >
          <TouchableOpacity
            onPress={() => {
              // Retry all failed payments
              failedPayments.forEach((payment) => {
                retryFailedPayment(payment.id);
              });
            }}
            activeOpacity={0.7}
            className="flex-row items-center gap-2 px-3 py-1.5 rounded-full border border-red-600/50 bg-red-900/40"
          >
            <AlertTriangle size={14} color="#f87171" />
            <Text className="text-sm font-medium text-red-400">
              {failedPayments.length} payment{failedPayments.length > 1 ? "s" : ""} failed
            </Text>
            <RefreshCw size={12} color="#f87171" />
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
}

export default NetworkStatusBadge;
