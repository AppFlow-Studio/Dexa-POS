import {
  KIOSK_HAIRLINE,
  kioskFont,
  kioskRadius,
  kioskTracking,
  useKioskTheme,
} from "@/components/kiosk/shared/kioskDesign";
import { KioskPressable } from "@/components/kiosk/shared/KioskPressable";
import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import { ChevronLeft, MapPin } from "@/lib/icons";
import { useKioskUiScale } from "@/lib/uiScale";
import type { KioskConfig, KioskSeatOption } from "@/types/kiosk";
import { Pressable, ScrollView, Text, View } from "react-native";

/**
 * Dine-in "Where are you sitting?" step. One tap on a merchant-defined label
 * ("Table 6 — Seat 2", "Patio Table 4") picks it; the label is attached to the
 * order as its table so staff know where to deliver.
 *
 * A wrapping grid in a ScrollView: lists are merchant-typed and capped at 200
 * short labels, so plain Pressables are cheap enough and need no virtualised
 * list with its fixed-height cell constraints.
 */
export function KioskSeatSelectScreen({
  config,
  options,
  selected,
  onSelect,
  onBack,
}: {
  config: KioskConfig;
  options: KioskSeatOption[];
  selected: string | null;
  onSelect: (label: string) => void;
  onBack: () => void;
}) {
  const s = useKioskUiScale();
  const t = useKioskTheme(config);

  return (
    <View className="flex-1" style={{ backgroundColor: t.page }}>
      <Pressable
        onPress={onBack}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={{
          position: "absolute",
          top: kioskPx(20, s),
          left: kioskPx(20, s),
          zIndex: 10,
          width: kioskPx(48, s),
          height: kioskPx(48, s),
          borderRadius: kioskPx(24, s),
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: t.outline,
        }}
      >
        <ChevronLeft size={kioskPx(26, s)} color={t.text} />
      </Pressable>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: kioskPx(40, s),
          paddingVertical: kioskPx(88, s),
        }}
      >
        <MapPin size={kioskPx(44, s)} color={t.primary} />
        <Text
          style={{
            marginTop: kioskPx(16, s),
            fontSize: kioskPx(36, s),
            lineHeight: kioskPx(44, s),
            letterSpacing: kioskTracking(36),
            ...kioskFont(t, "bold"),
            textAlign: "center",
            color: config.headerTextColor,
          }}
        >
          Where are you sitting?
        </Text>
        <Text
          style={{
            marginTop: kioskPx(8, s),
            marginBottom: kioskPx(36, s),
            fontSize: kioskPx(18, s),
            color: t.textMuted,
            textAlign: "center",
            ...kioskFont(t, "regular"),
          }}
        >
          We&apos;ll bring your order to you
        </Text>

        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: kioskPx(16, s),
            maxWidth: kioskPx(960, s),
          }}
        >
          {options.map((option) => {
            const isSelected = option.label === selected;
            return (
              <KioskPressable
                key={option.id}
                onPress={() => onSelect(option.label)}
                pressedScale={0.96}
                accessibilityRole="button"
                accessibilityLabel={option.label}
                style={{
                  minWidth: kioskPx(200, s),
                  minHeight: kioskPx(88, s),
                  paddingHorizontal: kioskPx(24, s),
                  borderRadius: kioskPx(kioskRadius.lg, s),
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: isSelected ? t.primary : t.surface,
                  borderWidth: KIOSK_HAIRLINE,
                  borderColor: isSelected ? t.primary : t.outlineStrong,
                }}
              >
                <Text
                  numberOfLines={2}
                  style={{
                    fontSize: kioskPx(22, s),
                    textAlign: "center",
                    color: isSelected ? t.onPrimary : t.text,
                    ...kioskFont(t, "bold"),
                  }}
                >
                  {option.label}
                </Text>
              </KioskPressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
