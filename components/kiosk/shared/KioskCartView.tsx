import { resolveMenuItemFallbackIconKey } from "@/components/kiosk/shared/menuItemFallbackIcon";
import { resolveMenuItemImageSource } from "@/lib/menuItemImageSource";
import { getMenuItemPlaceholderIcon } from "@/lib/menuItemPlaceholderIcon";
import type { MenuItemType } from "@/lib/types";
import {
  lineTotal,
  useKioskCartStore,
  type KioskCartLine,
} from "@/stores/useKioskCartStore";
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
  const lines = useKioskCartStore((s) => s.lines);
  const subtotal = useKioskCartStore((s) => s.subtotal());
  const incQuantity = useKioskCartStore((s) => s.incQuantity);
  const decQuantity = useKioskCartStore((s) => s.decQuantity);
  const removeLine = useKioskCartStore((s) => s.removeLine);

  const muted = `${config.textColor}99`;
  const faint = `${config.textColor}12`;

  return (
    <View className="flex-1" style={{ backgroundColor: config.backgroundColor }}>
      {/* Header row */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingHorizontal: 24,
          paddingVertical: 18,
        }}
      >
        <Pressable onPress={onBack} hitSlop={8}>
          <ChevronLeft size={28} color={config.textColor} />
        </Pressable>
        <Text
          style={{ fontSize: 26, fontWeight: "800", color: config.textColor }}
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
              paddingHorizontal: 24,
              paddingBottom: 24,
              gap: 14,
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
              paddingHorizontal: 24,
              paddingTop: 16,
              paddingBottom: 22,
              borderTopWidth: 1,
              borderTopColor: faint,
              backgroundColor: config.backgroundColor,
              shadowColor: "#000",
              shadowOpacity: 0.08,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: -4 },
              elevation: 12,
              gap: 14,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 18, color: muted }}>Subtotal</Text>
              <Text
                style={{
                  fontSize: 24,
                  fontWeight: "800",
                  color: config.textColor,
                }}
              >
                ${subtotal.toFixed(2)}
              </Text>
            </View>

            <Pressable
              onPress={onCheckout}
              style={{
                height: 60,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: config.primaryColor,
              }}
            >
              <Text
                style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "800" }}
              >
                Checkout · ${subtotal.toFixed(2)}
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
        gap: 14,
        padding: 14,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: faint,
        backgroundColor: config.backgroundColor,
      }}
    >
      {/* Thumb */}
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 14,
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
          <PlaceholderIcon color={`${config.textColor}40`} size={28} />
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
              gap: 8,
            }}
          >
            <Text
              style={{
                flex: 1,
                fontSize: 17,
                fontWeight: "700",
                color: config.textColor,
              }}
              numberOfLines={2}
            >
              {line.name}
            </Text>
            <Text
              style={{
                fontSize: 17,
                fontWeight: "800",
                color: config.textColor,
              }}
            >
              ${lineTotal(line).toFixed(2)}
            </Text>
          </View>
          {modifierText ? (
            <Text
              style={{ fontSize: 14, color: muted, marginTop: 4 }}
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
            marginTop: 10,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 16,
              paddingHorizontal: 14,
              paddingVertical: 7,
              borderRadius: 999,
              borderWidth: 1.5,
              borderColor: faint,
            }}
          >
            <Pressable onPress={onDec} hitSlop={6}>
              <Minus size={18} color={config.textColor} />
            </Pressable>
            <Text
              style={{
                fontSize: 16,
                fontWeight: "700",
                color: config.textColor,
                minWidth: 18,
                textAlign: "center",
              }}
            >
              {line.quantity}
            </Text>
            <Pressable onPress={onInc} hitSlop={6}>
              <Plus size={18} color={config.textColor} />
            </Pressable>
          </View>

          <Pressable onPress={onRemove} hitSlop={6} style={{ padding: 6 }}>
            <Trash2 size={20} color="#EF4444" />
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
  return (
    <View className="flex-1 items-center justify-center px-10" style={{ gap: 18 }}>
      <ShoppingCart size={72} color={`${config.textColor}30`} />
      <Text style={{ fontSize: 22, fontWeight: "700", color: config.textColor }}>
        Your cart is empty
      </Text>
      <Text style={{ fontSize: 16, color: muted, textAlign: "center" }}>
        Add some items from the menu to get started.
      </Text>
      <Pressable
        onPress={onBack}
        style={{
          marginTop: 6,
          paddingHorizontal: 28,
          paddingVertical: 14,
          borderRadius: 16,
          backgroundColor: config.primaryColor,
        }}
      >
        <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "700" }}>
          Browse Menu
        </Text>
      </Pressable>
    </View>
  );
}
