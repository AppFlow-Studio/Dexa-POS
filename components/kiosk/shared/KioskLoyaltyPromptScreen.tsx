import { Delete, Gift } from "lucide-react-native";
import React, { useCallback, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

const PHONE_DIGITS = 10;

// Placeholder theme hook - replace with your actual implementation
const useKioskTheme = () => ({
  primaryColor: "#6366F1",
  textColor: "#1E293B",
  backgroundColor: "#FFFFFF",
});

// Placeholder strings - replace with your actual implementation
const kioskStrings = {
  loyaltyPrompt: "Enter your phone number",
  skip: "Skip",
  continue: "Continue",
};

// Placeholder button - replace with your actual KioskButton component
function KioskButton({
  label,
  variant = "primary",
  disabled = false,
  onPress,
}: {
  label: string;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useKioskTheme();
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={[
        {
          height: 56,
          borderRadius: 12,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor:
            variant === "primary"
              ? disabled
                ? `${theme.primaryColor}66`
                : theme.primaryColor
              : "#F1F5F9",
        },
      ]}
    >
      <Text
        style={{
          fontSize: 16,
          fontWeight: "700",
          color: variant === "primary" ? "#FFFFFF" : theme.textColor,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function formatEnteredPhone(digits: string): string {
  if (digits.length === 0) return "Enter number";
  const d = digits.slice(0, PHONE_DIGITS);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`;
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
}

// 3 columns x 4 rows grid
const NUMPAD_COLUMNS = [
  ["1", "4", "7", "clear"],
  ["2", "5", "8", "0"],
  ["3", "6", "9", "backspace"],
] as const;

type KeyType =
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "0"
  | "clear"
  | "backspace";

export function KioskLoyaltyPromptScreen({
  value,
  onChange,
  onContinue,
  onSkip,
}: {
  value: string;
  onChange: (value: string) => void;
  onContinue: () => void;
  onSkip: () => void;
}) {
  const theme = useKioskTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const canSubmit = value.length === PHONE_DIGITS;

  const handleKey = useCallback(
    (key: KeyType) => {
      if (key === "backspace") {
        onChange(value.slice(0, -1));
        return;
      }
      if (key === "clear") {
        onChange("");
        return;
      }
      if (value.length < PHONE_DIGITS) {
        onChange(`${value}${key}`);
      }
    },
    [onChange, value],
  );

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Header Icon */}
        <View style={styles.iconCircle}>
          <Gift size={32} color={theme.primaryColor} strokeWidth={2.2} />
        </View>

        {/* Headline */}
        <Text style={styles.headline}>{kioskStrings.loyaltyPrompt}</Text>

        {/* Phone Display */}
        <View style={styles.phoneDisplay}>
          <Text
            style={[
              styles.phoneText,
              value.length === 0 && styles.phoneTextPlaceholder,
            ]}
          >
            {formatEnteredPhone(value)}
          </Text>
        </View>

        {/* Numpad Grid */}
        <View style={styles.numpad}>
          {NUMPAD_COLUMNS.map((column, columnIndex) => (
            <View key={columnIndex} style={styles.numpadColumn}>
              {column.map((key) => (
                <NumpadKey
                  key={key}
                  keyValue={key}
                  theme={theme}
                  onPress={() => handleKey(key)}
                />
              ))}
            </View>
          ))}
        </View>

        {/* Action Buttons */}
        <View style={styles.actions}>
          <View style={styles.actionButton}>
            <KioskButton
              label={kioskStrings.skip}
              variant="secondary"
              onPress={onSkip}
            />
          </View>
          <View style={styles.actionButton}>
            <KioskButton
              label={kioskStrings.continue}
              disabled={!canSubmit}
              onPress={onContinue}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

function NumpadKey({
  keyValue,
  theme,
  onPress,
}: {
  keyValue: KeyType;
  theme: ReturnType<typeof useKioskTheme>;
  onPress: () => void;
}) {
  const isAction = keyValue === "clear" || keyValue === "backspace";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        keyStyles.key,
        isAction && keyStyles.keyAction,
        pressed && {
          backgroundColor: `${theme.primaryColor}20`,
          transform: [{ scale: 0.96 }],
        },
      ]}
    >
      {keyValue === "backspace" ? (
        <Delete size={24} color={theme.textColor} />
      ) : (
        <Text style={[keyStyles.keyText, isAction && keyStyles.keyTextAction]}>
          {keyValue === "clear" ? "C" : keyValue}
        </Text>
      )}
    </Pressable>
  );
}

const GAP = 12;
const KEY_SIZE = 80;
const GRID_WIDTH = KEY_SIZE * 3 + GAP * 2;

const keyStyles = StyleSheet.create({
  key: {
    width: KEY_SIZE,
    height: KEY_SIZE,
    borderRadius: 16,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  keyAction: {
    backgroundColor: "#E2E8F0",
  },
  keyText: {
    fontSize: 28,
    fontWeight: "800",
    color: "#1E293B",
  },
  keyTextAction: {
    fontSize: 18,
    fontWeight: "700",
    color: "#64748B",
  },
});

function makeStyles(theme: ReturnType<typeof useKioskTheme>) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.backgroundColor,
    },
    content: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 24,
      paddingVertical: 32,
    },
    iconCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: `${theme.primaryColor}12`,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    headline: {
      fontSize: 28,
      fontWeight: "800",
      color: theme.textColor,
      textAlign: "center",
      marginBottom: 24,
    },
    phoneDisplay: {
      width: GRID_WIDTH,
      height: 64,
      borderRadius: 12,
      backgroundColor: `${theme.primaryColor}08`,
      borderWidth: 2,
      borderColor: `${theme.primaryColor}20`,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 24,
    },
    phoneText: {
      fontSize: 26,
      fontWeight: "800",
      color: theme.textColor,
      letterSpacing: 2,
    },
    phoneTextPlaceholder: {
      color: `${theme.textColor}50`,
      letterSpacing: 0,
    },
    numpad: {
      width: GRID_WIDTH,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 24,
    },
    numpadColumn: {
      width: KEY_SIZE,
      alignItems: "center",
      gap: GAP,
    },
    actions: {
      width: GRID_WIDTH,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    actionButton: {
      width: (GRID_WIDTH - GAP) / 2,
    },
  });
}
