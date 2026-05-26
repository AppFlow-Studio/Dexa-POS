import PinDisplay from "@/components/auth/PinDisplay";
import PinNumpad, { NumpadInput } from "@/components/auth/PinNumpad";
import { useKioskTheme } from "@/contexts/kiosk/KioskThemeProvider";
import { verifyKioskAdminPin } from "@/lib/kioskAdminPin";
import { colors } from "@/lib/theme";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

const MANAGER_PIN_ROLES = new Set([
  "merchant.admin",
  "merchant.manager",
  "merchant.owner",
  "merchant.shift_manager",
  "merchant.inventory_manager",
]);

export function AdminPinModal({
  visible,
  adminPinHash,
  onClose,
  onVerified,
}: {
  visible: boolean;
  adminPinHash: string | null | undefined;
  onClose: () => void;
  onVerified: () => void;
}) {
  const theme = useKioskTheme();
  const employees = useEmployeeStore((state) => state.employees);
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const styles = useMemo(() => makeStyles(theme), [theme]);

  useEffect(() => {
    if (visible) return;
    setPin("");
    setMessage(null);
    setChecking(false);
  }, [visible]);

  const hasManagerPinMatch = (candidatePin: string): boolean =>
    employees.some((employee) => {
      const storedPin = employee.pin?.trim();
      return storedPin === candidatePin && MANAGER_PIN_ROLES.has(employee.role);
    });

  const submit = async (candidatePin = pin) => {
    if (!candidatePin || checking) return;
    setChecking(true);

    if (hasManagerPinMatch(candidatePin)) {
      setChecking(false);
      setPin("");
      setMessage(null);
      onVerified();
      return;
    }

    const result = await verifyKioskAdminPin(candidatePin, adminPinHash);

    if (result === "match") {
      setChecking(false);
      setPin("");
      setMessage(null);
      onVerified();
      return;
    }

    setChecking(false);
    setPin("");
    setMessage(
      result === "unsupported_hash"
        ? "Admin PIN verifier needs the bcrypt runtime before this hash can be checked."
        : "Incorrect PIN",
    );
  };

  const handleKey = (input: NumpadInput) => {
    setMessage(null);
    if (input === "clear") {
      setPin("");
      return;
    }
    if (input === "backspace") {
      setPin((value) => value.slice(0, -1));
      return;
    }
    if (typeof input === "number" && pin.length < 4) {
      const nextPin = `${pin}${input}`;
      setPin(nextPin);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.panel}>
          <Text style={styles.title}>Admin PIN</Text>
          <Text style={styles.subtitle}>Enter a manager PIN or kiosk admin PIN</Text>
          <PinDisplay pinLength={pin.length} maxLength={4} />
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.keypadWrap}>
            <PinNumpad onKeyPress={handleKey} />
          </View>
          <View style={styles.actions}>
            <Pressable onPress={onClose} style={styles.secondaryAction}>
              <Text style={styles.secondaryActionText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => void submit()}
              disabled={checking || pin.length === 0}
              style={[styles.primaryAction, checking || pin.length === 0 ? styles.disabled : null]}
            >
              <Text style={styles.primaryActionText}>{checking ? "Checking" : "Unlock"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(theme: ReturnType<typeof useKioskTheme>) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(0,0,0,0.56)",
      padding: 32,
    },
    panel: {
      width: "100%",
      maxWidth: 360,
      borderRadius: 8,
      backgroundColor: colors.panel,
      padding: 24,
      borderWidth: 1,
      borderColor: colors.card,
    },
    title: {
      color: colors.heading,
      fontFamily: theme.fontFamily,
      fontSize: 18,
      fontWeight: "700",
      textAlign: "center",
    },
    subtitle: {
      color: colors.muted,
      fontSize: 12,
      marginBottom: 16,
      marginTop: 6,
      textAlign: "center",
    },
    message: {
      color: colors.danger,
      fontSize: 12,
      minHeight: 18,
      textAlign: "center",
    },
    keypadWrap: {
      marginTop: 8,
    },
    actions: {
      flexDirection: "row",
      gap: 12,
      marginTop: 22,
    },
    primaryAction: {
      minHeight: 56,
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 10,
      backgroundColor: colors.teal,
    },
    primaryActionText: {
      color: "#FFFFFF",
      fontSize: 18,
      fontWeight: "700",
    },
    secondaryAction: {
      minHeight: 56,
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    secondaryActionText: {
      color: colors.heading,
      fontSize: 18,
      fontWeight: "700",
    },
    disabled: {
      opacity: 0.45,
    },
  });
}
