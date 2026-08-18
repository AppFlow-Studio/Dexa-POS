export const MENU_SYNC_CHANNELS = ["pos", "kiosk"] as const;

export type MenuSyncChannel = (typeof MENU_SYNC_CHANNELS)[number];

/** Map station conventions to the menu surface the station is allowed to see. */
export function resolveMenuSyncChannel(
  stationType: string | null | undefined,
): MenuSyncChannel {
  return stationType === "self_service" || stationType === "kiosk"
    ? "kiosk"
    : "pos";
}
