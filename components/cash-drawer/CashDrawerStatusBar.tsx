/**
 * CashDrawerStatusBar
 *
 * Compact bar rendered above the main flex-row in order-processing.
 * Shows drawer status, running balance, and quick-action buttons.
 */

import { formatCurrency } from "@/utils/currency";
import { useCashDrawerStore } from "@/stores/useCashDrawerStore";
import { DollarSign } from "lucide-react-native";
import React, { useEffect } from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface CashDrawerStatusBarProps {
  onManagePress: () => void;
  onNoSalePress: () => void;
}

const CashDrawerStatusBar: React.FC<CashDrawerStatusBarProps> = ({
  onManagePress,
  onNoSalePress,
}) => {
  const drawerId = useCashDrawerStore((s) => s.drawerId);
  const drawerName = useCashDrawerStore((s) => s.drawerName);
  const activeSession = useCashDrawerStore((s) => s.activeSession);
  const operations = useCashDrawerStore((s) => s.operations);
  const getRunningBalance = useCashDrawerStore((s) => s.getRunningBalance);
  const shouldPromptOpen = useCashDrawerStore((s) => s.shouldPromptOpen);
  const setShouldPromptOpen = useCashDrawerStore((s) => s.setShouldPromptOpen);

  // Post-clock-in prompt: auto-open drawer sheet when flagged
  useEffect(() => {
    if (shouldPromptOpen) {
      setShouldPromptOpen(false);
      onManagePress();
    }
  }, [shouldPromptOpen, setShouldPromptOpen, onManagePress]);

  if (!drawerId) return null;

  const isOpen = activeSession?.status === "open";
  const balance = isOpen ? getRunningBalance() : 0;

  if (!isOpen) {
    return (
      <TouchableOpacity
        onPress={onManagePress}
        className="h-10 flex-row items-center justify-center bg-surface border-b border-border px-4"
      >
        <View className="w-2 h-2 rounded-full bg-gray-500 mr-2" />
        <Text className="text-sm text-label">
          Drawer Closed — Tap to Open
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <View className="h-10 flex-row items-center bg-surface border-b border-border px-4">
      {/* Left: Drawer name + status */}
      <View className="flex-row items-center flex-1">
        <View className="w-2 h-2 rounded-full bg-green-500 mr-2" />
        <Text className="text-sm font-medium text-white mr-2">
          {drawerName || "Drawer"}
        </Text>
        <Text className="text-xs text-green-400 font-semibold">Open</Text>
      </View>

      {/* Center: Running balance */}
      <View className="flex-row items-center">
        <DollarSign size={14} color="#2dd4bf" />
        <Text className="text-sm font-bold text-teal ml-0.5">
          {formatCurrency(balance)}
        </Text>
      </View>

      {/* Right: Action buttons */}
      <View className="flex-1 flex-row items-center justify-end gap-2">
        <TouchableOpacity
          onPress={onNoSalePress}
          className="px-3 py-1 rounded-md bg-gray-700"
        >
          <Text className="text-xs font-semibold text-white">No Sale</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onManagePress}
          className="px-3 py-1 rounded-md bg-gray-700"
        >
          <Text className="text-xs font-semibold text-white">Manage</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default React.memo(CashDrawerStatusBar);
