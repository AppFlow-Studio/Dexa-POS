import {
  channelForStationType,
  resolveStationMenuScope,
  selectVisibleMenus,
  type StationMenuChannel,
} from "@/lib/menu/stationMenuScope";
import type { Menu } from "@/lib/types";
import { useMenuStore } from "@/stores/useMenuStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useMemo } from "react";

/**
 * The channel flag this device reads: `kiosk` on a self_service station,
 * `pos` everywhere else.
 */
export function useStationMenuChannel(): StationMenuChannel {
  const stationType = useStoreSettingsStore(
    (s) => s.selectedStation?.station_type ?? null,
  );
  return channelForStationType(stationType);
}

/**
 * The menus THIS station renders — the shared selector every order-entry
 * surface reads instead of `useMenuStore(s => s.menus)`.
 *
 * Applies the per-location channel toggle and the per-station scope from the
 * bootstrap envelope (`station_menu_scopes`, keyed by station id). Schedules,
 * 86 state and the device-local hidden-menu list stay with their existing
 * owners and are applied downstream, exactly as before.
 *
 * One selector, not one filter per screen: the rail, popup navigation, item
 * search and the kiosk templates cannot disagree about what is on this
 * station's menu.
 */
export function useVisibleMenus(): Menu[] {
  const menus = useMenuStore((s) => s.menus);
  const scopes = useMenuStore((s) => s.stationMenuScopes);
  const stationId = useStoreSettingsStore(
    (s) => s.selectedStation?.id ?? null,
  );
  const channel = useStationMenuChannel();

  return useMemo(
    () => selectVisibleMenus(menus, scopes, stationId, channel),
    [menus, scopes, stationId, channel],
  );
}

/**
 * True when this station is scoped to a selection that leaves nothing to
 * render — no menus assigned, or every assigned menu switched off for this
 * channel. Drives the "No menus assigned to this station" empty state, which
 * must never fall back to the full menu.
 */
export function useIsStationMenuScopeEmpty(): boolean {
  const scopes = useMenuStore((s) => s.stationMenuScopes);
  const stationId = useStoreSettingsStore(
    (s) => s.selectedStation?.id ?? null,
  );
  const visible = useVisibleMenus();

  return (
    resolveStationMenuScope(scopes, stationId).scope === "selected" &&
    visible.length === 0
  );
}
