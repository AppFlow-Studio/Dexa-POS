import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import { resolveMenuItemFallbackIconKey } from "@/components/kiosk/shared/menuItemFallbackIcon";
import { useKioskUiScale } from "@/lib/uiScale";
import { resolveMenuItemImageSource } from "@/lib/menuItemImageSource";
import { getMenuItemPlaceholderIcon } from "@/lib/menuItemPlaceholderIcon";
import type { MenuItemType } from "@/lib/types";
import {
  lineTotal,
  useKioskCartStore,
  type KioskCartLine,
} from "@/stores/useKioskCartStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import type { KioskConfig } from "@/types/kiosk";
import { ChevronLeft, Minus, Plus, ShoppingCart, Trash2 } from "lucide-react-native";
import { Image, Pressable, ScrollView, Text, View } from "react-native";

/**
 * Shared kiosk cart review. Lists each line with its selected modifiers, a qty
 * stepper, and a remove action; shows the subtotal and a Checkout CTA.
 * Presentation only — reads/mutates useKioskCartStore directly. Theme-driven,
 * so any template can mount it via onBack / onCheckout.
 */
export function KioskCartView({
  config,
  onBack,
  onCheckout,
}: {
  config: KioskConfig;
  onBack: () => void;
  onCheckout: () => void;
}) {
  const s = useKioskUiScale();
  const lines = useKioskCartStore((s) => s.lines);
  const subtotal = useKioskCartStore((s) => s.subtotal());
  const incQuantity = useKioskCartStore((s) => s.incQuantity);
  const decQuantity = useKioskCartStore((s) => s.decQuantity);
  const removeLine = useKioskCartStore((s) => s.removeLine);

  // Estimated tax from the location's standard rate (the exact figure is
  // computed by the order store at checkout). Falls back to the first rate in
  // the map when there's no explicit "standard" category. Percentage → fraction.
  const taxRatePct = useStoreSettingsStore((s) => {
    const map = s.taxRatesMap ?? {};
    return map.standard ?? Object.values(map)[0] ?? 0;
  });
  const estTax = subtotal * (taxRatePct / 100);
  const estTotal = subtotal + estTax;

  const muted = `${config.textColor}99`;
  const faint = `${config.textColor}12`;

  return (
    <View className="flex-1" style={{ backgroundColor: config.backgroundColor }}>
      {/* Header row */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: kioskPx(12, s),
          paddingHorizontal: kioskPx(24, s),
          paddingVertical: kioskPx(18, s),
        }}
      >
        <Pressable onPress={onBack} hitSlop={8}>
          <ChevronLeft size={kioskPx(28, s)} color={config.textColor} />
        </Pressable>
        <Text
          style={{ fontSize: kioskPx(26, s), fontWeight: "800", color: config.textColor }}
        >
          Your Order
        </Text>
      </View>

      {lines.length === 0 ? (
        <EmptyCart config={config} onBack={onBack} muted={muted} />
      ) : (
        <>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: kioskPx(24, s),
              paddingBottom: kioskPx(24, s),
              gap: kioskPx(14, s),
            }}
          >
            {lines.map((line) => (
              <CartLineRow
                key={line.lineId}
                line={line}
                config={config}
                faint={faint}
                muted={muted}
                onInc={() => incQuantity(line.lineId)}
                onDec={() => decQuantity(line.lineId)}
                onRemove={() => removeLine(line.lineId)}
              />
            ))}
          </ScrollView>

          {/* Sticky footer — subtotal + checkout */}
          <View
            style={{
              paddingHorizontal: kioskPx(24, s),
              paddingTop: kioskPx(16, s),
              paddingBottom: kioskPx(22, s),
              borderTopWidth: 1,
              borderTopColor: faint,
              backgroundColor: config.backgroundColor,
              shadowColor: "#000",
              shadowOpacity: 0.08,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: -4 },
              elevation: 12,
              gap: kioskPx(14, s),
            }}
          >
            <SummaryRow label="Subtotal" value={subtotal} muted={muted} color={config.textColor} />
            {taxRatePct > 0 && (
              <SummaryRow
                label={`Tax (${taxRatePct}%)`}
                value={estTax}
                muted={muted}
                color={config.textColor}
              />
            )}
            <View style={{ height: 1, backgroundColor: faint }} />
            <SummaryRow label="Total" value={estTotal} muted={muted} color={config.textColor} emphasize />

            <Pressable
              onPress={onCheckout}
              style={{
                height: kioskPx(60, s),
                borderRadius: kioskPx(18, s),
                alignItems: "center",
                justifyContent: "center",
                marginTop: kioskPx(4, s),
                backgroundColor: config.primaryColor,
              }}
            >
              <Text
                style={{ color: "#FFFFFF", fontSize: kioskPx(18, s), fontWeight: "800" }}
              >
                Checkout · ${estTotal.toFixed(2)}
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

