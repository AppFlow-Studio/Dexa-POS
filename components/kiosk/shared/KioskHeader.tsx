import { KioskHeaderCartPill } from "@/components/kiosk/shared/KioskHeaderCartPill";
import { KioskHeaderSearchField } from "@/components/kiosk/shared/KioskHeaderSearchField";
import {
  KIOSK_HAIRLINE,
  kioskFont,
  kioskRadius,
  kioskTracking,
  useKioskTheme,
} from "@/components/kiosk/shared/kioskDesign";
import {
  KIOSK_GRID_INSET,
  KIOSK_HEADER_CONTROL_HEIGHT,
  KIOSK_HEADER_HEIGHT,
} from "@/components/kiosk/shared/kioskLayout";
import { KioskPressable } from "@/components/kiosk/shared/KioskPressable";
import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import { kioskStrings } from "@/components/kiosk/shared/kioskStrings";
import { useKioskUiScale } from "@/lib/uiScale";
import type { KioskConfig } from "@/types/kiosk";
import { Image } from "expo-image";
import { RotateCcw, Search } from "lucide-react-native";
import { Text, View } from "react-native";

/**
 * Shared kiosk header.
 *
 *   left  - Start Over, then the merchant logo beside it
 *   right - search, then the cart
 *
 * Start Over leads because it is the way out, and a way out belongs where a
 * reader's eye starts rather than tucked against the control they are trying
 * to reach. On the right the cart sits outermost, where the thumb lands, with
 * search inboard of it. Every control shares a height and a corner radius, so
 * they read as one set rather than as four separate widgets.
 *
 * It is as short as its controls allow, and it still occupies a row of its own
 * - the grid must never scroll underneath it - but every dp it gives up goes
 * to the tiles.
 *
 * The header carries search because the menu screen cannot afford a row for
 * it. A full-width search bar pushed the category rail and the grid down by
 * its whole height on every template, for a field that is empty almost all of
 * the time. Here it costs nothing until opened, and then it takes over the
 * logo's slot - see KioskHeaderSearchField.
 *
 * It sits on the page background rather than the theme primary, which is what
 * lets the cart carry the primary as its *state*: outlined while empty, filled
 * once there is something in it.
 *
 * There is deliberately no Dine In / Takeaway control: order type is asked
 * once on the order-type screen before the menu and never re-asked.
 */
export function KioskHeader({
  config,
  onStartOver,
  cart,
  search,
}: {
  config: KioskConfig;
  onStartOver: () => void;
  /** Omitted when this orientation carries the cart as a floating button. */
  cart?: {
    itemCount: number;
    subtotal: number;
    onPress: () => void;
  };
  /** Omitted on screens where searching the menu makes no sense. */
  search?: {
    expanded: boolean;
    query: string;
    onExpand: () => void;
    onChangeQuery: (value: string) => void;
    onClose: () => void;
  };
}) {
  const s = useKioskUiScale();
  const t = useKioskTheme(config);
  const searching = !!search?.expanded;
  const control = kioskPx(KIOSK_HEADER_CONTROL_HEIGHT, s);
  const radius = kioskPx(kioskRadius.md, s);

  return (
    <View
      style={{
        height: kioskPx(KIOSK_HEADER_HEIGHT, s),
        flexDirection: "row",
        alignItems: "center",
        gap: kioskPx(12, s),
        // Same inset the category strip and the item grid use, so the
        // header's first control, the first category and the first tile all
        // start on one line down the left edge.
        paddingHorizontal: kioskPx(KIOSK_GRID_INSET, s),
        backgroundColor: t.page,
        borderBottomWidth: KIOSK_HAIRLINE,
        borderBottomColor: t.outline,
      }}
    >
      <KioskPressable
        onPress={onStartOver}
        pressedScale={0.97}
        accessibilityRole="button"
        accessibilityLabel={kioskStrings.startOver}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: kioskPx(8, s),
          height: control,
          paddingLeft: kioskPx(16, s),
          paddingRight: kioskPx(20, s),
          borderRadius: radius,
          borderWidth: KIOSK_HAIRLINE,
          borderColor: t.outlineStrong,
        }}
      >
        <RotateCcw size={kioskPx(20, s)} color={t.text} strokeWidth={1.75} />
        <Text
          style={{
            fontSize: kioskPx(16, s),
            letterSpacing: kioskTracking(16),
            color: t.text,
            ...kioskFont(t, "regular"),
          }}
        >
          {kioskStrings.startOver}
        </Text>
      </KioskPressable>

      {/* The logo, or the search field once it is open. */}
      <View style={{ flex: 1, justifyContent: "center" }}>
        {searching && search ? (
          <KioskHeaderSearchField
            config={config}
            query={search.query}
            onChangeQuery={search.onChangeQuery}
            onClose={search.onClose}
          />
        ) : config.logoUrl ? (
          <Image
            source={{ uri: config.logoUrl }}
            style={{ height: kioskPx(44, s), width: kioskPx(180, s) }}
            contentFit="contain"
            contentPosition="left center"
            cachePolicy="memory-disk"
          />
        ) : (
          <Text
            numberOfLines={1}
            style={{
              color: t.text,
              fontSize: kioskPx(22, s),
              letterSpacing: kioskTracking(22),
              ...kioskFont(t, "bold"),
            }}
          >
            {config.profileName}
          </Text>
        )}
      </View>

      {search && !searching ? (
        <KioskPressable
          onPress={search.onExpand}
          pressedScale={0.96}
          accessibilityRole="search"
          accessibilityLabel={kioskStrings.searchOpen}
          style={{
            width: control,
            height: control,
            borderRadius: radius,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: KIOSK_HAIRLINE,
            borderColor: t.outlineStrong,
          }}
        >
          <Search size={kioskPx(22, s)} color={t.text} strokeWidth={1.75} />
        </KioskPressable>
      ) : null}

      {cart ? (
        <KioskHeaderCartPill
          config={config}
          itemCount={cart.itemCount}
          subtotal={cart.subtotal}
          onPress={cart.onPress}
        />
      ) : null}
    </View>
  );
}
