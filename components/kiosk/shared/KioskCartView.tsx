import { KioskPressable } from "@/components/kiosk/shared/KioskPressable";
import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import { resolveMenuItemFallbackIconKey } from "@/components/kiosk/shared/menuItemFallbackIcon";
import { resolveMenuItemImageSource } from "@/lib/menuItemImageSource";
import { getMenuItemPlaceholderIcon } from "@/lib/menuItemPlaceholderIcon";
import type { MenuItemType } from "@/lib/types";
import { useKioskUiScale } from "@/lib/uiScale";
import {
  lineTotal,
  useKioskCartStore,
  type KioskCartLine,
} from "@/stores/useKioskCartStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import type { KioskConfig } from "@/types/kiosk";
import {
  ChevronLeft,
  Minus,
  Plus,
  ShoppingCart,
  Trash2,
} from "lucide-react-native";
import {
  Image,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutRight,
  LinearTransition,
} from "react-native-reanimated";

/**
 * Shared kiosk cart review. Lists each line with its selected modifiers, a qty
 * stepper, and a remove action; shows the subtotal and a Checkout CTA.
 * Presentation only — reads/mutates useKioskCartStore directly. Theme-driven,
 * so any template can mount it via onBack / onCheckout.
 *
 * Line rows are deliberately generous: on a 32" panel the customer is reviewing
 * their order from standing distance, and the qty/remove controls need real
 * fingertip-sized targets, not the compact list density a POS operator works
 * with. Rows animate in, slide out on removal, and reflow with a layout
 * transition so quantity edits read as direct manipulation.
 *
 * **Landscape** splits into two panes the same way the tip screen does — the
 * scrolling line list on the left, the totals card and Checkout CTA pinned
 * centre-right behind a divider — and lays the lines out two-up when the list
 * pane is wide enough. A single full-width column stretched each line to 1842px
 * on a 1920px panel behind a 167px thumbnail, which is all gap and no content,
 * and a full-width totals footer wasted the height landscape has least of.
 * Portrait keeps the single column with the totals pinned at the foot.
 */