function CartLineRow({
  line,
  config,
  faint,
  muted,
  onInc,
  onDec,
  onRemove,
}: {
  line: KioskCartLine;
  config: KioskConfig;
  faint: string;
  muted: string;
  onInc: () => void;
  onDec: () => void;
  onRemove: () => void;
}) {
  const s = useKioskUiScale();
  const imageSource = resolveMenuItemImageSource(line.image);
  // Build a minimal item-like object for the fallback icon heuristic.
  const PlaceholderIcon = getMenuItemPlaceholderIcon(
    resolveMenuItemFallbackIconKey({
      name: line.name,
      category: [],
    } as unknown as MenuItemType),
  );

  const modifierText = line.modifiers
    .flatMap((g) => g.options.map((o) => o.name))
    .join(", ");

  return (
    <View
      style={{
        flexDirection: "row",
        gap: kioskPx(14, s),
        padding: kioskPx(14, s),
        borderRadius: kioskPx(18, s),
        borderWidth: 1,
        borderColor: faint,
        backgroundColor: config.backgroundColor,
      }}
    >
      {/* Thumb */}
      <View
        style={{
          width: kioskPx(72, s),
          height: kioskPx(72, s),
          borderRadius: kioskPx(14, s),
          overflow: "hidden",
          backgroundColor: `${config.primaryColor}10`,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {imageSource ? (
          <Image
            source={imageSource}
            style={{ width: "100%", height: "100%" }}
            resizeMode="cover"
          />
        ) : (
          <PlaceholderIcon color={`${config.textColor}40`} size={kioskPx(28, s)} />
        )}
      </View>

      {/* Details */}
      <View style={{ flex: 1, justifyContent: "space-between" }}>
        <View>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: kioskPx(8, s),
            }}
          >
            <Text
              style={{
                flex: 1,
                fontSize: kioskPx(17, s),
                fontWeight: "700",
                color: config.textColor,
              }}
              numberOfLines={2}
            >
              {line.name}
            </Text>
            <Text
              style={{
                fontSize: kioskPx(17, s),
                fontWeight: "800",
                color: config.textColor,
              }}
            >
              ${lineTotal(line).toFixed(2)}
            </Text>
          </View>
          {modifierText ? (
            <Text
              style={{ fontSize: kioskPx(14, s), color: muted, marginTop: kioskPx(4, s) }}
              numberOfLines={2}
            >
              {modifierText}
            </Text>
          ) : null}
        </View>

        {/* Qty + remove */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: kioskPx(10, s),
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: kioskPx(16, s),
              paddingHorizontal: kioskPx(14, s),
              paddingVertical: kioskPx(7, s),
              borderRadius: 999,
              borderWidth: 1.5,
              borderColor: faint,
            }}
          >
            <Pressable onPress={onDec} hitSlop={6}>
              <Minus size={kioskPx(18, s)} color={config.textColor} />
            </Pressable>
            <Text
              style={{
                fontSize: kioskPx(16, s),
                fontWeight: "700",
                color: config.textColor,
                minWidth: kioskPx(18, s),
                textAlign: "center",
              }}
            >
              {line.quantity}
            </Text>
            <Pressable onPress={onInc} hitSlop={6}>
              <Plus size={kioskPx(18, s)} color={config.textColor} />
            </Pressable>
          </View>

          <Pressable onPress={onRemove} hitSlop={6} style={{ padding: kioskPx(6, s) }}>
            <Trash2 size={kioskPx(20, s)} color="#EF4444" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function EmptyCart({
  config,
  onBack,
  muted,
}: {
  config: KioskConfig;
  onBack: () => void;
  muted: string;
}) {
  const s = useKioskUiScale();
  return (
    <View className="flex-1 items-center justify-center px-10" style={{ gap: kioskPx(18, s) }}>
      <ShoppingCart size={kioskPx(72, s)} color={`${config.textColor}30`} />
      <Text style={{ fontSize: kioskPx(22, s), fontWeight: "700", color: config.textColor }}>
        Your cart is empty
      </Text>
      <Text style={{ fontSize: kioskPx(16, s), color: muted, textAlign: "center" }}>
        Add some items from the menu to get started.
      </Text>
      <Pressable
        onPress={onBack}
        style={{
          marginTop: kioskPx(6, s),
          paddingHorizontal: kioskPx(28, s),
          paddingVertical: kioskPx(14, s),
          borderRadius: kioskPx(16, s),
          backgroundColor: config.primaryColor,
        }}
      >
        <Text style={{ color: "#FFFFFF", fontSize: kioskPx(16, s), fontWeight: "700" }}>
          Browse Menu
        </Text>
      </Pressable>
    </View>
  );
}

function SummaryRow({
  label,
  value,
  muted,
  color,
  emphasize,
}: {
  label: string;
  value: number;
  muted: string;
  color: string;
  emphasize?: boolean;
}) {
  const s = useKioskUiScale();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <Text style={{ fontSize: kioskPx(emphasize ? 18 : 15, s), color: emphasize ? color : muted, fontWeight: emphasize ? "800" : "400" }}>
        {label}
      </Text>
      <Text style={{ fontSize: kioskPx(emphasize ? 22 : 15, s), fontWeight: emphasize ? "800" : "600", color }}>
        ${value.toFixed(2)}
      </Text>
    </View>
  );
}
