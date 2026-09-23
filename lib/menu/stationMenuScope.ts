import { stationKind } from "@/lib/db/policy";
import { isMenuVisibleOnChannel } from "@/lib/menu/menuChannelVisibility";
import type {
  MenuChannel,
  StationMenuScope,
  StationMenuScopeMap,
} from "@/types/menu";

/**
 * Per-station menu scope — the ONE place that decides which menus a station
 * renders. The POS menu rail, POS item search, all three kiosk templates and
 * kiosk search go through `selectVisibleMenus` (via `useVisibleMenus`), so the
 * rule cannot drift between screens.
 *
 * The rule, applied on top of the existing per-location channel toggle:
 *
 *   visible(menu) = channelFlag(menu, station channel)
 *                   AND (scope = 'all' OR menu ∈ station_menus)
 *
 * The channel toggle always wins: a menu switched off for kiosks in the
 * dashboard does not render on a kiosk even when that kiosk explicitly selects
 * it. The portal shows an inline warning for exactly that configuration.
 *
 * FAILS CLOSED on an empty selection. `scope: 'selected'` with no menu ids
 * renders nothing — never the whole menu. If a station's only selected menu is
 * deleted, the server cascade removes the row and the station goes empty
 * rather than suddenly showing everything.
 *
 * FAILS OPEN in exactly one case: a station with no entry in the map. That is
 * what a snapshot written before `station_menu_scopes` existed looks like, and
 * an unrelated old snapshot must keep rendering. Every other gap is closed.
 */

/** The two channels a station can render a menu on. KDS has no menu rail. */
export type StationMenuChannel = Extract<MenuChannel, "pos" | "kiosk">;

type ScopedMenu = {
  id: string;
  channelVisibility?: Partial<Record<MenuChannel, boolean>> | null;
};

/** What a station with no entry in the map resolves to — today's behaviour. */
export const ALL_MENUS_SCOPE: Readonly<StationMenuScope> = Object.freeze({
  scope: "all" as const,
  menu_ids: [] as string[],
});

/**
 * Which channel flag a station type reads. `self_service` is the kiosk; every
 * other non-KDS type is staff POS. Mirrors `stationKind` in lib/db/policy so
 * the "what is a kiosk" question keeps a single answer.
 */
export function channelForStationType(
  stationType?: string | null,
): StationMenuChannel {
  return stationKind(stationType) === "kiosk" ? "kiosk" : "pos";
}

/**
 * The scope for one station, normalized. Tolerates the wire shape being
 * slightly off (a missing or non-array `menu_ids`) without ever turning a
 * `selected` scope into `all`.
 */
export function resolveStationMenuScope(
  scopes: StationMenuScopeMap | null | undefined,
  stationId: string | null | undefined,
): StationMenuScope {
  const raw = stationId ? scopes?.[stationId] : undefined;
  // The only fail-open path — see the header.
  if (!raw) return ALL_MENUS_SCOPE;
  if (raw.scope !== "selected") return ALL_MENUS_SCOPE;

  const menuIds = Array.isArray(raw.menu_ids)
    ? raw.menu_ids.filter((id): id is string => typeof id === "string")
    : [];
  return { scope: "selected", menu_ids: menuIds };
}

/**
 * The menus this station renders on this channel, in the order given.
 * Generic so the store's `Menu` and any lighter test shape both fit.
 */
export function selectVisibleMenus<T extends ScopedMenu>(
  menus: readonly T[],
  scopes: StationMenuScopeMap | null | undefined,
  stationId: string | null | undefined,
  channel: StationMenuChannel,
): T[] {
  const resolved = resolveStationMenuScope(scopes, stationId);
  const allowed = new Set(resolved.menu_ids);

  return menus.filter(
    (menu) =>
      isMenuVisibleOnChannel(menu, channel) &&
      (resolved.scope === "all" || allowed.has(menu.id)),
  );
}
