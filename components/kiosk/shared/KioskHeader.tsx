import { KioskHeaderCartPill } from "@/components/kiosk/shared/KioskHeaderCartPill";
import { KioskHeaderSearchField } from "@/components/kiosk/shared/KioskHeaderSearchField";
import {
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
 *   left  — the merchant logo, hard against the leading edge
 *   right — search, then Start Over, then the View Cart pill
 *
 * The right-hand cluster is ordered by how often it is used and how costly a
 * mis-tap is: the cart is the destination and sits outermost where the thumb
 * lands, Start Over is next to it but is a plain outline rather than a filled
 * button, and search is furthest from both.
 *
 * It is as short as its controls allow, and it still occupies a row of its
 * own — the grid must never scroll underneath it — but every dp it gives up
 * goes to the tiles.
 *
 * The header carries search because the menu screen cannot afford a row for
 * it. A full-width search bar pushed the category rail and the grid down by
 * its whole height on every template, for a field that is empty almost all of
 * the time. Here it costs nothing until it is opened, and then it takes over
 * the logo's slot — see KioskHeaderSearchField.
 *
 * It sits on the page background rather than the theme primary, which is what
 * lets the cart pill carry the primary as its *state*: outlined while the cart
 * is empty, filled once there is something in it.
 *
 * There is deliberately no Dine In / Takeaway control: order type is asked once
 * on the order-type screen before the menu and never re-asked.
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
  const searching = !!search?.expanded;

  return (
    <View
      style={{
        height: kioskPx(KIOSK_HEADER_HEIGHT, s),
        flexDirection: "row",
        alignItems: "center",
        gap: kioskPx(12, s),
        paddingHorizontal: kioskPx(18, s),
        backgroundColor: config.backgroundColor,
        borderBottomWidth: 1,
        borderBottomColor: `${config.textColor}12`,
      }}
    >
      {/* Leading slot — the logo, or the search field once it is open. */}
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
            // Height-bounded with a width ceiling; `contain` keeps the
            // merchant's aspect ratio inside that box whatever they uploaded.
            style={{ height: kioskPx(44, s), width: kioskPx(180, s) }}
            contentFit="contain"
            contentPosition="left center"
            cachePolicy="memory-disk"
          />
        ) : (
          <Text
            numberOfLines={1}
            style={{
              color: config.textColor,
              fontSize: kioskPx(22, s),
              fontWeight: "700",
            }}
          >
            {config.profileName}
          </Text>
        )}
      </View>

      {/* Trailing cluster — search, Start Over, cart. */}
      {search && !searching ? (
        <KioskPressable
          onPress={search.onExpand}
          pressedScale={0.9}
          accessibilityRole="search"
          accessibilityLabel={kioskStrings.searchOpen}
          style={{
            width: kioskPx(KIOSK_HEADER_CONTROL_HEIGHT, s),
            height: kioskPx(KIOSK_HEADER_CONTROL_HEIGHT, s),
            borderRadius: kioskPx(KIOSK_HEADER_CONTROL_HEIGHT, s) / 2,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: `${config.primaryColor}14`,
            borderWidth: 1,
            borderColor: `${config.primaryColor}26`,
          }}
        >
          <Search size={kioskPx(24, s)} color={config.primaryColor} />
        </KioskPressable>
      ) : null}

      <KioskPressable
        onPress={onStartOver}
        pressedScale={0.93}
        accessibilityRole="button"
        accessibilityLabel={kioskStrings.startOver}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: kioskPx(8, s),
          height: kioskPx(KIOSK_HEADER_CONTROL_HEIGHT, s),
          paddingHorizontal: kioskPx(18, s),
          borderRadius: 999,
          borderWidth: 1.5,
          borderColor: `${config.textColor}26`,
        }}
      >
        <RotateCcw size={kioskPx(20, s)} color={config.textColor} />
        <Text
          style={{
            fontSize: kioskPx(17, s),
            fontWeight: "600",
            color: config.textColor,
          }}
        >
          {kioskStrings.startOver}
        </Text>
      </KioskPressable>

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
