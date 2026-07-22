/**
 * ManagerPinPrompt — generic manager PIN gate.
 *
 * Self-contained modal (PIN dots + numpad, adapted from RefundApprovalModal)
 * that approves when the entered PIN belongs to a manager/admin/owner.
 * Used by TableQrSheet to gate Regenerate and QR On/Off actions.
 */

import { colors } from "@/lib/theme";
import type { MerchantRole } from "@/lib/types";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { Delete, Lock, X } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import { Modal, Pressable, Text, TouchableOpacity, View } from "react-native";
import Animated, {
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

interface ManagerPinPromptProps {
  visible: boolean;
  title?: string;
  subtitle?: string;
  onApproved: (managerProfileId: string, managerName: string) => void;
  onCancel: () => void;
}

const PinDots = ({
  length,
  shake,
}: {
  length: number;
  shake: Animated.SharedValue<number>;
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

const KeyButton = ({
  label,
  onPress,
  variant = "digit",
}: {
  label: React.ReactNode;
  onPress: () => void;
  variant?: "digit" | "action";
}) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.6}
    style={{
      width: 80,
      height: 64,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: variant === "digit" ? colors.card : colors.screen,
      borderWidth: variant === "digit" ? 1 : 0,
      borderColor: colors.border,
    }}
  >
    {typeof label === "string" ? (
      <Text style={{ fontSize: 22, fontWeight: "600", color: colors.heading }}>
        {label}
      </Text>
    ) : (
      label
    )}
  </TouchableOpacity>
);

const ManagerPinPrompt: React.FC<ManagerPinPromptProps> = ({
  visible,
  title = "Manager Approval",
  subtitle,
  onApproved,
  onCancel,
}) => {
  const [pin, setPin] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const shakeX = useSharedValue(0);
  const pinRef = useRef(pin);
  pinRef.current = pin;

  useEffect(() => {
    if (visible) {
      setPin("");
      setErrorMsg(null);
    }
  }, [visible]);

  useEffect(() => {
    if (pin.length === PIN_LENGTH) {
      submitPin(pin);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const submitPin = (currentPin: string) => {
    const employee = useEmployeeStore.getState().findEmployeeByPin(currentPin);
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
        <Pressable
          onPress={() => {}}
          style={{
            width: 360,
            backgroundColor: colors.panel,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: "hidden",
          }}
        >
          <View style={{ padding: 24, alignItems: "center" }}>
            <TouchableOpacity
              onPress={onCancel}
              style={{ position: "absolute", top: 14, right: 14, padding: 4 }}
            >
              <X size={18} color={colors.muted} />
            </TouchableOpacity>

            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                backgroundColor: colors.screen,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 12,
              }}
            >
              <Lock size={24} color={colors.heading} />
            </View>

            <Text
              style={{
                fontSize: 15,
                fontWeight: "700",
                color: colors.heading,
                textAlign: "center",
                marginBottom: 4,
              }}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text
                style={{
                  fontSize: 12,
                  color: colors.label,
                  textAlign: "center",
                  marginBottom: 20,
                  paddingHorizontal: 12,
                }}
              >
                {subtitle}
              </Text>
            ) : (
              <View style={{ height: 12 }} />
            )}

            <PinDots length={pin.length} shake={shakeX} />

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

            <View style={{ gap: 10 }}>
              {rows.map((row, ri) => (
                <View key={ri} style={{ flexDirection: "row", gap: 10 }}>
                  {row.map((d) => (
                    <KeyButton key={d} label={d} onPress={() => handleKey(d)} />
                  ))}
                </View>
              ))}
              <View style={{ flexDirection: "row", gap: 10 }}>
                <KeyButton
                  variant="action"
                  label={<X size={18} color={colors.muted} />}
                  onPress={() => {
                    setPin("");
                    setErrorMsg(null);
                  }}
                />
                <KeyButton label="0" onPress={() => handleKey("0")} />
                <KeyButton
                  variant="action"
                  label={<Delete size={18} color={colors.label} />}
                  onPress={() => {
                    setPin((p) => p.slice(0, -1));
                    setErrorMsg(null);
                  }}
                />
              </View>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

export default ManagerPinPrompt;
