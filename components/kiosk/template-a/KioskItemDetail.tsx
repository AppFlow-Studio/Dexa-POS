import {
  isKioskHandheld,
  kioskDetailHeroHeight,
} from "@/components/kiosk/shared/kioskLayout";
import {
  kioskFont,
  kioskRadius,
  useKioskTheme,
} from "@/components/kiosk/shared/kioskDesign";
import { KioskPressable } from "@/components/kiosk/shared/KioskPressable";
import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import { resolveMenuItemFallbackIconKey } from "@/components/kiosk/shared/menuItemFallbackIcon";
import { useItemModifiers } from "@/components/kiosk/shared/useItemModifiers";
import { resolveMenuItemImageSource } from "@/lib/menuItemImageSource";
import { getMenuItemPlaceholderIcon } from "@/lib/menuItemPlaceholderIcon";
import type { MenuItemType, ModifierCategory } from "@/lib/types";
import { useKioskUiScale } from "@/lib/uiScale";
import type { KioskItemSource } from "@/stores/useKioskCartStore";
import type { KioskConfig } from "@/types/kiosk";
import { Check, ChevronLeft, Minus, Plus } from "@/lib/icons";
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
 * Landscape: side-by-side — photo + details left, modifiers right. On a phone
 * in landscape (~360dp tall) a photo and the title block cannot share one
 * fixed column, so the photo takes the left pane alone and the title scrolls
 * with the modifiers on the right.
 *
 * Every proportion is taken from the panel it is given, not from the window,
 * so the same component renders correctly full-screen and inside the centred
 * popup the menu grid's "+" opens (see KioskItemDetailModal). `panelWidth` /
 * `panelHeight` are that box; omitted, they fall back to the window.
 */
