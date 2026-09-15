import type { MenuChannel } from "@/types/menu";

type ChannelAwareItem = {
  availableChannels?: readonly string[] | null;
};

/**
 * Is this item sold on this channel?
 *
 * The item-level counterpart to `isMenuVisibleOnChannel`. The dashboard writes
 * `menu_items.available_channels` (L1) and `location_item_overrides
 * .available_channels` (L2); the server resolves the two into one
 * `effective_available_channels` array and the menu store maps it onto
 * `availableChannels`.
 *
 * FAILS OPEN, in two distinct cases, and both matter:
 *
 *  - **No array at all** (null, undefined, or some non-array the column picked
 *    up). An item that predates the column, or a snapshot cached by an older
 *    build, carries no channel data — and refusing to sell a real item because
 *    of a data gap is far worse than showing one that should have been hidden.
 *    Matches `isMenuVisibleOnChannel`, which treats a missing menu-level flag
 *    the same way.
 *
 *  - **An EMPTY array.** An item sold on literally no channel cannot be ordered
 *    anywhere and cannot be seen anywhere, so nobody can find it to fix it; it
 *    is far more likely a write that dropped its values than a deliberate
 *    "sold nowhere". The dashboard already renders this state as the warning
 *    "No sales channels enabled" rather than as a normal configuration.
 *
 * A NON-EMPTY array is taken literally: it is the only shape that can only have
 * come from someone ticking boxes.
 */
export const isItemOnChannel = (
  item: ChannelAwareItem,
  channel: MenuChannel,
): boolean => {
  const channels = item.availableChannels;
  if (!Array.isArray(channels) || channels.length === 0) return true;
  return channels.includes(channel);
};
