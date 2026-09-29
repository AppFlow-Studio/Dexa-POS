import { AlertCircle, type LucideIcon } from "@/lib/icons";
import type { Tone } from "./kioskOrders";
import { Text, TouchableOpacity, View, type ViewStyle } from "react-native";

/** Building blocks for Kiosk Settings → Orders, in the Kiosk Settings look. */

export const TEAL = "#0D9488";

/** Soft elevation used on content cards to lift them off the canvas. */
export const cardShadow: ViewStyle = {
  shadowColor: "#0F172A",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.05,
  shadowRadius: 4,
  elevation: 1,
};

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <View
      className={`rounded-3xl border border-gray-200 bg-white overflow-hidden ${className ?? ""}`}
      style={cardShadow}
    >
      {children}
    </View>
  );
}

/** Uppercase caption + card, matching the other Kiosk Settings sections. */
export function SectionBlock({
  title,
  Icon,
  accent,
  children,
}: {
  title: string;
  Icon: LucideIcon;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 10 }}>
      <View className="flex-row items-center gap-2">
        <Icon size={16} color={accent ?? "#6B7280"} />
        <Text className="text-sm font-bold text-gray-500 uppercase tracking-wide">
          {title}
        </Text>
      </View>
      <Card>{children}</Card>
    </View>
  );
}

/** Centered message card for loading / empty / error states. */
export function StateCard({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <View className="items-center justify-center px-6 py-12">{children}</View>
    </Card>
  );
}

export function ErrorCard({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <StateCard>
      <AlertCircle size={28} color="#DC2626" />
      <Text className="text-sm text-gray-600 mt-3 text-center">{message}</Text>
      <TouchableOpacity
        onPress={onRetry}
        className="mt-4 px-5 py-3 rounded-2xl bg-teal-600"
      >
        <Text className="text-sm font-bold text-white">Try again</Text>
      </TouchableOpacity>
    </StateCard>
  );
}

const PILL: Record<Tone, { bg: string; text: string }> = {
  green: { bg: "bg-green-100", text: "text-green-700" },
  amber: { bg: "bg-amber-100", text: "text-amber-700" },
  red: { bg: "bg-red-100", text: "text-red-700" },
  gray: { bg: "bg-gray-100", text: "text-gray-600" },
};

export function StatusPill({ label, tone }: { label: string; tone: Tone }) {
  return (
    <View className={`px-2.5 py-1 rounded-full ${PILL[tone].bg}`}>
      <Text className={`text-xs font-bold ${PILL[tone].text}`}>{label}</Text>
    </View>
  );
}

/** Solid-teal selectable chip (date presets, refund reasons). */
export function Chip({
  label,
  active,
  onPress,
  disabled,
  Icon,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  disabled?: boolean;
  Icon?: LucideIcon;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      className={`flex-row items-center px-4 py-2.5 rounded-xl border ${
        active ? "bg-teal-600 border-teal-600" : "bg-white border-gray-200"
      }`}
    >
      {Icon ? (
        <Icon
          size={16}
          color={active ? "#FFFFFF" : "#6B7280"}
          style={{ marginRight: 6 }}
        />
      ) : null}
      <Text
        className={`text-sm ${
          active ? "font-bold text-white" : "font-medium text-gray-600"
        }`}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}
