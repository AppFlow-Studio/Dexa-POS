/**
 * DeliveryPlatformBadge
 *
 * Renders a small logo badge for delivery platform orders.
 * Uses bundled static assets — no remote fetches.
 *
 * Accepts the backend `delivery_platform` string (e.g. "uber_eats", "doordash")
 * or falls back to `order_source` for generic "Online" display.
 *
 * Returns null for POS orders or when no platform info is present.
 */

import { colors } from '@/lib/theme'
import { Globe } from 'lucide-react-native'
import React from 'react'
import { Image, ImageSourcePropType, Text, View } from 'react-native'

// ── Logo asset map (backend platform name → bundled asset) ──────────────────

const PLATFORM_LOGOS: Record<string, ImageSourcePropType> = {
  // DoorDash
  doordash: require('@/assets/images/doordash.png'),
  door_dash: require('@/assets/images/doordash.png'),
  // Grubhub
  grubhub: require('@/assets/images/grubhub.png'),
  // Uber Eats
  uber_eats: require('@/assets/images/uber-eats.png'),
  ubereats: require('@/assets/images/uber-eats.png'),
  'uber-eats': require('@/assets/images/uber-eats.png'),
  // Food Panda / Postmates (reuse food-panda asset as placeholder)
  food_panda: require('@/assets/images/food-panda.png'),
  foodpanda: require('@/assets/images/food-panda.png'),
  postmates: require('@/assets/images/food-panda.png'),
}

// Brand accent colors (background tint for the logo container)
const PLATFORM_COLORS: Record<string, string> = {
  doordash: '#FF3008',
  door_dash: '#FF3008',
  grubhub: '#F63440',
  uber_eats: '#06C167',
  ubereats: '#06C167',
  'uber-eats': '#06C167',
  food_panda: '#D70F64',
  foodpanda: '#D70F64',
  postmates: '#6E48AA',
}

// ── Props ────────────────────────────────────────────────────────────────────

interface DeliveryPlatformBadgeProps {
  /** Backend delivery_platform field value (e.g. "uber_eats") */
  deliveryPlatform?: string | null
  /** Backend order_source field (fallback for generic online badge) */
  orderSource?: string | null
  /** Badge size variant — 'sm' fits inside order chips row, 'md' for detail views */
  size?: 'sm' | 'md'
}

// ── Component ────────────────────────────────────────────────────────────────

export default function DeliveryPlatformBadge({
  deliveryPlatform,
  orderSource,
  size = 'sm',
}: DeliveryPlatformBadgeProps) {
  // POS orders → show nothing
  if (!deliveryPlatform && (!orderSource || orderSource === 'pos' || orderSource === 'in_store')) {
    return null
  }

  const key = deliveryPlatform?.toLowerCase() ?? ''
  const logo = PLATFORM_LOGOS[key]
  const accent = PLATFORM_COLORS[key] ?? colors.teal

  const logoSize = size === 'md' ? 20 : 14
  const containerSize = size === 'md' ? 28 : 20
  const fontSize = size === 'md' ? 11 : 10

  // Known platform with logo
  if (logo) {
    return (
      <View
        style={{
          width: containerSize,
          height: containerSize,
          borderRadius: containerSize / 2,
          backgroundColor: accent + '22',
          borderWidth: 1,
          borderColor: accent + '55',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <Image
          source={logo}
          style={{ width: logoSize, height: logoSize }}
          resizeMode='contain'
        />
      </View>
    )
  }

  // Unknown external platform — generic globe badge
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        backgroundColor: colors.teal + '20',
        borderWidth: 1,
        borderColor: colors.teal + '50',
        borderRadius: 20,
        paddingHorizontal: size === 'md' ? 8 : 6,
        paddingVertical: size === 'md' ? 3 : 2,
      }}
    >
      <Globe size={size === 'md' ? 12 : 9} color={colors.teal} />
      <Text style={{ fontSize, fontWeight: '700', color: colors.teal }}>
        Online
      </Text>
    </View>
  )
}
