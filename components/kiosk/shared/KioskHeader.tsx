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
import { Search, X } from "lucide-react-native";
import { Text, View } from "react-native";

/**
 * Shared kiosk header.
 *
 *   left  - Start Over (an X), then the merchant logo beside it
 *   right - search, then the cart
 *
 * While search is open the row is the field and the cart alone: the logo gives
 * up its slot to the field and Start Over steps out entirely, so the header
 * never carries two X's that mean different things.
 *
 * Start Over leads because it is the way out, and a way out belongs where a
 * reader's eye starts rather than tucked against the control they are trying
 * to reach. It is a bare X: the universal glyph for "leave this", and the same
 * square as the search control opposite, so the two bookend the header as a
 * pair. On the right the cart sits outermost, where the thumb lands, with
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
      {/* Start Over stands down while search is open. Its glyph is an X, and
          so is the one that closes the field: two X's in one header, a thumb's
          width apart, where one abandons the whole order and the other only
          puts the search away. Removing it is the version with no wrong tap in
          it — the customer closes search first, and Start Over is waiting
          where it always was. It also hands the field the full width of the
          row. */}
      {!searching ? (
        <KioskPressable
          onPress={onStartOver}
          pressedScale={0.97}
          accessibilityRole="button"
          accessibilityLabel={kioskStrings.startOver}
          // A square the same size as the search control on the other side, so
          // the header's two icon buttons bookend it as a matched pair. The
          // label lives on in `accessibilityLabel`.
          style={{
            width: control,
            height: control,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: radius,
            borderWidth: KIOSK_HAIRLINE,
            borderColor: t.outlineStrong,
          }}
        >
          <X size={kioskPx(22, s)} color={t.text} strokeWidth={1.75} />
        </KioskPressable>
      ) : null}

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
