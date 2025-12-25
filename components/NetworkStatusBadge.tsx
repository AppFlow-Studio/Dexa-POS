/**
 * NetworkStatusBadge Component
 *
 * Displays network status in the header center.
 * Tappable to trigger manual sync when online with pending operations.
 */

import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { CheckCircle, Clock, RefreshCw, WifiOff } from "lucide-react-native";
import React, { useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

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

  // Determine badge variant
  const variant: BadgeVariant = !isOnline
    ? "offline"
    : pendingSyncCount > 0
    ? "pending"
    : "online";

  const handlePress = async () => {
    if (isOnline && pendingSyncCount > 0 && !isSyncing) {
      setIsSyncing(true);
      try {
        await syncNow();
      } finally {
        // Small delay to show sync completed
        setTimeout(() => setIsSyncing(false), 500);
      }
    }
  };

  const getBadgeConfig = (): BadgeConfig => {
    switch (variant) {
      case "online":
        return {
          bgColor: "bg-green-900/30",
          textColor: "text-green-400",
          borderColor: "border-green-600/50",
          icon: <CheckCircle size={14} color="#4ade80" />,
          label: "Online",
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
  const isTappable = isOnline && pendingSyncCount > 0 && !isSyncing;

  return (
    <Animated.View entering={FadeIn} exiting={FadeOut}>
      <TouchableOpacity
        onPress={handlePress}
        disabled={!isTappable}
        activeOpacity={isTappable ? 0.7 : 1}
        className={`flex-row items-center gap-2 px-3 py-1.5 rounded-full border ${config.borderColor} ${config.bgColor}`}
        style={{ opacity: isTappable ? 1 : 0.9 }}
      >
        {config.icon}
        <Text className={`text-sm font-medium ${config.textColor}`}>
          {config.label}
        </Text>
        {isTappable && (
          <View className="ml-0.5">
            <RefreshCw size={12} color="#fbbf24" />
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

export default NetworkStatusBadge;
