import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import { useKioskUiScale } from "@/lib/uiScale";
import type { KioskConfig } from "@/types/kiosk";
import { Text, View } from "react-native";

/**
 * Rendered by every kiosk template when this station is scoped to a menu
 * selection that leaves nothing to show (see `useIsStationMenuScopeEmpty`).
 *
 * Fails closed on purpose: a kiosk whose only selected menu was deleted must
 * land here, not on the full menu. Copy is for the customer standing at the
 * kiosk — the fix lives in the dashboard, so it points them at staff.
 *
 * Sized through `kioskPx`, never raw px: a component that opts out of the
 * kiosk scale is the smallest thing on a screen a customer has seconds to read.
 */
export function KioskNoMenusState({ config }: { config: KioskConfig }) {
  const s = useKioskUiScale();

  return (
    <View
      testID="kiosk-no-menus-state"
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: kioskPx(40, s),
        backgroundColor: config.backgroundColor,
      }}
    >
      <Text
        style={{
          color: config.textColor,
          fontSize: kioskPx(28, s),
          fontWeight: "700",
          textAlign: "center",
        }}
      >
        No menus assigned to this station
      </Text>
      <Text
        style={{
          color: config.textColor,
          opacity: 0.7,
          fontSize: kioskPx(18, s),
          marginTop: kioskPx(12, s),
          textAlign: "center",
        }}
      >
        Please ask a staff member for help.
      </Text>
    </View>
  );
}
