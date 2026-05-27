import { KioskButton } from "@/components/kiosk/shared/KioskButton";
import React, { useEffect, useRef, useState } from "react";
import { Modal, Text, View } from "react-native";
import { useKioskTheme } from "@/contexts/kiosk/KioskThemeProvider";

export function TimedReset({
  enabled,
  timeoutSeconds,
  onReset,
  children,
}: {
  enabled: boolean;
  timeoutSeconds: number;
  onReset: () => void;
  children: React.ReactNode;
}) {
  const theme = useKioskTheme();
  const [remaining, setRemaining] = useState(timeoutSeconds);
  const didResetRef = useRef(false);

  useEffect(() => {
    setRemaining(timeoutSeconds);
    didResetRef.current = false;
    if (!enabled) return;
    const timer = setInterval(() => {
      setRemaining((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [enabled, timeoutSeconds]);

  useEffect(() => {
    if (!enabled || remaining > 0 || didResetRef.current) return;
    didResetRef.current = true;
    onReset();
    setRemaining(timeoutSeconds);
  }, [enabled, onReset, remaining, timeoutSeconds]);

  const warningVisible = enabled && remaining <= 10;

  return (
    <View
      style={{ flex: 1 }}
      onTouchStart={() => {
        didResetRef.current = false;
        setRemaining(timeoutSeconds);
      }}
    >
      {children}
      <Modal visible={warningVisible} transparent animationType="fade">
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.42)" }}>
          <View style={{ width: 340, borderRadius: 8, backgroundColor: theme.backgroundColor, padding: 22, gap: 16 }}>
            <Text style={{ color: theme.textColor, fontSize: 22, fontWeight: "900", textAlign: "center" }}>
              Still there?
            </Text>
            <Text style={{ color: theme.textColor, fontSize: 15, textAlign: "center" }}>
              This order resets in {remaining}s.
            </Text>
            <KioskButton label="Keep ordering" onPress={() => setRemaining(timeoutSeconds)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}
