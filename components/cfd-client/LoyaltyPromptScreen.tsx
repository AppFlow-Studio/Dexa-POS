// components/cfd-client/LoyaltyPromptScreen.tsx
import { useCFDDisplayData } from "@/contexts/CFDDisplayDataContext";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

interface Props {
  onPhoneSubmitted: (phone: string) => void;
  onSkip: () => void;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

function formatPhone(digits: string): string {
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function LoyaltyPromptScreen({ onPhoneSubmitted, onSkip }: Props) {
  const { branding, loyaltyPrompt } = useCFDDisplayData();
  const [digits, setDigits] = useState("");

  const handleKey = (key: string) => {
    if (key === "⌫") {
      setDigits((d) => d.slice(0, -1));
    } else if (key === "") {
      // no-op placeholder
    } else if (digits.length < 10) {
      setDigits((d) => d + key);
    }
  };

  const handleSubmit = () => {
    if (digits.length === 10) {
      onPhoneSubmitted(digits);
    }
  };

  const merchantName = loyaltyPrompt?.merchantName ?? branding?.restaurantName ?? "";

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.brandName}>{merchantName}</Text>
        <Text style={styles.headline}>Earn rewards with every visit!</Text>
        <Text style={styles.subtitle}>Enter your phone number</Text>
      </View>

      <View style={styles.displayContainer}>
        <Text style={[styles.phoneDisplay, digits.length === 0 && styles.phoneDisplayPlaceholder]}>
          {digits.length === 0 ? "(___) ___-____" : formatPhone(digits)}
        </Text>
        <View style={styles.phoneDivider} />
      </View>

      <View style={styles.keypad}>
        {KEYS.map((key, idx) => (
          <Pressable
            key={idx}
            onPress={() => handleKey(key)}
            style={({ pressed }) => [
              styles.key,
              key === "" && styles.keyInvisible,
              pressed && key !== "" && styles.keyPressed,
            ]}
            disabled={key === ""}
          >
            <Text style={[styles.keyText, key === "⌫" && styles.keyBackspace]}>
              {key}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.footer}>
        <Pressable
          onPress={handleSubmit}
          disabled={digits.length !== 10}
          style={[styles.submitBtn, digits.length !== 10 && styles.submitBtnDisabled]}
        >
          <Text style={styles.submitBtnText}>Collect Points</Text>
        </Pressable>

        <Pressable onPress={onSkip} style={styles.skipBtn}>
          <Text style={styles.skipBtnText}>Skip</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
    padding: 40,
    justifyContent: "space-between",
    alignItems: "center",
  },
  header: {
    alignItems: "center",
    marginTop: 20,
    gap: 8,
  },
  brandName: {
    fontSize: 18,
    color: "#737373",
    fontWeight: "500",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  headline: {
    fontSize: 38,
    fontWeight: "800",
    color: "#ffffff",
    textAlign: "center",
    letterSpacing: -0.5,
    marginTop: 4,
  },
  subtitle: {
    fontSize: 20,
    color: "#737373",
  },
  displayContainer: {
    alignItems: "center",
    width: "80%",
  },
  phoneDisplay: {
    fontSize: 44,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: 2,
    textAlign: "center",
  },
  phoneDisplayPlaceholder: {
    color: "#404040",
  },
  phoneDivider: {
    height: 2,
    width: "100%",
    backgroundColor: "#262626",
    marginTop: 12,
    borderRadius: 1,
  },
  keypad: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    width: 340,
    gap: 12,
  },
  key: {
    width: 100,
    height: 80,
    backgroundColor: "#171717",
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#262626",
  },
  keyInvisible: {
    backgroundColor: "transparent",
    borderColor: "transparent",
  },
  keyPressed: {
    backgroundColor: "#262626",
  },
  keyText: {
    fontSize: 32,
    fontWeight: "600",
    color: "#ffffff",
  },
  keyBackspace: {
    fontSize: 26,
    color: "#a3a3a3",
  },
  footer: {
    alignItems: "center",
    gap: 16,
    marginBottom: 20,
    width: "80%",
  },
  submitBtn: {
    backgroundColor: "#10b981",
    paddingHorizontal: 48,
    paddingVertical: 18,
    borderRadius: 20,
    width: "100%",
    alignItems: "center",
  },
  submitBtnDisabled: {
    backgroundColor: "#171717",
  },
  submitBtnText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#ffffff",
  },
  skipBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  skipBtnText: {
    fontSize: 18,
    color: "#525252",
    fontWeight: "500",
  },
});
