/**
 * Building blocks for the menu management screen.
 *
 * They follow the vocabulary the rest of the POS already uses (Settings,
 * Loyalty, Inventory): tinted-teal primary actions, bordered secondary actions,
 * `panel` surfaces with a 1px `border`, pills in a tone's 18%/40% tint. Every
 * dimension goes through the UI scale, and every tappable control is at least
 * `s(34)` tall (toolbar controls `s(40)`), which the old screen's ~26px icon
 * buttons were not.
 *
 * Styles are built inline at render: `colors` is a theme Proxy, and a
 * module-level StyleSheet would freeze it to whichever theme loaded first.
 */
import React, { createContext, useCallback, useContext } from "react";
import {
  ActivityIndicator,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { Search, X, type LucideIcon } from "@/lib/icons";
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";

type ScaleFn = (n: number) => number;

const ScaleContext = createContext<ScaleFn | null>(null);
const unscaled: ScaleFn = (n) => Math.round(n);

/**
 * Computes the UI scale once for the whole screen. `useUiScale` subscribes to
 * window dimensions and the settings store; calling it from every pill and
 * button put hundreds of subscriptions on the grid, one set per small
 * component, which is real mount cost on a low-end tablet.
 */
export function MenuScaleProvider({ children }: { children: React.ReactNode }) {
  const uiScale = useUiScale();
  const s = useCallback((n: number) => Math.round(n * uiScale), [uiScale]);
  return <ScaleContext.Provider value={s}>{children}</ScaleContext.Provider>;
}

/** `s(n)`: n dp at the baseline tablet, scaled for this screen and setting. */
export function useS(): ScaleFn {
  return useContext(ScaleContext) ?? unscaled;
}

export type Tone =
  | "accent"
  | "success"
  | "danger"
  | "warning"
  | "info"
  | "neutral";

export const toneColor = (tone: Tone): string => {
  switch (tone) {
    case "accent":
      return colors.teal;
    case "success":
      return colors.success;
    case "danger":
      return colors.danger;
    case "warning":
      return colors.warning;
    case "info":
      return colors.info;
    default:
      return colors.label;
  }
};

// ---------------------------------------------------------------------------
// Pill
// ---------------------------------------------------------------------------

interface PillProps {
  label: string;
  tone?: Tone;
  icon?: LucideIcon;
  /** Solid fill — for the one status that must win the eye (86'd on a card). */
  solid?: boolean;
  size?: "sm" | "md";
}

export const Pill = React.memo(function Pill({
  label,
  tone = "neutral",
  icon: Icon,
  solid = false,
  size = "md",
}: PillProps) {
  const s = useS();
  const color = toneColor(tone);
  const height = s(size === "sm" ? 20 : 24);
  const neutral = tone === "neutral";
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s(4),
        height,
        paddingHorizontal: s(size === "sm" ? 7 : 9),
        // height/2, not 999: large radii render square on Android Fabric.
        borderRadius: height / 2,
        borderWidth: 1,
        backgroundColor: solid ? color : neutral ? colors.card : color + "18",
        borderColor: solid ? color : neutral ? colors.border : color + "40",
        flexShrink: 0,
      }}
    >
      {Icon && (
        <Icon
          size={s(size === "sm" ? 11 : 12)}
          color={solid ? colors.onSolid : color}
          strokeWidth={2.5}
        />
      )}
      <Text
        numberOfLines={1}
        style={{
          fontSize: s(size === "sm" ? 10 : 11),
          fontWeight: "600",
          color: solid ? colors.onSolid : color,
        }}
      >
        {label}
      </Text>
    </View>
  );
});

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "danger" | "solid";

interface ButtonProps {
  label?: string;
  icon?: LucideIcon;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const buttonColors = (variant: ButtonVariant) => {
  switch (variant) {
    case "primary":
      return {
        bg: colors.teal + "20",
        border: colors.teal + "50",
        fg: colors.teal,
      };
    case "danger":
      return {
        bg: colors.danger + "18",
        border: colors.danger + "45",
        fg: colors.danger,
      };
    case "solid":
      return { bg: colors.teal, border: colors.teal, fg: colors.onSolid };
    default:
      return { bg: colors.panel, border: colors.border, fg: colors.heading };
  }
};

export const Button = React.memo(function Button({
  label,
  icon: Icon,
  onPress,
  variant = "secondary",
  size = "md",
  disabled = false,
  loading = false,
  accessibilityLabel,
  style,
}: ButtonProps) {
  const s = useS();
  const { bg, border, fg } = buttonColors(variant);
  const height = s(size === "sm" ? 34 : 40);
  const iconOnly = !label;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || loading }}
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: s(6),
          height,
          minWidth: height,
          paddingHorizontal: iconOnly ? 0 : s(size === "sm" ? 10 : 14),
          borderRadius: s(10),
          borderWidth: 1,
          backgroundColor: bg,
          borderColor: border,
          opacity: disabled ? 0.45 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        Icon && <Icon size={s(size === "sm" ? 15 : 17)} color={fg} />
      )}
      {label ? (
        <Text
          numberOfLines={1}
          style={{
            fontSize: s(size === "sm" ? 12 : 13),
            fontWeight: "600",
            color: fg,
          }}
        >
          {label}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
});

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

interface SearchFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  style?: StyleProp<ViewStyle>;
}

