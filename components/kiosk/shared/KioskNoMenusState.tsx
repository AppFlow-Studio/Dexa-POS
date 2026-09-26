import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import {
  kioskFont,
  useKioskTheme,
} from "@/components/kiosk/shared/kioskDesign";
import { useKioskUiScale } from "@/lib/uiScale";
import type { KioskConfig } from "@/types/kiosk";
import { Text, View } from "react-native";

const COPY = {
  scope: {
    title: "No menus assigned to this station",
    body: "Please ask a staff member for help.",
  },
  schedule: {
    title: "Ordering isn't available right now",
    body: "Please check back later.",
  },
} as const;

/**
 * Rendered by every kiosk template when there is nothing to order:
 *
 * - `scope` — this station is scoped to a menu selection that leaves nothing
 *   to show (see `useIsStationMenuScopeEmpty`). Fails closed on purpose: a
 *   kiosk whose only selected menu was deleted must land here, not on the
 *   full menu. The fix lives in the dashboard, so it points them at staff.
 * - `schedule` — every menu/category on this station is outside its
 *   scheduled hours right now (see `useKioskScheduledMenus`).
 *
 * Copy is for the customer standing at the kiosk.
 *
 * Sized through `kioskPx`, never raw px: a component that opts out of the
 * kiosk scale is the smallest thing on a screen a customer has seconds to read.
 */
export function KioskNoMenusState({
  config,
  reason = "scope",
}: {
  config: KioskConfig;
  reason?: keyof typeof COPY;
}) {
  const s = useKioskUiScale();
  const t = useKioskTheme(config);
  const copy = COPY[reason];

  return (
    <View
      testID="kiosk-no-menus-state"
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: kioskPx(40, s),
        backgroundColor: t.page,
      }}
    >
      <Text
        style={{
          color: t.text,
          fontSize: kioskPx(28, s),
          ...kioskFont(t, "bold"),
          textAlign: "center",
        }}
      >
        {copy.title}
      </Text>
      <Text
        style={{
          color: t.text,
          opacity: 0.7,
          fontSize: kioskPx(18, s),
          marginTop: kioskPx(12, s),
          textAlign: "center",
        }}
      >
        {copy.body}
      </Text>
    </View>
  );
}