export function KioskItemDetail({
  config,
  item,
  source,
  onBack,
  onAdded,
  panelWidth,
  panelHeight,
}: {
  config: KioskConfig;
  item: MenuItemType;
  /** Menu + category the item was picked from; stamped onto the cart line. */
  source?: KioskItemSource;
  onBack: () => void;
  onAdded: () => void;
  /** Box this renders into. Defaults to the window (full-screen presentation). */
  panelWidth?: number;
  panelHeight?: number;
}) {
  const s = useKioskUiScale();
  const t = useKioskTheme(config);
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
  } = useItemModifiers(item, source);

  const handleAdd = () => {
    if (addToCart()) onAdded();
  };

  const imageSource = resolveMenuItemImageSource(item.image);
  const PlaceholderIcon = useMemo(
    () => getMenuItemPlaceholderIcon(resolveMenuItemFallbackIconKey(item)),
    [item],
  );

  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const screenWidth = panelWidth ?? windowWidth;
  const screenHeight = panelHeight ?? windowHeight;
  const isHorizontal = screenWidth > screenHeight;
  // Classified from the window, not the panel: the popup's panel is a fraction
  // of the window on a tablet and must not read as a phone because of it.
  const handheld = isKioskHandheld(windowWidth, windowHeight);
  const compactLandscape = isHorizontal && handheld;

  const muted = t.textMuted;
  const faint = t.outline;

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
  const hasRightPane = hasModifiers || compactLandscape;
  const landscapePanelWidth = hasRightPane ? screenWidth / 2 : screenWidth;
  // `null` until the box has been measured. A measured box can legitimately be
  // tiny, and treating 0 as "unmeasured" put the estimate back in its place —
  // a photo larger than the space it was measured into.
  const [photoBox, setPhotoBox] = useState<number | null>(null);
  const landscapeImageSize =
    photoBox ??
    // First-frame estimate, replaced on the next layout pass. Deliberately
    // conservative so the photo only ever grows into place, never jumps down.
    Math.round(Math.min(screenHeight * 0.32, landscapePanelWidth * 0.62));

  const handlePhotoBoxLayout = useCallback(
    (e: { nativeEvent: { layout: { width: number; height: number } } }) => {
      const { width, height } = e.nativeEvent.layout;
      const next = Math.max(0, Math.floor(Math.min(width, height)));
      setPhotoBox((prev) =>
        prev == null || Math.abs(prev - next) > 1 ? next : prev,
      );
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
        backgroundColor: t.page,
        shadowColor: "#000000",
        shadowOpacity: 0.14,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 4 },
        elevation: 4,
      }}
    >
      <ChevronLeft size={kioskPx(30, s)} color={t.text} />
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
        backgroundColor: `${t.primary}12`,
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
          color={t.textFaint}
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
        ...kioskFont(t, "bold"),
        color: t.text,
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
        ...kioskFont(t, "bold"),
        color: t.primary,
        marginTop: kioskPx(14, s),
      }}
    >
      ${item.price.toFixed(2)}
    </Text>
  );

  const descriptionText = item.description ? (
    <Text
      // Landscape is a fixed column above a sticky footer, so it must stay
      // bounded; portrait — and a landscape phone, where it sits in the
      // scrolling pane — scrolls the description and can run long.
      numberOfLines={isHorizontal && !compactLandscape ? 4 : undefined}
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
      entering={FadeInDown.duration(300)}
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
      entering={FadeInDown.duration(300)}
      style={{
        alignItems: "center",
        paddingTop: kioskPx(20, s),
        paddingBottom: kioskPx(18, s),
        paddingHorizontal: kioskPx(24, s),
        borderBottomWidth: 1,
        borderBottomColor: t.outline,
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
          .duration(300)}
        style={{
          marginTop: kioskPx(26, s),
          paddingTop: kioskPx(22, s),
          borderTopWidth: 1,
          borderTopColor: t.outline,
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
              ...kioskFont(t, "bold"),
              color: t.text,
            }}
          >
            {group.name}
          </Text>
          <Text
            style={{
              fontSize: kioskPx(15, s),
              ...kioskFont(t, unmet ? "bold" : "regular"),
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
                  borderRadius: kioskPx(kioskRadius.md, s),
                  borderWidth: 1.5,
                  borderColor: checked
                    ? t.primary
                    : unmet
                      ? "#DC262655"
                      : t.outlineStrong,
                  backgroundColor: checked
                    ? t.primary
                    : "transparent",
                }}
              >
                {checked && (
                  <Animated.View entering={FadeIn.duration(140)}>
                    <Check size={kioskPx(17, s)} color={t.onPrimary} strokeWidth={3} />
                  </Animated.View>
                )}
                <Text
                  style={{
                    fontSize: kioskPx(18, s),
                    ...kioskFont(t, checked ? "bold" : "regular"),
                    color: checked ? t.onPrimary : t.text,
                  }}
                >
                  {option.name}
                </Text>
                {option.price > 0 && (
                  <Text
                    style={{
                      fontSize: kioskPx(16, s),
                      ...kioskFont(t, "regular"),
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
        backgroundColor: t.page,
      }}
    >
      {/* Quantity stepper */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          // Tighter on a phone, where every dp here comes out of the add
          // button beside it.
          gap: kioskPx(handheld ? 8 : 18, s),
          paddingHorizontal: kioskPx(10, s),
          height: kioskPx(68, s),
          borderRadius: kioskPx(kioskRadius.md, s),
          borderWidth: 2,
          borderColor: faint,
        }}
      >
        <StepperButton
          scale={s}
          color={t.text}
          onPress={() => setQuantity((q) => Math.max(1, q - 1))}
          Icon={Minus}
        />
        <Text
          style={{
            fontSize: kioskPx(24, s),
            ...kioskFont(t, "bold"),
            color: t.text,
            minWidth: kioskPx(28, s),
            textAlign: "center",
          }}
        >
          {quantity}
        </Text>
        <StepperButton
          scale={s}
          color={t.text}
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
          paddingHorizontal: kioskPx(12, s),
          borderRadius: kioskPx(20, s),
          backgroundColor: canAdd
            ? t.primary
            : `${t.primary}40`,
        }}
      >
        <Animated.Text
          layout={LinearTransition.duration(180)}
          // One line always: the label carries the running total, and on a
          // phone it would otherwise wrap beside the stepper.
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          style={{
            color: t.onPrimary,
            fontSize: kioskPx(21, s),
            ...kioskFont(t, "bold"),
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
        style={{ backgroundColor: t.page }}
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
              backgroundColor: `${t.primary}08`,
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
            {compactLandscape ? null : titleBlock}
          </View>

          {/* Right panel — modifiers (hidden if none); on a landscape phone the
              title block scrolls here too. */}
          {hasRightPane ? (
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
                {compactLandscape ? titleBlock : null}
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
      style={{ backgroundColor: t.page }}
    >
      {/* Hero — pinned, exactly one third of the viewport */}
      <View
        style={{
          height: heroHeight,
          width: "100%",
          padding: heroInset,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: `${t.primary}08`,
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
