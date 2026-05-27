import { useKioskScale } from "@/contexts/kiosk/KioskScaleProvider";
import { useKioskFlow } from "@/contexts/kiosk/KioskFlowProvider";
import { useKioskTheme } from "@/contexts/kiosk/KioskThemeProvider";
import type {
  KioskProfile,
  KioskStationProfile,
} from "@/hooks/kiosk/useKioskProfile";
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
  onTemplateChange,
}: {
  data: KioskStationProfile | undefined;
  fallbackStation?: SelectedStation | null;
  profileStatus: "pending" | "error" | "success";
  profileError: string | null;
  onClose: () => void;
  onRefresh: () => void;
  onTemplateChange: (templateId: KioskProfile["template_id"]) => Promise<void>;
}) {
  const theme = useKioskTheme();
  const flow = useKioskFlow();
  const scale = useKioskScale();
  const [network, setNetwork] = useState("checking");
  const [savingTemplateId, setSavingTemplateId] = useState<
    KioskProfile["template_id"] | null
  >(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
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
  const stationTerminalId =
    station && "payment_terminal" in station
      ? station.payment_terminal?.id
      : null;

  const rows = [
    ["Station", station?.station_name ?? "Not loaded"],
    ["Station ID", station?.id ?? "Unknown"],
    ["Station Type", station?.station_type ?? "Unknown"],
    ["Profile", data?.profile?.profile_name ?? "Not bound"],
    ["Profile ID", data?.profile?.id ?? "None"],
    ["Profile Fetch", profileError ?? profileStatus],
    ["Network", network],
    [
      "Terminal",
      data?.profile?.payment_terminal_id ?? stationTerminalId ?? "None",
    ],
    ["App Version", Application.nativeApplicationVersion ?? "Unknown"],
    ["Build", Application.nativeBuildVersion ?? "Unknown"],
    ["Orientation", scale.orientation],
    [
      "Viewport DP",
      `${Math.round(scale.vw)} x ${Math.round(scale.vh)} @ scale ${scale.scale.toFixed(3)}`,
    ],
    [
      "Physical PX",
      `${physicalWidth} x ${physicalHeight} @ ${pixelRatio}x density`,
    ],
  ];
  const templateOptions = [
    { label: "Template A", value: "template_a" as const },
    { label: "Template B", value: "template_b" as const },
    { label: "Template C", value: "template_c" as const },
  ];

  const handleTemplateChange = async (
    templateId: KioskProfile["template_id"],
  ) => {
    flow.setTemplateId(templateId);
    setTemplateError(null);
    setSavingTemplateId(templateId);
    try {
      await onTemplateChange(templateId);
    } catch (error) {
      setTemplateError(
        error instanceof Error ? error.message : "Unable to save template",
      );
    } finally {
      setSavingTemplateId(null);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Kiosk Settings</Text>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Kiosk Template</Text>
        <View style={styles.templateRow}>
          {templateOptions.map((option) => {
            const active = option.value === flow.templateId;
            return (
              <Pressable
                key={option.value}
                onPress={() => void handleTemplateChange(option.value)}
                disabled={savingTemplateId != null}
                style={[
                  styles.templateOption,
                  active ? styles.templateOptionActive : null,
                  savingTemplateId != null ? styles.disabled : null,
                ]}
              >
                <Text
                  style={[
                    styles.templateOptionText,
                    active ? styles.templateOptionTextActive : null,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {templateError ? (
          <Text style={styles.errorText}>{templateError}</Text>
        ) : null}
      </View>
      <Text style={styles.sectionTitle}>Diagnostics</Text>
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

function makeStyles(
  theme: ReturnType<typeof useKioskTheme>,
  viewportWidth: number,
) {
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
    section: {
      borderRadius: 8,
      borderWidth: 1,
      borderColor: `${theme.textColor}18`,
      padding: 12,
      marginBottom: 14,
      backgroundColor: `${theme.textColor}05`,
    },
    sectionTitle: {
      color: theme.textColor,
      fontSize: 14,
      fontWeight: "800",
      marginBottom: 10,
    },
    templateRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    templateOption: {
      minHeight: 44,
      minWidth: 112,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: `${theme.textColor}18`,
      paddingHorizontal: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.backgroundColor,
    },
    templateOptionActive: {
      borderColor: theme.primaryColor,
      backgroundColor: theme.primaryColor,
    },
    templateOptionText: {
      color: theme.textColor,
      fontSize: 13,
      fontWeight: "800",
    },
    templateOptionTextActive: {
      color: "#FFFFFF",
    },
    errorText: {
      color: "#B91C1C",
      fontSize: 12,
      fontWeight: "700",
      marginTop: 10,
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