export const SearchField = React.memo(function SearchField({
  value,
  onChangeText,
  placeholder,
  style,
}: SearchFieldProps) {
  const s = useS();
  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: s(8),
          height: s(40),
          paddingLeft: s(12),
          paddingRight: s(4),
          borderRadius: s(10),
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.panel,
        },
        style,
      ]}
    >
      <Search size={s(16)} color={colors.muted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        style={{
          flex: 1,
          fontSize: s(14),
          color: colors.heading,
          paddingVertical: 0,
        }}
      />
      {value.length > 0 && (
        <TouchableOpacity
          onPress={() => onChangeText("")}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          style={{
            width: s(32),
            height: s(32),
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <X size={s(16)} color={colors.label} />
        </TouchableOpacity>
      )}
    </View>
  );
});

// ---------------------------------------------------------------------------
// Filter chips (also used as a segmented control)
// ---------------------------------------------------------------------------

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

interface FilterChipsProps<T extends string> {
  options: readonly ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

function FilterChipsBase<T extends string>({
  options,
  value,
  onChange,
}: FilterChipsProps<T>) {
  const s = useS();
  const height = s(36);
  return (
    <View style={{ flexDirection: "row", gap: s(6) }}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <TouchableOpacity
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: s(6),
              height,
              paddingHorizontal: s(12),
              borderRadius: height / 2,
              borderWidth: 1,
              // Both states keep a fill: toggling a pill's background to
              // transparent drops its rounded corners on Android Fabric.
              backgroundColor: selected ? colors.teal + "20" : colors.panel,
              borderColor: selected ? colors.teal + "50" : colors.border,
            }}
          >
            <Text
              style={{
                fontSize: s(13),
                fontWeight: selected ? "600" : "500",
                color: selected ? colors.teal : colors.label,
              }}
            >
              {option.label}
            </Text>
            {option.count !== undefined && (
              <Text
                style={{
                  fontSize: s(12),
                  fontWeight: "600",
                  color: selected ? colors.teal : colors.muted,
                }}
              >
                {option.count}
              </Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export const FilterChips = React.memo(FilterChipsBase) as typeof FilterChipsBase;

// ---------------------------------------------------------------------------
// Layout pieces
// ---------------------------------------------------------------------------

/** The standard container: panel fill, hairline border, rounded. */
export function Surface({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const s = useS();
  return (
    <View
      style={[
        {
          backgroundColor: colors.panel,
          borderRadius: s(12),
          borderWidth: 1,
          borderColor: colors.border,
          overflow: "hidden",
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionLabel({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  const s = useS();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        minHeight: s(34),
        marginBottom: s(6),
      }}
    >
      <Text
        style={{
          fontSize: s(11),
          fontWeight: "700",
          color: colors.muted,
          textTransform: "uppercase",
          letterSpacing: 0.8,
        }}
      >
        {children}
      </Text>
      {right}
    </View>
  );
}

interface SettingRowProps {
  title: string;
  description?: string;
  right: React.ReactNode;
  last?: boolean;
}

/** Title + explanation on the left, a control on the right. */
export function SettingRow({ title, description, right, last }: SettingRowProps) {
  const s = useS();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s(12),
        paddingVertical: s(12),
        paddingHorizontal: s(14),
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.border,
      }}
    >
      <View style={{ flex: 1, gap: s(2) }}>
        <Text
          style={{ fontSize: s(14), fontWeight: "500", color: colors.heading }}
        >
          {title}
        </Text>
        {description ? (
          <Text style={{ fontSize: s(12), color: colors.muted }}>
            {description}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

interface NoticeProps {
  tone?: Tone;
  icon: LucideIcon;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Inline banner: offline, read-only, managed elsewhere. */
export function Notice({ tone = "info", icon: Icon, children, style }: NoticeProps) {
  const s = useS();
  const color = toneColor(tone);
  return (
    <View
      accessibilityRole={tone === "danger" ? "alert" : undefined}
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: s(10),
          paddingHorizontal: s(12),
          paddingVertical: s(10),
          borderRadius: s(10),
          borderWidth: 1,
          backgroundColor: color + "14",
          borderColor: color + "35",
        },
        style,
      ]}
    >
      <Icon size={s(16)} color={color} />
      <Text
        style={{ flex: 1, fontSize: s(12), fontWeight: "500", color: colors.heading }}
      >
        {children}
      </Text>
    </View>
  );
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  const s = useS();
  return (
    <View
      style={{
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: s(40),
        paddingHorizontal: s(24),
        gap: s(8),
      }}
    >
      <View
        style={{
          width: s(52),
          height: s(52),
          borderRadius: s(14),
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.teal + "15",
          borderWidth: 1,
          borderColor: colors.teal + "35",
          marginBottom: s(4),
        }}
      >
        <Icon size={s(22)} color={colors.teal} />
      </View>
      <Text
        style={{
          fontSize: s(15),
          fontWeight: "600",
          color: colors.heading,
          textAlign: "center",
        }}
      >
        {title}
      </Text>
      {description ? (
        <Text
          style={{
            fontSize: s(13),
            color: colors.muted,
            textAlign: "center",
            maxWidth: s(360),
          }}
        >
          {description}
        </Text>
      ) : null}
      {action ? <View style={{ marginTop: s(8) }}>{action}</View> : null}
    </View>
  );
}
