/**
 * QrCallWaiterBell — call-server notification bell for QR dine-in guests.
 *
 * Chrome, never a ticket state. Renders NOTHING at zero open alerts.
 * Mounted in the Order Line toolbar and the KDS header; both read the same
 * useQrGuestAlertsStore (fed by qr_guest_alert_changed broadcasts on the
 * orders channel), so resolving on either surface clears both.
 *
 * Age turns amber after 3 minutes (proposed threshold) — never red.
 * Uses the app's standard neutral/teal palette — no QR-blue accent here.
 */

import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { useQrGuestAlertsStore } from "@/stores/useQrGuestAlertsStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useToastStore } from "@/stores/useToastStore";
import { Bell, Check, X } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const AMBER_AFTER_MS = 3 * 60 * 1000;
const POLL_MS = 30_000;

function ageLabel(createdAt: string, now: number): { text: string; stale: boolean } {
  const ms = Math.max(0, now - new Date(createdAt).getTime());
  const mins = Math.floor(ms / 60000);
  const text = mins < 1 ? "just now" : `${mins}m ago`;
  return { text, stale: ms >= AMBER_AFTER_MS };
}

const QrCallWaiterBell: React.FC = () => {
  const client = useSupabaseClient();
  const locationId = useStoreSettingsStore((s) => s.selectedStore?.id ?? null);
  const alerts = useQrGuestAlertsStore((s) => s.alerts);
  const openCount = useQrGuestAlertsStore((s) => s.openCount);
  const showToast = useToastStore((s) => s.show);
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  // Seed on mount / location change, then poll as a realtime fallback.
  useEffect(() => {
    if (!locationId || !client) return;
    const store = useQrGuestAlertsStore.getState();
    store.seed(client, locationId);
    const interval = setInterval(() => {
      store.pollOpenCount(client, locationId);
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [client, locationId]);

  // Tick ages while the sheet is open.
  useEffect(() => {
    if (!sheetOpen) return;
    const t = setInterval(() => setNow(Date.now()), 15_000);
    setNow(Date.now());
    return () => clearInterval(t);
  }, [sheetOpen]);

  const sorted = useMemo(
    () =>
      [...alerts].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [alerts],
  );

  const handleResolve = async (alertId: string) => {
    if (!client) return;
    setResolvingId(alertId);
    const { error } = await useQrGuestAlertsStore
      .getState()
      .resolve(client, alertId);
    setResolvingId(null);
    if (error) {
      showToast({
        title: "Resolve failed",
        message: error.message ?? "Could not resolve the alert",
        type: "error",
      });
    }
  };

  // Bell only exists while there's at least one open alert.
  if (openCount < 1) return null;

  return (
    <>
      <TouchableOpacity
        onPress={() => setSheetOpen(true)}
        accessibilityLabel={`${openCount} guest call-server alert${openCount === 1 ? "" : "s"}`}
        className="rounded-lg p-3"
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.panel,
        }}
      >
        <Bell size={s(14)} color={colors.label} />
        <View
          style={{
            position: "absolute",
            top: -s(6),
            right: -s(6),
            width: openCount > 9 ? s(22) : s(17),
            height: s(17),
            borderRadius: s(9),
            backgroundColor: colors.warning,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              color: "#fff",
              fontSize: s(9),
              fontWeight: "800",
              textAlign: "center",
              includeFontPadding: false,
            }}
          >
            {openCount > 99 ? "99+" : openCount}
          </Text>
        </View>
      </TouchableOpacity>

      <Modal
        visible={sheetOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSheetOpen(false)}
      >
        <Pressable
          onPress={() => setSheetOpen(false)}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "flex-end",
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: colors.background,
              borderTopLeftRadius: s(18),
              borderTopRightRadius: s(18),
              maxHeight: "70%",
              padding: s(18),
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: s(14),
                gap: s(10),
              }}
            >
              <Bell size={s(18)} color={colors.label} />
              <Text
                style={{
                  flex: 1,
                  color: colors.heading,
                  fontSize: s(16),
                  fontWeight: "700",
                }}
              >
                Guest Requests ({openCount})
              </Text>
              <TouchableOpacity onPress={() => setSheetOpen(false)} hitSlop={10}>
                <X size={s(18)} color={colors.label} />
              </TouchableOpacity>
            </View>

            <ScrollView>
              {sorted.map((alert) => {
                const age = ageLabel(alert.createdAt, now);
                return (
                  <View
                    key={alert.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: s(12),
                      paddingVertical: s(12),
                      paddingHorizontal: s(14),
                      borderRadius: s(12),
                      borderWidth: 1,
                      borderColor: colors.border,
                      marginBottom: s(8),
                      backgroundColor: colors.card,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          color: colors.heading,
                          fontWeight: "700",
                          fontSize: s(14),
                        }}
                      >
                        {alert.tableLabel}
                      </Text>
                      <Text
                        style={{ color: colors.label, fontSize: s(12), marginTop: s(2) }}
                      >
                        Call server
                        {alert.message ? ` — “${alert.message}”` : ""}
                      </Text>
                      <Text
                        style={{
                          color: age.stale ? colors.warning : colors.muted,
                          fontSize: s(11),
                          marginTop: s(2),
                          fontWeight: age.stale ? "700" : "400",
                        }}
                      >
                        {age.text}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleResolve(alert.id)}
                      disabled={resolvingId === alert.id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: s(6),
                        paddingVertical: s(9),
                        paddingHorizontal: s(14),
                        borderRadius: s(10),
                        backgroundColor: colors.teal,
                        opacity: resolvingId === alert.id ? 0.5 : 1,
                      }}
                    >
                      <Check size={s(14)} color={colors.onSolid} />
                      <Text style={{ color: colors.onSolid, fontWeight: "700", fontSize: s(12) }}>
                        Resolve
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
              {sorted.length === 0 ? (
                <Text
                  style={{
                    color: colors.muted,
                    textAlign: "center",
                    paddingVertical: s(20),
                  }}
                >
                  No open requests
                </Text>
              ) : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

export default QrCallWaiterBell;
