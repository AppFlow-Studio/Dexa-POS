import type {
  KioskCategory,
  KioskMenuData,
  KioskMenuItem,
  KioskModifierGroup,
} from "@/components/kiosk/types";
import type { MenuItemType, ModifierCategory } from "@/lib/types";
import { useMenuStore } from "@/stores/useMenuStore";
import { useMemo } from "react";

const FALLBACK_MENU: KioskMenuData = {
  categories: [
    {
      id: "featured",
      name: "Featured",
      image: null,
      itemIds: ["milk-tea", "matcha-latte", "strawberry-tea"],
    },
  ],
  items: [
    {
      id: "milk-tea",
      name: "Classic Milk Tea",
      description: "Black tea, milk, and brown sugar pearls.",
      image: null,
      price: 5.5,
      cashPrice: null,
      isAvailable: true,
      categoryIds: ["featured"],
      modifierGroups: [
        {
          id: "sweetness",
          name: "Sweetness",
          minRequired: 1,
          maxAllowed: 1,
          options: [
            { id: "sweet-50", name: "50%", price: 0, isAvailable: true },
            { id: "sweet-100", name: "100%", price: 0, isAvailable: true },
          ],
        },
      ],
    },
    {
      id: "matcha-latte",
      name: "Iced Matcha Latte",
      description: "Ceremonial matcha with cold milk.",
      image: null,
      price: 6.25,
      cashPrice: null,
      isAvailable: true,
      categoryIds: ["featured"],
      modifierGroups: [],
    },
    {
      id: "strawberry-tea",
      name: "Strawberry Green Tea",
      description: "Green tea, strawberry puree, and fruit jelly.",
      image: null,
      price: 5.95,
      cashPrice: null,
      isAvailable: true,
      categoryIds: ["featured"],
      modifierGroups: [],
    },
  ],
};

function getStringField(source: object, keys: string[]): string | null {
  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function getNumberField(source: object, keys: string[], fallback = 0): number {
  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return fallback;
}

function getBooleanField(
  source: object,
  keys: string[],
  fallback = true,
): boolean {
  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
  }
  return fallback;
}

function mapModifierGroup(group: ModifierCategory): KioskModifierGroup {
  const record = group as unknown as Record<string, unknown>;
  const max = getNumberField(group, ["max_selections", "maxAllowed", "max"], 1);
  const optionsSource = Array.isArray(record.options)
    ? record.options
    : Array.isArray(record.items)
      ? record.items
      : [];

  return {
    id: String(group.id),
    name: String(group.name),
    minRequired: getNumberField(group, ["min_selections", "minRequired"], 0),
    maxAllowed: Math.max(1, max || 1),
    options: optionsSource.map((option) => {
      const optionRecord = option as Record<string, unknown>;
      return {
        id: String(optionRecord.id),
        name: String(optionRecord.name ?? "Option"),
        price: getNumberField(
          optionRecord,
          ["price_modifier", "priceModifier", "price"],
          0,
        ),
        isAvailable: getBooleanField(
          optionRecord,
          ["is_active", "availability"],
          true,
        ),
      };
    }),
  };
}

function getItemCategoryIds(item: MenuItemType): string[] {
  const record = item as unknown as Record<string, unknown>;
  const directId = getStringField(item, ["categoryId", "category_id"]);
  const directName = getStringField(item, ["category", "categoryName"]);
  const categoryIds = Array.isArray(record.categoryIds)
    ? record.categoryIds
    : [];
  // item.category is string[] (array of category names) — extract all strings from it
  const categoryArray = Array.isArray(record.category)
    ? record.category.filter((c: unknown): c is string => typeof c === "string")
    : [];
  return [
    ...categoryIds.filter(
      (value): value is string => typeof value === "string",
    ),
    ...(directId ? [directId] : []),
    ...(directName ? [directName] : []),
    ...categoryArray,
  ];
}

function mapMenuItem(
  item: MenuItemType,
  modifierGroupsById: Record<string, ModifierCategory>,
): KioskMenuItem {
  const record = item as unknown as Record<string, unknown>;
  const modifierGroupIds = Array.isArray(record.modifierGroupIds)
    ? record.modifierGroupIds.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const embeddedGroups = Array.isArray(record.modifier_groups)
    ? record.modifier_groups
    : Array.isArray(record.modifiers)
      ? record.modifiers
      : [];

  const modifierGroups = [
    ...modifierGroupIds
      .map((id) => modifierGroupsById[id])
      .filter((group): group is ModifierCategory => Boolean(group))
      .map(mapModifierGroup),
    ...embeddedGroups.map((group) =>
      mapModifierGroup(group as ModifierCategory),
    ),
  ];

  return {
    id: String(item.id),
    name: String(item.name),
    description: getStringField(item, ["description"]),
    image: getStringField(item, ["image", "image_url"]),
    price: getNumberField(item, ["effective_price", "price", "base_price"], 0),
    cashPrice:
      getNumberField(
        item,
        ["effective_cash_price", "cashPrice", "base_cash_price"],
        0,
      ) || null,
    isAvailable: getBooleanField(
      item,
      ["effective_availability", "availability", "is_active"],
      true,
    ),
    categoryIds: getItemCategoryIds(item),
    modifierGroups,
  };
}

export function useKioskMenu(): KioskMenuData {
  const menuItems = useMenuStore((state) => state.menuItems);
  const categories = useMenuStore((state) => state.categories);
  const modifierGroupsById = useMenuStore((state) => state.modifierGroupsById);

  return useMemo<KioskMenuData>(() => {
    const items = menuItems.map((item) =>
      mapMenuItem(item, modifierGroupsById),
    );
    if (items.length === 0) return FALLBACK_MENU;
    const fallbackCategoryId = "all";
    const mappedCategories: KioskCategory[] = categories.map((category) => {
      const categoryId = String(category.id);
      const categoryName = String(category.name);
      return {
        id: categoryId,
        name: categoryName,
        image: getStringField(category, ["image", "custom_image"]),
        itemIds: items
          .filter(
            (item) =>
              item.categoryIds.includes(categoryId) ||
              item.categoryIds.includes(categoryName),
          )
          .map((item) => item.id),
      };
    });

    if (mappedCategories.length === 0) {
      return {
        categories: [
          {
            id: fallbackCategoryId,
            name: "All items",
            image: null,
            itemIds: items.map((item) => item.id),
          },
        ],
        items,
      };
    }

    return {
      categories: mappedCategories,
      items,
    };
  }, [categories, menuItems, modifierGroupsById]);
}
