export type PosOrderEntryMenuVisibility = {
  id: string;
  isActive: boolean;
  channelVisibility?: {
    pos?: boolean;
  };
};

export const filterPosOrderEntryMenus = <
  T extends PosOrderEntryMenuVisibility,
>(
  menus: readonly T[],
  hiddenMenuIds: readonly string[],
): T[] => {
  const hiddenIds = new Set(hiddenMenuIds);

  return menus.filter(
    (menu) =>
      menu.isActive &&
      menu.channelVisibility?.pos !== false &&
      !hiddenIds.has(menu.id),
  );
};