/** Landscape list-pane flex against a 1-flex summary pane (mirrors TipStep). */
const LIST_PANE_FLEX = 1.45;

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
  const itemCount = lines.reduce((n, l) => n + l.quantity, 0);

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isHorizontal = screenWidth > screenHeight;
  // Landscape splits 1.45 : 1, so the list pane is well under half the panel on
  // a small tablet. Go two-up only when each line still clears ~430px of usable
  // width — below that the thumbnail plus qty stepper plus Remove pill collide.
  // `justifyContent: space-between` + a percentage width avoids mixing a px gap
  // with percentage children, which is what makes a wrapping row overflow at
  // awkward pane widths.
  const listPaneWidth = isHorizontal
    ? screenWidth * (LIST_PANE_FLEX / (LIST_PANE_FLEX + 1)) - kioskPx(48, s)
    : screenWidth;
  const twoUp = isHorizontal && listPaneWidth / 2 >= kioskPx(430, s);
  const lineWidth = twoUp ? ("49%" as const) : undefined;

  const header = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: kioskPx(14, s),
        paddingHorizontal: kioskPx(24, s),
        paddingVertical: kioskPx(18, s),
      }}
    >
      <KioskPressable
        onPress={onBack}
        pressedScale={0.88}
        style={{
          width: kioskPx(52, s),
          height: kioskPx(52, s),
          borderRadius: kioskPx(26, s),
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: faint,
        }}
      >
        <ChevronLeft size={kioskPx(30, s)} color={config.textColor} />
      </KioskPressable>
      <Text
        style={{
          fontSize: kioskPx(30, s),
          fontWeight: "800",
          color: config.textColor,
        }}
      >
        Your Order
      </Text>
      {itemCount > 0 && (
        <Animated.Text
          layout={LinearTransition.duration(180)}
          style={{
            fontSize: kioskPx(18, s),
            fontWeight: "600",
            color: muted,
          }}
        >
          {itemCount} {itemCount === 1 ? "item" : "items"}
        </Animated.Text>
      )}
    </View>
  );

  const list = (
    <ScrollView
      style={{ flex: 1 }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: kioskPx(24, s),
        paddingBottom: kioskPx(24, s),
      }}
    >
      <View
        style={{
          flexDirection: twoUp ? "row" : "column",
          flexWrap: twoUp ? "wrap" : "nowrap",
          justifyContent: "space-between",
          rowGap: kioskPx(16, s),
        }}
      >
        {lines.map((line, index) => (
          <CartLineRow
            key={line.lineId}
            index={index}
            line={line}
            width={lineWidth}
            config={config}
            faint={faint}
            muted={muted}
            onInc={() => incQuantity(line.lineId)}
            onDec={() => decQuantity(line.lineId)}
            onRemove={() => removeLine(line.lineId)}
          />
        ))}
      </View>
    </ScrollView>
  );

  const summaryRows = (
    <>
      <SummaryRow
        label="Subtotal"
        value={subtotal}
        muted={muted}
        color={config.textColor}
      />
      {taxRatePct > 0 && (
        <SummaryRow
          label={`Tax (${taxRatePct}%)`}
          value={estTax}
          muted={muted}
          color={config.textColor}
        />
      )}
      {/* Stronger than `faint` so it still reads inside the landscape summary
          card, whose fill is `faint`. */}
      <View style={{ height: 1, backgroundColor: `${config.textColor}22` }} />
      <SummaryRow
        label="Total"
        value={estTotal}
        muted={muted}
        color={config.textColor}
        emphasize
      />
    </>
  );

  const checkoutButton = (
    <KioskPressable
      onPress={onCheckout}
      pressedScale={0.97}
      style={{
        height: kioskPx(72, s),
        borderRadius: kioskPx(20, s),
        alignItems: "center",
        justifyContent: "center",
        marginTop: kioskPx(4, s),
        backgroundColor: config.primaryColor,
        shadowColor: config.primaryColor,
        shadowOpacity: 0.35,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 6 },
        elevation: 6,
      }}
    >
      <Animated.Text
        layout={LinearTransition.duration(180)}
        style={{
          color: "#FFFFFF",
          fontSize: kioskPx(22, s),
          fontWeight: "800",
        }}
      >
        Checkout · ${estTotal.toFixed(2)}
      </Animated.Text>
    </KioskPressable>
  );

  // Empty cart owns the whole screen in either orientation — a summary pane of
  // zeroes next to a dead Checkout button reads as broken, not as a layout.
  if (lines.length === 0) {
    return (
      <View className="flex-1" style={{ backgroundColor: config.backgroundColor }}>
        {header}
        <EmptyCart config={config} onBack={onBack} muted={muted} />
      </View>
    );
  }

  // ─── Landscape: lines left, totals + Checkout right ──────────────
  if (isHorizontal) {
    return (
      <View
        className="flex-1"
        style={{ backgroundColor: config.backgroundColor }}
      >
        <View style={{ flex: 1, flexDirection: "row" }}>
          <View style={{ flex: LIST_PANE_FLEX }}>
            {header}
            {list}
          </View>

          <View
            style={{
              flex: 1,
              justifyContent: "center",
              paddingHorizontal: kioskPx(28, s),
              paddingVertical: kioskPx(24, s),
              gap: kioskPx(16, s),
              borderLeftWidth: 1,
              borderLeftColor: faint,
              backgroundColor: `${config.primaryColor}06`,
            }}
          >
            <Text
              style={{
                fontSize: kioskPx(24, s),
                fontWeight: "800",
                color: config.textColor,
              }}
            >
              Order Summary
            </Text>
            <View
              style={{
                padding: kioskPx(16, s),
                borderRadius: kioskPx(18, s),
                backgroundColor: faint,
                gap: kioskPx(10, s),
              }}
            >
              {summaryRows}
            </View>
            {checkoutButton}
          </View>
        </View>
      </View>
    );
  }

  // ─── Portrait: single column, totals pinned at the foot ──────────
  return (
    <View className="flex-1" style={{ backgroundColor: config.backgroundColor }}>
      {header}
      {list}

      <View
        style={{
          paddingHorizontal: kioskPx(24, s),
          paddingTop: kioskPx(18, s),
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
        {summaryRows}
        {checkoutButton}
      </View>
    </View>
  );
}

function CartLineRow({
  line,
  index,
  width,
  config,
  faint,
  muted,
  onInc,
  onDec,
  onRemove,
}: {
  line: KioskCartLine;
  index: number;
  /** Set in landscape to lay the lines out two-up. */
  width?: "49%";
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

  const thumb = kioskPx(104, s);
  const total = lineTotal(line);
  const unit = line.quantity > 0 ? total / line.quantity : total;

  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 8) * 35)
        .duration(280)
        .springify()
        .damping(18)}
      exiting={FadeOutRight.duration(200)}
      layout={LinearTransition.duration(220)}
      style={{
        width,
        flexDirection: "row",
        gap: kioskPx(18, s),
        padding: kioskPx(18, s),
        borderRadius: kioskPx(22, s),
        borderWidth: 1,
        borderColor: faint,
        backgroundColor: config.backgroundColor,
        shadowColor: "#000",
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 1,
      }}
    >
      {/* Thumb */}
      <View
        style={{
          width: thumb,
          height: thumb,
          borderRadius: kioskPx(18, s),
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
          <PlaceholderIcon
            color={`${config.textColor}40`}
            size={thumb * 0.42}
          />
        )}
      </View>

      {/* Details */}
      <View style={{ flex: 1, justifyContent: "space-between", gap: kioskPx(10, s) }}>
        <View>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: kioskPx(10, s),
            }}
          >
            <Text
              style={{
                flex: 1,
                fontSize: kioskPx(21, s),
                fontWeight: "700",
                lineHeight: kioskPx(27, s),
                color: config.textColor,
              }}
              numberOfLines={2}
            >
              {line.name}
            </Text>
            <Animated.Text
              layout={LinearTransition.duration(180)}
              style={{
                fontSize: kioskPx(21, s),
                fontWeight: "800",
                color: config.textColor,
              }}
            >
              ${total.toFixed(2)}
            </Animated.Text>
          </View>

          {modifierText ? (
            <Text
              style={{
                fontSize: kioskPx(16, s),
                lineHeight: kioskPx(22, s),
                color: muted,
                marginTop: kioskPx(5, s),
              }}
              numberOfLines={3}
            >
              {modifierText}
            </Text>
          ) : null}

          {line.quantity > 1 && (
            <Text
              style={{
                fontSize: kioskPx(15, s),
                color: muted,
                marginTop: kioskPx(4, s),
              }}
            >
              ${unit.toFixed(2)} each
            </Text>
          )}
        </View>

        {/* Qty + remove */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: kioskPx(8, s),
              paddingHorizontal: kioskPx(6, s),
              borderRadius: 999,
              borderWidth: 1.5,
              borderColor: faint,
            }}
          >
            <QtyButton
              scale={s}
              color={config.textColor}
              Icon={Minus}
              onPress={onDec}
            />
            <Animated.Text
              layout={LinearTransition.duration(160)}
              style={{
                fontSize: kioskPx(20, s),
                fontWeight: "800",
                color: config.textColor,
                minWidth: kioskPx(26, s),
                textAlign: "center",
              }}
            >
              {line.quantity}
            </Animated.Text>
            <QtyButton
              scale={s}
              color={config.textColor}
              Icon={Plus}
              onPress={onInc}
            />
          </View>

          <KioskPressable
            onPress={onRemove}
            pressedScale={0.85}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: kioskPx(8, s),
              paddingHorizontal: kioskPx(16, s),
              height: kioskPx(46, s),
              borderRadius: 999,
              backgroundColor: "#EF444414",
            }}
          >
            <Trash2 size={kioskPx(21, s)} color="#EF4444" />
            <Text
              style={{
                fontSize: kioskPx(16, s),
                fontWeight: "700",
                color: "#EF4444",
              }}
            >
              Remove
            </Text>
          </KioskPressable>
        </View>
      </View>
    </Animated.View>
  );
}

