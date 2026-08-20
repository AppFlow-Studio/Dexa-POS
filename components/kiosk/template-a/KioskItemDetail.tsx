import { kioskDetailHeroHeight } from "@/components/kiosk/shared/kioskLayout";
import { KioskPressable } from "@/components/kiosk/shared/KioskPressable";
import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import { resolveMenuItemFallbackIconKey } from "@/components/kiosk/shared/menuItemFallbackIcon";
import { useItemModifiers } from "@/components/kiosk/shared/useItemModifiers";
import { resolveMenuItemImageSource } from "@/lib/menuItemImageSource";
import { getMenuItemPlaceholderIcon } from "@/lib/menuItemPlaceholderIcon";
import type { MenuItemType, ModifierCategory } from "@/lib/types";
import { useKioskUiScale } from "@/lib/uiScale";
import type { KioskConfig } from "@/types/kiosk";
import { Check, ChevronLeft, Minus, Plus } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
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
  LinearTransition,
} from "react-native-reanimated";

/**
 * Template A item-detail layout. All modifier logic comes from the shared
 * useItemModifiers hook — this file is presentation only. Theme-driven from
 * `config`.
 *
 * Portrait: a pinned hero band taking exactly a third of the viewport
 * (kioskDetailHeroHeight), with the name / price / modifiers scrolling
 * underneath it and a sticky add bar at the foot. Pinning rather than
 * scrolling the photo away keeps the product visible while the customer works
 * through the options, and the fixed third stops a tall panel from turning the
 * hero into a full-screen image the customer has to scroll past.
 *
 * Landscape: side-by-side — photo + details left, modifiers right.
 */
