const PLATFORM_ALIASES: Record<string, string> = {
  'UBEREATS': 'ubereats', 'UBER_EATS': 'ubereats', 'UBER EATS': 'ubereats',
  'DOORDASH': 'doordash', 'DOOR_DASH': 'doordash', 'DOOR DASH': 'doordash',
  'GRUBHUB': 'grubhub',   'GRUB_HUB': 'grubhub',   'GRUB HUB': 'grubhub',
  'FOODPANDA': 'foodpanda','FOOD_PANDA': 'foodpanda','FOOD PANDA': 'foodpanda',
  'POSTMATES': 'postmates',
}

export function normalizePlatform(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const key = raw.trim().toUpperCase().replace(/-/g, '_')
  if (!key) return null
  return PLATFORM_ALIASES[key] ?? key.toLowerCase()
}
