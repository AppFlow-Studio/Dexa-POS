import { Check, X } from "lucide-react-native";
import React from "react";
import { colors } from "@/lib/theme";
import { StyleSheet, Text, View } from "react-native";

interface Props {
  success: boolean;
}

export function ResultScreen({ success }: Props) {
  return (
    <View style={styles.container}>
      <View
        style={[
          styles.iconContainer,
          success ? styles.successBg : styles.failBg,
        ]}
      >
        {success ? (
          <Check size={80} color="#ffffff" />
        ) : (
          <X size={80} color="#ffffff" />
        )}
      </View>
      <Text
        style={[
          styles.title,
          success ? styles.successText : styles.failText,
        ]}
      >
        {success ? "Approved" : "Declined"}
      </Text>
      <Text style={styles.subtitle}>
        {success ? "Thank you!" : "Please try again"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.screen,
  },
  iconContainer: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  successBg: { backgroundColor: "#10b981" },
  failBg: { backgroundColor: "#ef4444" },
  title: { fontSize: 48, fontWeight: "700", marginBottom: 8 },
  successText: { color: "#10b981" },
  failText: { color: "#ef4444" },
  subtitle: { fontSize: 24, color: "#9ca3af" },
});
