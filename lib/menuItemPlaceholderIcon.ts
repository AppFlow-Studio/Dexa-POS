import {
  Coffee,
  CupSoda,
  Fish,
  Hamburger,
  IceCreamCone,
  Pizza,
  Salad,
  UtensilsCrossed,
  type LucideIcon
} from 'lucide-react-native'

export type MenuItemPlaceholderIconKey =
  | 'utensils'
  | 'drink'
  | 'burger'
  | 'pizza'
  | 'dessert'
  | 'coffee'
  | 'salad'
  | 'seafood'

const ICON_CARD_BG_PREFIX = 'icon:'

export const MENU_ITEM_PLACEHOLDER_ICON_OPTIONS: Array<{
  key: MenuItemPlaceholderIconKey
  label: string
}> = [
  { key: 'utensils', label: 'Food' },
  { key: 'drink', label: 'Drink' },
  { key: 'burger', label: 'Burger' },
  { key: 'pizza', label: 'Pizza' },
  { key: 'dessert', label: 'Dessert' },
  { key: 'coffee', label: 'Coffee' },
  { key: 'salad', label: 'Salad' },
  { key: 'seafood', label: 'Seafood' }
]

const MENU_ITEM_PLACEHOLDER_ICON_COMPONENTS: Record<
  MenuItemPlaceholderIconKey,
  LucideIcon
> = {
  utensils: UtensilsCrossed,
  drink: CupSoda,
  burger: Hamburger,
  pizza: Pizza,
  dessert: IceCreamCone,
  coffee: Coffee,
  salad: Salad,
  seafood: Fish
}

const VALID_KEYS = new Set<MenuItemPlaceholderIconKey>(
  MENU_ITEM_PLACEHOLDER_ICON_OPTIONS.map(option => option.key)
)

export const DEFAULT_MENU_ITEM_PLACEHOLDER_ICON: MenuItemPlaceholderIconKey =
  'utensils'

export function extractMenuItemPlaceholderIconKey (
  cardBgColor?: string
): MenuItemPlaceholderIconKey | undefined {
  if (!cardBgColor || !cardBgColor.startsWith(ICON_CARD_BG_PREFIX)) {
    return undefined
  }

  const candidate = cardBgColor.slice(ICON_CARD_BG_PREFIX.length)
  if (VALID_KEYS.has(candidate as MenuItemPlaceholderIconKey)) {
    return candidate as MenuItemPlaceholderIconKey
  }

  return undefined
}

export function encodeMenuItemPlaceholderIconKey (
  key: MenuItemPlaceholderIconKey
): string {
  return `${ICON_CARD_BG_PREFIX}${key}`
}

export function getMenuItemPlaceholderIcon (
  key?: MenuItemPlaceholderIconKey
): LucideIcon {
  const resolvedKey = key ?? DEFAULT_MENU_ITEM_PLACEHOLDER_ICON
  return MENU_ITEM_PLACEHOLDER_ICON_COMPONENTS[resolvedKey]
}
