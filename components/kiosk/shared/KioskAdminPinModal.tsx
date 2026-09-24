import { useEmployeeStore } from "@/stores/useEmployeeStore";
import type { MerchantRole } from "@/lib/types";
import { Delete, Lock, X } from "@/lib/icons";
import { useEffect, useState } from "react";
import { Modal, Pressable, Text, useWindowDimensions, View } from "react-native";

const MANAGER_ROLES: MerchantRole[] = [
  "merchant.manager",
  "merchant.admin",
  "merchant.owner",
];

const PIN_LENGTH = 4;
const CARD_PADDING = 24;
const KEY_GAP = 10;
/** Height of the card with the keypad under the heading. */
const STACKED_HEIGHT = 560;

/**
 * PIN gate for the kiosk diagnostics/settings screen. Reuses the same
 * employee PIN + manager-role check as the POS's ManagerPinModal — any
 * employee with a manager/admin/owner role can unlock it.
 */
export function KioskAdminPinModal({
  visible,
  onClose,
  onVerified,
}: {
  visible: boolean;
  onClose: () => void;
  onVerified: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setPin("");
      setError(null);
    }
  }, [visible]);

  useEffect(() => {
    if (pin.length !== PIN_LENGTH) return;
    const employee = useEmployeeStore.getState().findEmployeeByPin(pin);
    const isManager = !!employee && MANAGER_ROLES.includes(employee.role);

    if (!isManager) {
      setError(
        employee
          ? "This employee does not have manager access."
          : "Incorrect PIN. Please try again.",
      );
      setPin("");
      return;
    }

    onVerified();
  }, [pin, onVerified]);

  const rows = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
  ];

  // The stacked card is ~520dp tall. A landscape phone has ~360, so there the
  // keypad sits beside the heading instead of under it; a narrow phone gets a
  // card that fits its width, with keys sized to match.
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const sideBySide = winWidth > winHeight && winHeight < STACKED_HEIGHT;
  const cardWidth = sideBySide ? undefined : Math.min(340, winWidth - 32);
  const keyWidth = cardWidth
    ? Math.min(80, Math.floor((cardWidth - CARD_PADDING * 2 - KEY_GAP * 2) / 3))
    : 80;
  const keyHeight = sideBySide
    ? Math.min(64, Math.floor((winHeight - 40 - CARD_PADDING * 2 - KEY_GAP * 3) / 4))
    : 64;

  const key = { width: keyWidth, height: keyHeight };
  const digitKey = {
    ...key,
    borderRadius: 14,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: "#F5F5F5",
    borderWidth: 1,
    borderColor: "#E0E0E0",
  };

  const heading = (
    <View style={{ alignItems: "center" }}>
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: 14,
          backgroundColor: "#0C4FD118",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 12,
        }}
      >
        <Lock size={24} color="#0C4FD1" />
      </View>

      <Text style={{ fontSize: 16, fontWeight: "700", color: "#0A0A0A", marginBottom: 4 }}>
        Kiosk Settings
      </Text>
      <Text style={{ fontSize: 12, color: "#888888", marginBottom: 20 }}>
        Enter manager PIN to continue
      </Text>

      {/* PIN dots */}
      <View style={{ flexDirection: "row", gap: 18, marginBottom: 20 }}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <View
            key={i}
            style={{
              width: i < pin.length ? 18 : 14,
              height: i < pin.length ? 18 : 14,
              borderRadius: 999,
              backgroundColor: i < pin.length ? "#0C4FD1" : "#E0E0E0",
            }}
          />
        ))}
      </View>

      {error && (
        <Text
          style={{
            fontSize: 12,
            color: "#D92D20",
            textAlign: "center",
            marginBottom: 12,
            maxWidth: 240,
          }}
        >
          {error}
        </Text>
      )}
    </View>
  );

  const numpad = (
    <View style={{ gap: KEY_GAP }}>
      {rows.map((row, ri) => (
        <View key={ri} style={{ flexDirection: "row", gap: KEY_GAP }}>
          {row.map((d) => (
            <Pressable
              key={d}
              onPress={() => {
                if (pin.length < PIN_LENGTH) {
                  setPin((p) => p + d);
                  setError(null);
                }
              }}
              style={digitKey}
            >
              <Text style={{ fontSize: 22, fontWeight: "600", color: "#0A0A0A" }}>{d}</Text>
            </Pressable>
          ))}
        </View>
      ))}
      <View style={{ flexDirection: "row", gap: KEY_GAP }}>
        <Pressable
          onPress={() => {
            setPin("");
            setError(null);
          }}
          style={{ ...key, alignItems: "center", justifyContent: "center" }}
        >
          <X size={18} color="#888888" />
        </Pressable>
        <Pressable
          onPress={() => {
            if (pin.length < PIN_LENGTH) {
              setPin((p) => p + "0");
              setError(null);
            }
          }}
          style={digitKey}
        >
          <Text style={{ fontSize: 22, fontWeight: "600", color: "#0A0A0A" }}>0</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setPin((p) => p.slice(0, -1));
            setError(null);
          }}
          style={{ ...key, alignItems: "center", justifyContent: "center" }}
        >
          <Delete size={18} color="#888888" />
        </Pressable>
      </View>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center" }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            width: cardWidth,
            backgroundColor: "#FFFFFF",
            borderRadius: 20,
            padding: CARD_PADDING,
            flexDirection: sideBySide ? "row" : "column",
            alignItems: "center",
            gap: sideBySide ? 32 : 0,
          }}
        >
          <Pressable
            onPress={onClose}
            style={{ position: "absolute", top: 14, right: 14, padding: 4, zIndex: 1 }}
          >
            <X size={18} color="#888888" />
          </Pressable>

          {heading}
          {numpad}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
