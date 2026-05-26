import { useKioskScale } from "@/contexts/kiosk/KioskScaleProvider";
import { useKioskTheme } from "@/contexts/kiosk/KioskThemeProvider";
import { Image } from "expo-image";
import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export function KioskSplash({
  profileLoaded,
  profileError,
  onLogoLongPress,
}: {
  profileLoaded: boolean;
  profileError: string | null;
  onLogoLongPress: () => void;
}) {
  const theme = useKioskTheme();
  const { scale } = useKioskScale();
  const styles = useMemo(() => makeStyles(theme, scale), [scale, theme]);

  return (
    <View style={styles.container}>
      <Pressable
        delayLongPress={5000}
        onLongPress={onLogoLongPress}
        style={styles.logoTarget}
      >
        {theme.logoUrl ? (
          <Image source={{ uri: theme.logoUrl }} style={styles.logo} contentFit="contain" />
        ) : (
          <View style={styles.logoFallback}>
            <Text style={styles.logoFallbackText}>DEXA</Text>
          </View>
        )}
      </Pressable>
      <Text style={styles.welcome}>{theme.welcomeMessage}</Text>
      <View style={styles.statusRow}>
        <View style={[styles.statusDot, profileLoaded ? styles.statusDotReady : styles.statusDotLoading]} />
        <Text style={styles.statusText}>
          {profileError ?? (profileLoaded ? "Kiosk profile loaded" : "Loading kiosk profile")}
        </Text>
      </View>
    </View>
  );
}

function makeStyles(theme: ReturnType<typeof useKioskTheme>, scale: number) {
  const resolvedScale = Math.max(0.72, scale);
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.backgroundColor,
      paddingHorizontal: 64 * resolvedScale,
    },
    logoTarget: {
      minWidth: 160 * resolvedScale,
      minHeight: 160 * resolvedScale,
      alignItems: "center",
      justifyContent: "center",
    },
    logo: {
      width: 360 * resolvedScale,
      height: 220 * resolvedScale,
    },
    logoFallback: {
      width: 220 * resolvedScale,
      height: 220 * resolvedScale,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.primaryColor,
    },
    logoFallbackText: {
      color: "#FFFFFF",
      fontSize: 48 * resolvedScale,
      fontWeight: "900",
      letterSpacing: 0,
    },
    welcome: {
      marginTop: 44 * resolvedScale,
      color: theme.textColor,
      fontFamily: theme.fontFamily,
      fontSize: 64 * resolvedScale,
      fontWeight: "800",
      lineHeight: 76 * resolvedScale,
      textAlign: "center",
    },
    statusRow: {
      position: "absolute",
      bottom: 40 * resolvedScale,
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    statusDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    statusDotReady: {
      backgroundColor: "#15803D",
    },
    statusDotLoading: {
      backgroundColor: theme.primaryColor,
    },
    statusText: {
      color: theme.textColor,
      fontSize: 14,
      opacity: 0.72,
    },
  });
}
