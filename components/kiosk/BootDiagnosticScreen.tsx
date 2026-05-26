import { useKioskScale } from "@/contexts/kiosk/KioskScaleProvider";
import { useKioskTheme } from "@/contexts/kiosk/KioskThemeProvider";
import type { KioskStationProfile } from "@/hooks/kiosk/useKioskProfile";
import type { SelectedStation } from "@/types/station";
import NetInfo from "@react-native-community/netinfo";
import * as Application from "expo-application";
import React, { useEffect, useMemo, useState } from "react";
import { PixelRatio, Pressable, StyleSheet, Text, View } from "react-native";

export function BootDiagnosticScreen({
  data,
  fallbackStation,
  profileStatus,
  profileError,
  onClose,
  onRefresh,
}: {
  data: KioskStationProfile | undefined;
  fallbackStation?: SelectedStation | null;
  profileStatus: "pending" | "error" | "success";
  profileError: string | null;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const theme = useKioskTheme();
  const scale = useKioskScale();
  const [network, setNetwork] = useState("checking");
  const styles = useMemo(() => makeStyles(theme, scale.vw), [scale.vw, theme]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setNetwork(`${state.type} / ${state.isConnected ? "online" : "offline"}`);
    });
    return unsubscribe;
  }, []);

  const station = data?.station ?? fallbackStation;
  const pixelRatio = PixelRatio.get();
  const physicalWidth = Math.round(scale.vw * pixelRatio);
  const physicalHeight = Math.round(scale.vh * pixelRatio);

  const rows = [
    ["Station", station?.station_name ?? "Not loaded"],
    ["Station ID", station?.id ?? "Unknown"],
    ["Station Type", station?.station_type ?? "Unknown"],
    ["Profile", data?.profile?.profile_name ?? "Not bound"],
    ["Profile ID", data?.profile?.id ?? "None"],
    ["Profile Fetch", profileError ?? profileStatus],
    ["Network", network],
    ["Terminal", data?.profile?.payment_terminal_id ?? station?.payment_terminal?.id ?? "None"],
    ["App Version", Application.nativeApplicationVersion ?? "Unknown"],
    ["Build", Application.nativeBuildVersion ?? "Unknown"],
    ["Viewport DP", `${Math.round(scale.vw)} x ${Math.round(scale.vh)} @ scale ${scale.scale.toFixed(3)}`],
    ["Physical PX", `${physicalWidth} x ${physicalHeight} @ ${pixelRatio}x density`],
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Kiosk Diagnostics</Text>
      <View style={styles.rows}>
        {rows.map(([label, value]) => (
          <View key={label} style={styles.row}>
            <Text style={styles.label}>{label}</Text>
            <Text style={styles.value}>{value}</Text>
          </View>
        ))}
      </View>
      <View style={styles.actions}>
        <Pressable onPress={onRefresh} style={styles.secondaryAction}>
          <Text style={styles.secondaryActionText}>Refresh Config</Text>
        </Pressable>
        <Pressable onPress={onClose} style={styles.primaryAction}>
          <Text style={styles.primaryActionText}>Close</Text>
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(theme: ReturnType<typeof useKioskTheme>, viewportWidth: number) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.backgroundColor,
      paddingHorizontal: 18,
      paddingVertical: 14,
    },
    title: {
      color: theme.textColor,
      fontFamily: theme.fontFamily,
      fontSize: 22,
      fontWeight: "800",
      marginBottom: 12,
    },
    rows: {
      borderTopWidth: 1,
      borderTopColor: `${theme.textColor}22`,
    },
    row: {
      minHeight: 36,
      borderBottomWidth: 1,
      borderBottomColor: `${theme.textColor}22`,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 5,
    },
    label: {
      width: Math.min(132, Math.max(96, viewportWidth * 0.28)),
      color: theme.primaryColor,
      fontSize: 12,
      fontWeight: "700",
    },
    value: {
      flex: 1,
      color: theme.textColor,
      fontSize: 12,
      lineHeight: 16,
    },
    actions: {
      flexDirection: "row",
      gap: 12,
      marginTop: 14,
      flexWrap: "wrap",
    },
    primaryAction: {
      minHeight: 42,
      minWidth: 86,
      paddingHorizontal: 14,
      borderRadius: 8,
      backgroundColor: theme.primaryColor,
      alignItems: "center",
      justifyContent: "center",
    },
    primaryActionText: {
      color: "#FFFFFF",
      fontSize: 13,
      fontWeight: "700",
    },
    secondaryAction: {
      minHeight: 42,
      minWidth: 128,
      paddingHorizontal: 14,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.primaryColor,
      alignItems: "center",
      justifyContent: "center",
    },
    secondaryActionText: {
      color: theme.primaryColor,
      fontSize: 13,
      fontWeight: "700",
    },
  });
}
