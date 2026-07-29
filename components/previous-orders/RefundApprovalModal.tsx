/**
 * RefundApprovalModal
 *
 * Shown when the refund fraud velocity guard blocks a same-cashier cash refund.
 * Manager must enter their PIN to approve the refund.
 *
 * Reuses the visual pattern from ManagerPinModal (PIN dots, numpad, shake animation)
 * but is self-contained with callback props — no shared store.
 */

import { colors } from "@/lib/theme";
import type { MerchantRole } from "@/lib/types";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { AlertTriangle, Delete, Lock, X } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

const MANAGER_ROLES: MerchantRole[] = [
  "merchant.manager",
  "merchant.admin",
  "merchant.owner",
];

const PIN_LENGTH = 4;

interface RefundApprovalModalProps {
  visible: boolean;
  employeeName: string;
  refundCount: number;
  onApproved: (managerProfileId: string, managerName: string) => void;
  onCancel: () => void;
}

// ─── PIN dots ────────────────────────────────────────────────────────────────

const PinDots = ({
  length,
  shake,
}: {
  length: number;
  shake: SharedValue<number>;
}) => {
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          flexDirection: "row",
          gap: 18,
          justifyContent: "center",
          marginBottom: 28,
        },
        animStyle,
      ]}
    >
      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
        <View
          key={i}
          style={{
            width: i < length ? 18 : 14,
            height: i < length ? 18 : 14,
            borderRadius: 999,
            backgroundColor: i < length ? colors.teal : colors.border,
            alignSelf: "center",
          }}
        />
      ))}
    </Animated.View>
  );
};

// ─── Numpad button ───────────────────────────────────────────────────────────

const KeyButton = ({
  label,
  onPress,
  variant = "digit",
}: {
  label: React.ReactNode;
  onPress: () => void;
  variant?: "digit" | "action" | "empty";
}) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={variant === "empty" ? 1 : 0.6}
    disabled={variant === "empty"}
    style={{
      width: 80,
      height: 64,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor:
        variant === "digit"
          ? colors.card
          : variant === "action"
            ? colors.screen
            : "transparent",
      borderWidth: variant === "digit" ? 1 : 0,
      borderColor: colors.border,
    }}
  >
    {typeof label === "string" ? (
      <Text
        style={{ fontSize: 22, fontWeight: "600", color: colors.heading }}
      >
        {label}
      </Text>
    ) : (
      label
    )}
  </TouchableOpacity>
);

// ─── Main component ──────────────────────────────────────────────────────────

const RefundApprovalModal: React.FC<RefundApprovalModalProps> = ({
  visible,
  employeeName,
  refundCount,
  onApproved,
  onCancel,
}) => {
  const [pin, setPin] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const shakeX = useSharedValue(0);
  const pinRef = useRef(pin);
  pinRef.current = pin;

  // Reset state whenever modal opens
  useEffect(() => {
    if (visible) {
      setPin("");
      setErrorMsg(null);
    }
  }, [visible]);

  // Auto-submit when PIN_LENGTH digits are entered
  useEffect(() => {
    if (pin.length === PIN_LENGTH) {
      submitPin(pin);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const submitPin = (currentPin: string) => {
    const employee =
      useEmployeeStore.getState().findEmployeeByPin(currentPin);
    const isManager = employee && MANAGER_ROLES.includes(employee.role);

    if (isManager) {
      onApproved(employee.profileId, employee.fullName);
    } else {
      shakeX.value = withSequence(
        withTiming(-12, { duration: 70 }),
        withTiming(12, { duration: 70 }),
        withTiming(-12, { duration: 70 }),
        withTiming(12, { duration: 70 }),
        withTiming(0, { duration: 70 }),
      );
      setErrorMsg(
        employee
          ? "This employee does not have manager access."
          : "Incorrect PIN. Please try again.",
      );
      setPin("");
    }
  };

  const handleKey = (digit: string) => {
    if (pin.length < PIN_LENGTH) {
      setPin((p) => p + digit);
      setErrorMsg(null);
    }
  };

  const handleBackspace = () => {
    setPin((p) => p.slice(0, -1));
    setErrorMsg(null);
  };

  const handleClear = () => {
    setPin("");
    setErrorMsg(null);
  };

  const rows = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <Pressable
        onPress={onCancel}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.7)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Card — stop propagation so tapping inside doesn't close */}
        <Pressable
          onPress={() => {}}
          style={{
            width: 360,
            backgroundColor: colors.panel,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: "hidden",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.5,
            shadowRadius: 24,
            elevation: 20,
          }}
        >
          {/* Warning accent bar */}
          <View style={{ height: 3, backgroundColor: "#ef4444" }} />

          <View style={{ padding: 24, alignItems: "center" }}>
            {/* Close button */}
            <TouchableOpacity
              onPress={onCancel}
              style={{
                position: "absolute",
                top: 14,
                right: 14,
                padding: 4,
              }}
            >
              <X size={18} color={colors.muted} />
            </TouchableOpacity>

            {/* Warning icon */}
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                backgroundColor: "#ef444418",
                borderWidth: 1,
                borderColor: "#ef444440",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 12,
              }}
            >
              <AlertTriangle size={24} color="#ef4444" />
            </View>

            {/* Warning title */}
            <Text
              style={{
                fontSize: 15,
                fontWeight: "700",
                color: colors.heading,
                textAlign: "center",
                marginBottom: 4,
              }}
            >
              Refund Velocity Alert
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: colors.label,
                textAlign: "center",
                marginBottom: 20,
                paddingHorizontal: 12,
              }}
            >
              {employeeName} has processed {refundCount} same-cashier cash
              refund{refundCount !== 1 ? "s" : ""} in the past hour.{"\n"}
              Manager approval required to continue.
            </Text>

            {/* PIN dots */}
            <PinDots length={pin.length} shake={shakeX} />

            {/* Error */}
            {errorMsg && (
              <Text
                style={{
                  fontSize: 11,
                  color: colors.danger,
                  textAlign: "center",
                  marginBottom: 12,
                  marginTop: -16,
                }}
              >
                {errorMsg}
              </Text>
            )}

            {/* Numpad */}
            <View style={{ gap: 10 }}>
              {rows.map((row, ri) => (
                <View key={ri} style={{ flexDirection: "row", gap: 10 }}>
                  {row.map((d) => (
                    <KeyButton
                      key={d}
                      label={d}
                      onPress={() => handleKey(d)}
                    />
                  ))}
                </View>
              ))}
              {/* Bottom row: clear | 0 | backspace */}
              <View style={{ flexDirection: "row", gap: 10 }}>
                <KeyButton
                  variant="action"
                  label={<X size={18} color={colors.muted} />}
                  onPress={handleClear}
                />
                <KeyButton label="0" onPress={() => handleKey("0")} />
                <KeyButton
                  variant="action"
                  label={<Delete size={18} color={colors.label} />}
                  onPress={handleBackspace}
                />
              </View>
            </View>

            {/* Submit button */}
            <TouchableOpacity
              onPress={() => pin.length > 0 && submitPin(pin)}
              disabled={pin.length === 0}
              activeOpacity={0.7}
              style={{
                marginTop: 16,
                width: "100%",
                height: 48,
                borderRadius: 14,
                backgroundColor:
                  pin.length === 0 ? "#ef444415" : "#ef444420",
                borderWidth: 1,
                borderColor:
                  pin.length === 0 ? "#ef444420" : "#ef444460",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "700",
                  color:
                    pin.length === 0 ? colors.muted : "#ef4444",
                }}
              >
                Approve Refund
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

export default RefundApprovalModal;