/** Circular +/- with a fingertip-sized hit area. */
function QtyButton({
  scale: s,
  color,
  Icon,
  onPress,
}: {
  scale: number;
  color: string;
  Icon: typeof Minus;
  onPress: () => void;
}) {
  return (
    <KioskPressable
      onPress={onPress}
      pressedScale={0.82}
      style={{
        width: kioskPx(46, s),
        height: kioskPx(46, s),
        borderRadius: kioskPx(23, s),
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon size={kioskPx(22, s)} color={color} />
    </KioskPressable>
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
    <Animated.View
      entering={FadeIn.duration(240)}
      exiting={FadeOut.duration(160)}
      className="flex-1 items-center justify-center px-10"
      style={{ gap: kioskPx(20, s) }}
    >
      <ShoppingCart size={kioskPx(84, s)} color={`${config.textColor}30`} />
      <Text
        style={{
          fontSize: kioskPx(26, s),
          fontWeight: "700",
          color: config.textColor,
        }}
      >
        Your cart is empty
      </Text>
      <Text
        style={{ fontSize: kioskPx(18, s), color: muted, textAlign: "center" }}
      >
        Add some items from the menu to get started.
      </Text>
      <KioskPressable
        onPress={onBack}
        pressedScale={0.95}
        style={{
          marginTop: kioskPx(6, s),
          paddingHorizontal: kioskPx(32, s),
          paddingVertical: kioskPx(18, s),
          borderRadius: kioskPx(18, s),
          backgroundColor: config.primaryColor,
        }}
      >
        <Text
          style={{
            color: "#FFFFFF",
            fontSize: kioskPx(19, s),
            fontWeight: "700",
          }}
        >
          Browse Menu
        </Text>
      </KioskPressable>
    </Animated.View>
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
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <Text
        style={{
          fontSize: kioskPx(emphasize ? 22 : 17, s),
          color: emphasize ? color : muted,
          fontWeight: emphasize ? "800" : "500",
        }}
      >
        {label}
      </Text>
      <Animated.Text
        layout={LinearTransition.duration(180)}
        style={{
          fontSize: kioskPx(emphasize ? 26 : 17, s),
          fontWeight: emphasize ? "800" : "600",
          color,
        }}
      >
        ${value.toFixed(2)}
      </Animated.Text>
    </View>
  );
}