export function KioskItemDetail({
  config,
  item,
  onBack,
  onAdded,
}: {
  config: KioskConfig;
  item: MenuItemType;
  onBack: () => void;
  onAdded: () => void;
}) {
  const s = useKioskUiScale();
  const {
    groups,
    selected,
    quantity,
    setQuantity,
    toggleOption,
    missingRequired,
    canAdd,
    total,
    addToCart,
  } = useItemModifiers(item);

  const handleAdd = () => {
    if (addToCart()) onAdded();
  };

  const imageSource = resolveMenuItemImageSource(item.image);
  const PlaceholderIcon = useMemo(
    () => getMenuItemPlaceholderIcon(resolveMenuItemFallbackIconKey(item)),
    [item],
  );

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isHorizontal = screenWidth > screenHeight;

  const muted = `${config.textColor}99`;
  const faint = `${config.textColor}14`;

  const hasModifiers = groups.length > 0;

  // Portrait hero band: one third of the screen, with the photo filling it
  // inside a comfortable inset. Bounded on width too — a tall, narrow panel
  // (e.g. 800x2560) has a third of its height exceed its full width, which
  // would push the photo off both edges.
  const heroHeight = kioskDetailHeroHeight(screenHeight);
  const heroInset = kioskPx(18, s);
  const portraitImageSize = Math.min(
    heroHeight - heroInset * 2,
    screenWidth - heroInset * 2,
  );

  // Landscape photo. It shares a column with the title block above the sticky
  // footer, so its size is whatever that column has left over — which depends
  // on how far the item's name and description wrap. Rather than guess with a
  // fixed fraction (the previous cap was a multiple of the UI scale, and grew
  // straight through the panel when the scale did), the photo sits in a
  // `flex: 1` box that takes exactly the leftover space, and we inscribe the
  // largest square that fits the box we measure. Self-correcting for any panel
  // size and any length of item copy, with no magic factors to re-tune.
  const landscapePanelWidth = hasModifiers ? screenWidth / 2 : screenWidth;
  const [photoBox, setPhotoBox] = useState(0);
  const landscapeImageSize =
    photoBox > 0
      ? photoBox
      : // First-frame estimate, replaced on the next layout pass. Deliberately
        // conservative so the photo only ever grows into place, never jumps down.
        Math.round(Math.min(screenHeight * 0.32, landscapePanelWidth * 0.62));

  const handlePhotoBoxLayout = useCallback(
    (e: { nativeEvent: { layout: { width: number; height: number } } }) => {
      const { width, height } = e.nativeEvent.layout;
      const next = Math.max(0, Math.floor(Math.min(width, height)));
      setPhotoBox((prev) => (Math.abs(prev - next) > 1 ? next : prev));
    },
    [],
  );

  // ─── Shared parts ────────────────────────────────────────────────

  const backButton = (
    <KioskPressable
      onPress={onBack}
      pressedScale={0.9}
      style={{
        position: "absolute",
        top: kioskPx(20, s),
        left: kioskPx(20, s),
        zIndex: 10,
        width: kioskPx(54, s),
        height: kioskPx(54, s),
        borderRadius: kioskPx(27, s),
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: config.backgroundColor,
        shadowColor: "#000",
        shadowOpacity: 0.14,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 4,
      }}
    >
      <ChevronLeft size={kioskPx(30, s)} color={config.textColor} />
    </KioskPressable>
  );

  const renderPhoto = (size: number) => (
    <Animated.View
      entering={FadeIn.duration(260)}
      style={{
        width: size,
        height: size,
        borderRadius: kioskPx(28, s),
        overflow: "hidden",
        backgroundColor: `${config.primaryColor}12`,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
        elevation: 6,
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
          size={kioskPx(96, s)}
        />
      )}
    </Animated.View>
  );

  const nameText = (
    <Text
      // Bounded so the pinned portrait header stays a predictable height —
      // an unbounded name would eat the modifier list on a long item name.
      numberOfLines={2}
      style={{
        fontSize: kioskPx(34, s),
        fontWeight: "800",
        color: config.textColor,
        textAlign: "center",
        lineHeight: kioskPx(42, s),
      }}
    >
      {item.name}
    </Text>
  );

  const priceText = (
    <Text
      style={{
        fontSize: kioskPx(28, s),
        fontWeight: "800",
        color: config.primaryColor,
        marginTop: kioskPx(14, s),
      }}
    >
      ${item.price.toFixed(2)}
    </Text>
  );

  const descriptionText = item.description ? (
    <Text
      // Landscape is a fixed column above a sticky footer, so it must stay
      // bounded; portrait scrolls the description and can run long.
      numberOfLines={isHorizontal ? 4 : undefined}
      style={{
        fontSize: kioskPx(18, s),
        color: muted,
        marginTop: kioskPx(10, s),
        lineHeight: kioskPx(26, s),
        textAlign: "center",
      }}
    >
      {item.description}
    </Text>
  ) : null;

  // Landscape: name, description and price sit together in the left pane,
  // which never scrolls.
  const titleBlock = (
    <Animated.View
      entering={FadeInDown.duration(300).springify().damping(18)}
      style={{ paddingTop: kioskPx(24, s), alignItems: "center" }}
    >
      {nameText}
      {descriptionText}
      {priceText}
    </Animated.View>
  );

  // Portrait: name and price are pinned under the photo so the customer can
  // always see what they are configuring and what it costs, however far down
  // the modifier list they scroll. The description is read-once, so it scrolls
  // away with the groups rather than being truncated to fit a fixed header.
  const portraitPinnedTitle = (
    <Animated.View
      entering={FadeInDown.duration(300).springify().damping(18)}
      style={{
        alignItems: "center",
        paddingTop: kioskPx(20, s),
        paddingBottom: kioskPx(18, s),
        paddingHorizontal: kioskPx(24, s),
        borderBottomWidth: 1,
        borderBottomColor: `${config.textColor}0F`,
      }}
    >
      {nameText}
      {priceText}
    </Animated.View>
  );

  const renderGroup = (group: ModifierCategory, index: number) => {
    const ids = selected[group.id] ?? new Set<string>();
    const isSingle = group.selectionType === "single";
    const unmet = missingRequired.some((g) => g.id === group.id);

    return (
      <Animated.View
        key={group.id}
        entering={FadeInDown.delay(Math.min(index, 6) * 45)
          .duration(300)
          .springify()
          .damping(18)}
        style={{
          marginTop: kioskPx(26, s),
          paddingTop: kioskPx(22, s),
          borderTopWidth: 1,
          borderTopColor: `${config.textColor}0F`,
        }}
      >
        {/* Group header — plain label + subtle requirement note */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            justifyContent: "center",
            flexWrap: "wrap",
            gap: kioskPx(8, s),
            marginBottom: kioskPx(4, s),
          }}
        >
          <Text
            style={{
              fontSize: kioskPx(22, s),
              fontWeight: "700",
              color: config.textColor,
            }}
          >
            {group.name}
          </Text>
          <Text
            style={{
              fontSize: kioskPx(15, s),
              fontWeight: unmet ? "700" : "400",
              color: unmet ? "#DC2626" : muted,
            }}
          >
            {group.type === "required"
              ? unmet
                ? "Required · pick one"
                : "Required"
              : "Optional"}
            {!isSingle && group.maxSelections
              ? ` · up to ${group.maxSelections}`
              : ""}
          </Text>
        </View>

        {/* Options — wrapping selectable chips */}
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: kioskPx(12, s),
            marginTop: kioskPx(14, s),
          }}
        >
          {group.options.map((option) => {
            const checked = ids.has(option.id);
            return (
              <KioskPressable
                key={option.id}
                pressedScale={0.94}
                onPress={() => toggleOption(group, option.id)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: kioskPx(9, s),
                  paddingHorizontal: kioskPx(20, s),
                  paddingVertical: kioskPx(15, s),
                  borderRadius: 999,
                  borderWidth: 1.5,
                  borderColor: checked
                    ? config.primaryColor
                    : unmet
                      ? "#DC262655"
                      : `${config.textColor}22`,
                  backgroundColor: checked
                    ? config.primaryColor
                    : "transparent",
                }}
              >
                {checked && (
                  <Animated.View entering={FadeIn.duration(140)}>
                    <Check size={kioskPx(17, s)} color="#FFFFFF" strokeWidth={3} />
                  </Animated.View>
                )}
                <Text
                  style={{
                    fontSize: kioskPx(18, s),
                    fontWeight: checked ? "700" : "500",
                    color: checked ? "#FFFFFF" : config.textColor,
                  }}
                >
                  {option.name}
                </Text>
                {option.price > 0 && (
                  <Text
                    style={{
                      fontSize: kioskPx(16, s),
                      fontWeight: "600",
                      color: checked ? "rgba(255,255,255,0.85)" : muted,
                    }}
                  >
                    +${option.price.toFixed(2)}
                  </Text>
                )}
              </KioskPressable>
            );
          })}
        </View>
      </Animated.View>
    );
  };

  const modifierGroups = groups.map(renderGroup);

  // ─── Shared footer ───────────────────────────────────────────────

  const footer = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: kioskPx(16, s),
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
      }}
    >
      {/* Quantity stepper */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: kioskPx(18, s),
          paddingHorizontal: kioskPx(10, s),
          height: kioskPx(68, s),
          borderRadius: 999,
          borderWidth: 2,
          borderColor: faint,
        }}
      >
        <StepperButton
          scale={s}
          color={config.textColor}
          onPress={() => setQuantity((q) => Math.max(1, q - 1))}
          Icon={Minus}
        />
        <Text
          style={{
            fontSize: kioskPx(24, s),
            fontWeight: "800",
            color: config.textColor,
            minWidth: kioskPx(28, s),
            textAlign: "center",
          }}
        >
          {quantity}
        </Text>
        <StepperButton
          scale={s}
          color={config.textColor}
          onPress={() => setQuantity((q) => q + 1)}
          Icon={Plus}
        />
      </View>

      {/* Add to cart */}
      <KioskPressable
        disabled={!canAdd}
        pressedScale={0.97}
        onPress={handleAdd}
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          height: kioskPx(68, s),
          borderRadius: kioskPx(20, s),
          backgroundColor: canAdd
            ? config.primaryColor
            : `${config.primaryColor}40`,
        }}
      >
        <Animated.Text
          layout={LinearTransition.duration(180)}
          style={{
            color: "#FFFFFF",
            fontSize: kioskPx(21, s),
            fontWeight: "800",
          }}
        >
          {canAdd
            ? `Add to Cart · $${total.toFixed(2)}`
            : `Select ${missingRequired[0]?.name ?? "options"}`}
        </Animated.Text>
      </KioskPressable>
    </View>
  );

  // ─── Horizontal layout ───────────────────────────────────────────

  if (isHorizontal) {
    return (
      <View
        className="flex-1"
        style={{ backgroundColor: config.backgroundColor }}
      >
        <View style={{ flex: 1, flexDirection: "row" }}>
          {/* Left panel — image + item details */}
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              padding: kioskPx(24, s),
              gap: kioskPx(24, s),
              backgroundColor: `${config.primaryColor}08`,
            }}
          >
            {backButton}
            {/* flex: 1 — takes exactly what the title block leaves, so the
                square inscribed in it can never overflow the panel. */}
            <View
              style={{
                flex: 1,
                width: "100%",
                alignItems: "center",
                justifyContent: "center",
              }}
              onLayout={handlePhotoBoxLayout}
            >
              {renderPhoto(landscapeImageSize)}
            </View>
            {titleBlock}
          </View>

          {/* Right panel — modifiers only (hidden if none) */}
          {hasModifiers ? (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                paddingBottom: kioskPx(32, s),
                paddingHorizontal: kioskPx(24, s),
                flexGrow: 1,
              }}
              style={{ flex: 1 }}
            >
              <View style={{ width: "100%", maxWidth: kioskPx(720, s) }}>
                {modifierGroups}
              </View>
            </ScrollView>
          ) : null}
        </View>

        {footer}
      </View>
    );
  }

  // ─── Vertical (portrait) layout ──────────────────────────────────

  return (
    <View
      className="flex-1"
      style={{ backgroundColor: config.backgroundColor }}
    >
      {/* Hero — pinned, exactly one third of the viewport */}
      <View
        style={{
          height: heroHeight,
          width: "100%",
          padding: heroInset,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: `${config.primaryColor}08`,
        }}
      >
        {backButton}
        {renderPhoto(portraitImageSize)}
      </View>

      {portraitPinnedTitle}

      {/* Only the description and modifier groups scroll */}
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: kioskPx(4, s),
          paddingBottom: kioskPx(32, s),
          alignItems: "center",
        }}
      >
        <View
          style={{
            width: "100%",
            maxWidth: kioskPx(760, s),
            paddingHorizontal: kioskPx(24, s),
          }}
        >
          {descriptionText}
          {modifierGroups}
        </View>
      </ScrollView>

      {footer}
    </View>
  );
}

/**
 * Quantity +/- control. A padded circular hit area rather than a bare icon —
 * a customer standing at a kiosk taps with a fingertip at arm's length, so the
 * icon glyph alone is nowhere near a comfortable target.
 */
function StepperButton({
  scale: s,
  color,
  onPress,
  Icon,
}: {
  scale: number;
  color: string;
  onPress: () => void;
  Icon: typeof Minus;
}) {
  return (
    <KioskPressable
      onPress={onPress}
      pressedScale={0.85}
      style={{
        width: kioskPx(48, s),
        height: kioskPx(48, s),
        borderRadius: kioskPx(24, s),
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon size={kioskPx(26, s)} color={color} />
    </KioskPressable>
  );
}
