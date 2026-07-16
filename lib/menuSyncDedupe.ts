interface SyncCategoryItemLike {
  id?: string | null;
  display_order?: number | null;
  menu_item?: {
    id?: string | null;
    name?: string | null;
  } | null;
}

interface DedupeContext {
  categoryId?: string | null;
  categoryName?: string | null;
  menuId?: string | null;
  menuName?: string | null;
}

function getMenuItemIdentity(entry: SyncCategoryItemLike): string | null {
  return entry.menu_item?.id ?? entry.id ?? null;
}

function getMenuItemName(entry: SyncCategoryItemLike): string {
  return entry.menu_item?.name ?? "";
}

export function sortSyncCategoryItems<T extends SyncCategoryItemLike>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    const aOrder = a.display_order ?? 999999;
    const bOrder = b.display_order ?? 999999;
    const orderDiff = aOrder - bOrder;
    if (orderDiff !== 0) return orderDiff;
    return getMenuItemName(a).localeCompare(getMenuItemName(b));
  });
}

export function dedupeSyncCategoryItems<T extends SyncCategoryItemLike>(
  items: T[],
  context: DedupeContext = {},
): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];
  const duplicates: string[] = [];

  for (const item of items) {
    const identity = getMenuItemIdentity(item);
    if (!identity) {
      deduped.push(item);
      continue;
    }

    if (seen.has(identity)) {
      duplicates.push(identity);
      continue;
    }

    seen.add(identity);
    deduped.push(item);
  }

  if (__DEV__ && duplicates.length > 0) {
    console.warn("[MenuSync] Dropped duplicate category item rows", {
      menuId: context.menuId ?? null,
      menuName: context.menuName ?? null,
      categoryId: context.categoryId ?? null,
      categoryName: context.categoryName ?? null,
      duplicateMenuItemIds: duplicates,
    });
  }

  return deduped;
}
