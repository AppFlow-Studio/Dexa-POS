import { useEmployeeStore } from "@/stores/useEmployeeStore";
import type { MerchantRole } from "@/lib/types";
import { Delete, Lock, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";

const MANAGER_ROLES: MerchantRole[] = [
  "merchant.manager",
  "merchant.admin",
  "merchant.owner",
];

const PIN_LENGTH = 4;

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

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center" }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            width: 340,
            backgroundColor: "#FFFFFF",
            borderRadius: 20,
            padding: 24,
            alignItems: "center",
          }}
        >
          <Pressable
            onPress={onClose}
            style={{ position: "absolute", top: 14, right: 14, padding: 4 }}
          >
            <X size={18} color="#888888" />
          </Pressable>

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
            <Text style={{ fontSize: 12, color: "#D92D20", textAlign: "center", marginBottom: 12 }}>
              {error}
            </Text>
          )}

          {/* Numpad */}
          <View style={{ gap: 10 }}>
            {rows.map((row, ri) => (
              <View key={ri} style={{ flexDirection: "row", gap: 10 }}>
                {row.map((d) => (
                  <Pressable
                    key={d}
                    onPress={() => {
                      if (pin.length < PIN_LENGTH) {
                        setPin((p) => p + d);
                        setError(null);
                      }
                    }}
                    style={{
                      width: 80,
                      height: 64,
                      borderRadius: 14,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "#F5F5F5",
                      borderWidth: 1,
                      borderColor: "#E0E0E0",
                    }}
                  >
                    <Text style={{ fontSize: 22, fontWeight: "600", color: "#0A0A0A" }}>{d}</Text>
                  </Pressable>
                ))}
              </View>
            ))}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={() => {
                  setPin("");
                  setError(null);
                }}
                style={{ width: 80, height: 64, alignItems: "center", justifyContent: "center" }}
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
                style={{
                  width: 80,
                  height: 64,
                  borderRadius: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "#F5F5F5",
                  borderWidth: 1,
                  borderColor: "#E0E0E0",
                }}
              >
                <Text style={{ fontSize: 22, fontWeight: "600", color: "#0A0A0A" }}>0</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setPin((p) => p.slice(0, -1));
                  setError(null);
                }}
                style={{ width: 80, height: 64, alignItems: "center", justifyContent: "center" }}
              >
                <Delete size={18} color="#888888" />
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
