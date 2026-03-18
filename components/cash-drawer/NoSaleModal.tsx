/**
 * NoSaleModal
 *
 * Dialog for performing a No Sale (open drawer without transaction).
 * Supports reason selection, optional manager PIN approval, and receipt printing.
 */

import PinDisplay from "@/components/auth/PinDisplay";
import PinNumpad from "@/components/auth/PinNumpad";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/contexts/ToastContext";
import type { MerchantRole } from "@/lib/types";
import { recordDrawerOperation } from "@/services/cashDrawerService";
import { PrinterService } from "@/services/printing/PrinterService";
import { useCashDrawerStore } from "@/stores/useCashDrawerStore";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import React, { useCallback, useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { colors } from "@/lib/theme";

interface NoSaleModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const REASON_CHIPS = ["Making Change", "Checking Bills", "Manager Request", "Other"];
const MANAGER_ROLES: MerchantRole[] = ["merchant.manager", "merchant.admin", "merchant.owner"];

const NoSaleModal: React.FC<NoSaleModalProps> = ({ isOpen, onClose }) => {
  const supabase = useSupabaseClient();
  const { show } = useToast();

  const drawerId = useCashDrawerStore((s) => s.drawerId);
  const drawerName = useCashDrawerStore((s) => s.drawerName);
  const activeSession = useCashDrawerStore((s) => s.activeSession);

  const loggedInEmployee = useEmployeeStore((s) => s.loggedInEmployee);

  const cashDrawerSettings = useStoreSettingsStore((s) => s.cashDrawerSettings);
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const selectedStation = useStoreSettingsStore((s) => s.selectedStation);

  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [customReason, setCustomReason] = useState("");
  const [pin, setPin] = useState("");
  const [approvedBy, setApprovedBy] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const shakeX = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  const reason = selectedReason === "Other" ? customReason : selectedReason;
  const requiresApproval = cashDrawerSettings.requireNoSaleApproval;
  const requiresReason = cashDrawerSettings.requireNoSaleReason;

  const canSubmit =
    (!requiresReason || (reason && reason.trim().length > 0)) &&
    (!requiresApproval || approvedBy);

  const handlePinSubmit = useCallback(() => {
    const employee = useEmployeeStore.getState().findEmployeeByPin(pin);
    const isManager = employee && MANAGER_ROLES.includes(employee.role);

    if (isManager) {
      setApprovedBy(employee.displayName || employee.id);
      setPin("");
    } else {
      shakeX.value = withSequence(
        withTiming(-10, { duration: 100 }),
        withTiming(10, { duration: 100 }),
        withTiming(-10, { duration: 100 }),
        withTiming(10, { duration: 100 }),
        withTiming(0, { duration: 100 })
      );
      setPin("");
      show({
        title: "Invalid PIN",
        message: employee
          ? "This employee does not have manager access."
          : "PIN does not match any employee.",
        type: "error",
      });
    }
  }, [pin, show, shakeX]);

  const handleConfirm = useCallback(async () => {
    if (!drawerId || !activeSession || !loggedInEmployee || !canSubmit) return;
    setIsSubmitting(true);

    await recordDrawerOperation(supabase, {
      cashDrawerId: drawerId,
      sessionId: activeSession.id,
      operationType: "no_sale",
      amount: 0,
      performedBy: loggedInEmployee.profileId,
      reason: reason || undefined,
      approvedBy: approvedBy || undefined,
    });

    // Open the physical cash drawer
    try {
      await PrinterService.openCashDrawer();
    } catch {
      // Non-blocking — drawer open is best-effort
    }

    show({ title: "No Sale", message: "Cash drawer opened.", type: "success" });

    // Print receipt if configured
    if (cashDrawerSettings.autoPrintNoSaleReceipt) {
      try {
        await PrinterService.printNoSaleReceipt({
          storeName: selectedStore?.name || "Store",
          storeAddress: selectedStore?.address_line1 || undefined,
          drawerName: drawerName || "Drawer",
          stationName: selectedStation?.station_name || "Station",
          employeeName: loggedInEmployee.displayName || "Employee",
          reason: reason || "No reason",
          approvedBy: approvedBy || undefined,
          timestamp: new Date().toISOString(),
          locationId: selectedStore?.id || "",
        });
      } catch {
        // Non-blocking
      }
    }

    setIsSubmitting(false);
    resetState();
    onClose();
  }, [
    drawerId, activeSession, loggedInEmployee, canSubmit, reason, approvedBy,
    supabase, cashDrawerSettings, selectedStore, selectedStation, drawerName, show, onClose,
  ]);

  const resetState = () => {
    setSelectedReason(null);
    setCustomReason("");
    setPin("");
    setApprovedBy(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="w-96 bg-panel border-gray-600 p-6">
        <DialogHeader>
          <DialogTitle className="text-center text-2xl font-semibold text-white">
            No Sale — Open Drawer
          </DialogTitle>
        </DialogHeader>

        <View className="mt-4">
          {/* Reason Chips */}
          <Text className="text-sm font-medium text-label mb-2">
            Reason {requiresReason ? "(required)" : "(optional)"}
          </Text>
          <View className="flex-row flex-wrap gap-2 mb-3">
            {REASON_CHIPS.map((chip) => (
              <TouchableOpacity
                key={chip}
                onPress={() => setSelectedReason(chip)}
                className={`px-4 py-2 rounded-lg border ${
                  selectedReason === chip
                    ? "bg-blue-600 border-blue-500"
                    : "bg-surface border-border"
                }`}
              >
                <Text
                  className={`text-sm font-medium ${
                    selectedReason === chip ? "text-white" : "text-label"
                  }`}
                >
                  {chip}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {selectedReason === "Other" && (
            <TextInput
              value={customReason}
              onChangeText={setCustomReason}
              placeholder="Enter reason..."
              placeholderTextColor={colors.muted}
              className="h-10 px-3 bg-surface border border-border rounded-lg text-white text-sm mb-3"
            />
          )}

          {/* Manager PIN Approval */}
          {requiresApproval && !approvedBy && (
            <Animated.View style={shakeStyle} className="mt-2">
              <Text className="text-sm font-medium text-label mb-2">
                Manager Approval Required
              </Text>
              <PinDisplay pinLength={pin.length} maxLength={4} />
              <PinNumpad
                onKeyPress={(input) => {
                  if (typeof input === "number") {
                    if (pin.length < 4) setPin(pin + input.toString());
                  } else if (input === "clear") {
                    setPin("");
                  } else if (input === "backspace") {
                    setPin(pin.slice(0, -1));
                  }
                }}
              />
              <TouchableOpacity
                onPress={handlePinSubmit}
                className="py-2 bg-blue-600 rounded-lg mt-2"
              >
                <Text className="text-center text-sm font-bold text-white">
                  Verify
                </Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {approvedBy && (
            <View className="mt-2 p-2 bg-green-900/30 border border-green-700 rounded-lg">
              <Text className="text-sm text-green-400 text-center">
                Approved by: {approvedBy}
              </Text>
            </View>
          )}

          {/* Confirm */}
          <TouchableOpacity
            onPress={handleConfirm}
            disabled={!canSubmit || isSubmitting}
            className={`mt-4 py-3 rounded-lg ${
              canSubmit && !isSubmitting ? "bg-teal" : "bg-gray-600"
            }`}
          >
            <Text
              className={`text-center text-lg font-bold ${
                canSubmit && !isSubmitting ? "text-black" : "text-gray-400"
              }`}
            >
              {isSubmitting ? "Opening..." : "Open Drawer"}
            </Text>
          </TouchableOpacity>
        </View>
      </DialogContent>
    </Dialog>
  );
};

export default NoSaleModal;
