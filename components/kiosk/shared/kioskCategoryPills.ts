import type { CategoryPill } from "@/components/kiosk/shared/KioskCategoryPillBar";
import type { Category } from "@/lib/types";

/** The rail's grouping — one section per menu. Mirrors CategorySection. */
interface PillSource {
  menuId: string;
  title: string;
  data: Pick<Category, "id" | "name">[];
}

/**
 * Flatten the rail's menu sections into strip tabs, for layouts too narrow for
 * the rail (see kioskUsesCategoryRail).
 *
 * The rail tells two same-named categories apart by the menu heading above
 * each; a strip has no headings. Rather than drop the second one — which would
 * make that menu's category unreachable on a phone but not on a tablet — a
 * name that appears under more than one menu carries its menu's name.
 *
 * Keys are the rail's own `menuId:categoryId`, so selection survives switching
 * between the two layouts.
 */
export function categoryPillsFromSections(
  sections: PillSource[],
): CategoryPill[] {
  const menusPerName = new Map<string, Set<string>>();
  for (const section of sections) {
    for (const cat of section.data) {
      const menus = menusPerName.get(cat.name) ?? new Set<string>();
      menus.add(section.menuId);
      menusPerName.set(cat.name, menus);
    }
  }

  return sections.flatMap((section) =>
    section.data.map((cat) => ({
      key: `${section.menuId}:${cat.id}`,
      name:
        (menusPerName.get(cat.name)?.size ?? 0) > 1
          ? `${cat.name} · ${section.title}`
          : cat.name,
    })),
  );
}
