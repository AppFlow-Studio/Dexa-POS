import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import { resolveMenuItemFallbackIconKey } from "@/components/kiosk/shared/menuItemFallbackIcon";
import { useItemModifiers } from "@/components/kiosk/shared/useItemModifiers";
import { useKioskUiScale } from "@/lib/uiScale";
import { resolveMenuItemImageSource } from "@/lib/menuItemImageSource";
import { getMenuItemPlaceholderIcon } from "@/lib/menuItemPlaceholderIcon";
import type { MenuItemType } from "@/lib/types";
import type { KioskConfig } from "@/types/kiosk";
import { ChevronLeft, Minus, Plus } from "lucide-react-native";
import { useMemo } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

/**
 * Template A item-detail layout. All modifier logic comes from the shared
 * useItemModifiers hook — this file is presentation only. Theme-driven from
 * `config`. Full-screen: scrollable hero + modifiers, sticky add bar.
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

  // ─── Shared parts ────────────────────────────────────────────────

  const imageBlock = (
    <>
      {/* Floating back button */}
      <Pressable
        onPress={onBack}
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
          backgroundColor: config.backgroundColor,
          shadowColor: "#000",
          shadowOpacity: 0.12,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
          elevation: 4,
        }}
      >
        <ChevronLeft size={kioskPx(26, s)} color={config.textColor} />
      </Pressable>

      <View
        style={{
          width: isHorizontal ? "100%" : kioskPx(280, s),
          height: isHorizontal ? "100%" : kioskPx(280, s),
          maxWidth: kioskPx(400, s),
          maxHeight: kioskPx(400, s),
          aspectRatio: 1,
          borderRadius: kioskPx(28, s),
          overflow: "hidden",
          backgroundColor: `${config.primaryColor}12`,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#000",
          shadowOpacity: 0.1,
          shadowRadius: 16,
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
          <PlaceholderIcon color={`${config.textColor}40`} size={kioskPx(88, s)} />
        )}
      </View>
    </>
  );

  const titleBlock = (
    <View style={{ paddingTop: kioskPx(24, s), alignItems: "center" }}>
      <Text
        style={{
          fontSize: kioskPx(30, s),
          fontWeight: "800",
          color: config.textColor,
          textAlign: "center",
        }}
      >
        {item.name}
      </Text>
      {item.description ? (
        <Text
          style={{
            fontSize: kioskPx(16, s),
            color: muted,
            marginTop: kioskPx(10, s),
            lineHeight: kioskPx(23, s),
            textAlign: "center",
          }}
        >
          {item.description}
        </Text>
      ) : null}
      <Text
        style={{
          fontSize: kioskPx(24, s),
          fontWeight: "800",
          color: config.primaryColor,
          marginTop: kioskPx(14, s),
        }}
      >
        ${item.price.toFixed(2)}
      </Text>
    </View>
  );

  const modifierGroups = groups.map((group) => {
    const ids = selected[group.id] ?? new Set<string>();
    const isSingle = group.selectionType === "single";
    return (
      <View
        key={group.id}
        style={{
          marginTop: kioskPx(24, s),
          paddingTop: kioskPx(20, s),
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
            gap: kioskPx(8, s),
            marginBottom: kioskPx(4, s),
          }}
        >
          <Text
            style={{
              fontSize: kioskPx(19, s),
              fontWeight: "700",
              color: config.textColor,
            }}
          >
            {group.name}
          </Text>
          <Text style={{ fontSize: kioskPx(13, s), color: muted }}>
            {group.type === "required" ? "Required" : "Optional"}
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
            gap: kioskPx(10, s),
            marginTop: kioskPx(12, s),
          }}
        >
          {group.options.map((option) => {
            const checked = ids.has(option.id);
            const disabled = option.isAvailable === false;
            return (
              <Pressable
                key={option.id}
                disabled={disabled}
                onPress={() => toggleOption(group, option.id)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: kioskPx(8, s),
                  paddingHorizontal: kioskPx(18, s),
                  paddingVertical: kioskPx(13, s),
                  borderRadius: 999,
                  borderWidth: 1.5,
                  borderColor: checked
                    ? config.primaryColor
                    : `${config.textColor}22`,
                  backgroundColor: checked
                    ? config.primaryColor
                    : "transparent",
                  opacity: disabled ? 0.4 : 1,
                }}
              >
                <Text
                  style={{
                    fontSize: kioskPx(16, s),
                    fontWeight: checked ? "700" : "500",
                    color: checked ? "#FFFFFF" : config.textColor,
                  }}
                >
                  {option.name}
                </Text>
                {option.price > 0 && (
                  <Text
                    style={{
                      fontSize: kioskPx(14, s),
                      fontWeight: "600",
                      color: checked ? "#FFFFFF" : muted,
                    }}
                  >
                    +${option.price.toFixed(2)}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  });

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
          gap: kioskPx(20, s),
          paddingHorizontal: kioskPx(18, s),
          height: kioskPx(60, s),
          borderRadius: 999,
          borderWidth: 2,
          borderColor: faint,
        }}
      >
        <Pressable
          onPress={() => setQuantity((q) => Math.max(1, q - 1))}
          hitSlop={8}
        >
          <Minus size={kioskPx(24, s)} color={config.textColor} />
        </Pressable>
        <Text
          style={{
            fontSize: kioskPx(20, s),
            fontWeight: "800",
            color: config.textColor,
            minWidth: kioskPx(24, s),
            textAlign: "center",
          }}
        >
          {quantity}
        </Text>
        <Pressable onPress={() => setQuantity((q) => q + 1)} hitSlop={8}>
          <Plus size={kioskPx(24, s)} color={config.textColor} />
        </Pressable>
      </View>

      {/* Add to cart */}
      <Pressable
        disabled={!canAdd}
        onPress={handleAdd}
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          height: kioskPx(60, s),
          borderRadius: kioskPx(18, s),
          backgroundColor: canAdd
            ? config.primaryColor
            : `${config.primaryColor}40`,
        }}
      >
        <Text style={{ color: "#FFFFFF", fontSize: kioskPx(18, s), fontWeight: "800" }}>
          {canAdd
            ? `Add to Cart · $${total.toFixed(2)}`
            : `Select ${missingRequired[0]?.name ?? "options"}`}
        </Text>
      </Pressable>
    </View>
  );

  // ─── Horizontal layout ───────────────────────────────────────────

  if (isHorizontal) {
    const hasModifiers = groups.length > 0;

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
            {imageBlock}
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
              <View style={{ width: "100%", maxWidth: kioskPx(640, s) }}>
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
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: kioskPx(32, s), alignItems: "center" }}
      >
        {/* Hero — contained, rounded, with soft tinted backdrop */}
        <View
          style={{
            width: "100%",
            paddingTop: kioskPx(20, s),
            paddingHorizontal: kioskPx(20, s),
            alignItems: "center",
            backgroundColor: `${config.primaryColor}08`,
            paddingBottom: kioskPx(28, s),
          }}
        >
          {imageBlock}
        </View>

        {/* Content column */}
        <View style={{ width: "100%", maxWidth: kioskPx(640, s), paddingHorizontal: kioskPx(24, s) }}>
          {titleBlock}
          {modifierGroups}
        </View>
      </ScrollView>

      {footer}
    </View>
  );
}
