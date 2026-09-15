import { isMenuVisibleOnChannel } from "@/lib/menu/menuChannelVisibility";
import type { MenuChannel } from "@/types/menu";

export type MenuStatusKey =
  | "inactive"
  | "off-schedule"
  | "channel-pos"
  | "channel-kiosk"
  | "hidden-here";

export interface MenuStatusChip {
  key: MenuStatusKey;
  label: string;
  /**
   * Does this stop staff ringing the menu up on THIS device right now?
   *
   * The distinction is the whole point of the chip row. "Off on Kiosk" is real
   * configuration worth seeing, but it explains nothing about why a menu is
   * missing from the POS grid in front of you — rendering it in the same alarm
   * colour as "Inactive" would send a manager hunting for a problem that isn't
   * there.
   */
  blocking: boolean;
}

type StatusAwareMenu = {
  isActive: boolean;
  channelVisibility?: Partial<Record<MenuChannel, boolean>> | null;
};

/**
 * Every reason this menu is not simply "Available" on the POS, in the order a
 * manager would want to read them.
 *
 * Order entry filters on three separate things — `isActive`, the POS channel
 * flag, and the device-local hidden list (see `filterPosOrderEntryMenus`) —
 * plus the schedule. Before this, the row badge reported only the first and the
 * last, so a menu switched off for POS in the dashboard sat there showing a
 * green "Available" while being absent from the grid, with nothing on screen to
 * explain it.
 *
 * An empty result means the menu really is orderable here and now; the caller
 * renders the single "Available" chip for that case.
 */
export function getMenuStatusChips(
  menu: StatusAwareMenu,
  {
    isAvailableNow,
    isHiddenOnDevice,
  }: { isAvailableNow: boolean; isHiddenOnDevice: boolean },
): MenuStatusChip[] {
  const chips: MenuStatusChip[] = [];

  if (!menu.isActive) {
    chips.push({ key: "inactive", label: "Inactive", blocking: true });
  } else if (!isAvailableNow) {
    // Only meaningful while the menu is active — an inactive menu is off its
    // schedule too, and saying both just buries the one that matters.
    chips.push({ key: "off-schedule", label: "Off schedule", blocking: true });
  }

  if (!isMenuVisibleOnChannel(menu, "pos")) {
    chips.push({ key: "channel-pos", label: "Off on POS", blocking: true });
  }

  if (!isMenuVisibleOnChannel(menu, "kiosk")) {
    // Informational: the kiosk is a different surface, so this never explains a
    // gap in the POS grid.
    chips.push({ key: "channel-kiosk", label: "Off on Kiosk", blocking: false });
  }

  if (isHiddenOnDevice) {
    chips.push({
      key: "hidden-here",
      // "here" is load-bearing, and short on purpose: this is the device's own
      // setting (useMenuVisibilityStore, persisted locally) rather than
      // anything the dashboard did, so staff know they can undo it right here.
      // The row it renders in is pinned to a fixed height for drag maths, so
      // the label has to stay narrow enough never to wrap.
      label: "Hidden here",
      blocking: true,
    });
  }

  return chips;
}
