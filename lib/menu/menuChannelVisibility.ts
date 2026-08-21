import type { MenuChannel } from "@/types/menu";

type ChannelAwareMenu = {
  channelVisibility?: Partial<Record<MenuChannel, boolean>> | null;
};

/** Older snapshots have no channel metadata and must remain visible. */
export const isMenuVisibleOnChannel = (
  menu: ChannelAwareMenu,
  channel: MenuChannel,
): boolean => menu.channelVisibility?.[channel] !== false;
