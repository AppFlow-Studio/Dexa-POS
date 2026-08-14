/**
 * Menu-management item card.
 *
 * Extracted from app/(main)/menu/index.tsx and memoized. Previously this was an
 * inline ~150-line JSX tree built by a function recreated on every render of a
 * 3,400-line screen, so any parent state change — a keystroke in search, a tab
 * switch, any menu-store update — rebuilt and re-rendered every visible card.
 *
 * Keeping it a separate `React.memo` component means a card only re-renders
 * when its own props actually change. All handlers arrive pre-memoized from the
 * parent, so the memo comparison holds.
 */

import MenuManagementImage from '@/components/menu/MenuManagementImage'
import { colors } from '@/lib/theme'
import {
  extractMenuItemPlaceholderIconKey,
  getMenuItemPlaceholderIcon,
  type MenuItemPlaceholderIconKey
} from '@/lib/menuItemPlaceholderIcon'
import { formatSnoozeCountdown } from '@/lib/snoozeDurations'
import type { MenuItemType } from '@/lib/types'
import { Ban, Eye, EyeOff, Pencil } from 'lucide-react-native'
import React from 'react'
import { Text, TouchableOpacity, View } from 'react-native'

/** Card geometry — kept here so the list's layout maths and the card agree. */
export const ITEM_CARD_WIDTH = 152
export const ITEM_CARD_HEIGHT = 186

export const getPlaceholderIconForItem = (item: MenuItemType) => {
  const iconKey =
    (item.placeholderIcon as MenuItemPlaceholderIconKey | undefined) ??
    extractMenuItemPlaceholderIconKey(item.cardBgColor)
  return getMenuItemPlaceholderIcon(iconKey)
}

interface MenuItemGridCardProps {
  item: MenuItemType
  editable: boolean
  availEditable: boolean
  canSnooze: boolean
  onSnooze: (item: MenuItemType) => void
  onToggleAvailability: (itemId: string) => void
  onEdit: (item: MenuItemType) => void
}

function MenuItemGridCardBase ({
  item,
  editable,
  availEditable,
  canSnooze,
  onSnooze,
  onToggleAvailability,
  onEdit
}: MenuItemGridCardProps) {
  const isAvailable = item.availability !== false
  const snoozeLabel = formatSnoozeCountdown(item.snoozedUntil)
  const PlaceholderIcon = getPlaceholderIconForItem(item)

  return (
    <View
      style={{
        position: 'relative',
        width: ITEM_CARD_WIDTH,
        minHeight: ITEM_CARD_HEIGHT,
        borderRadius: 10,
        backgroundColor: colors.panel,
        borderWidth: 1,
        borderColor: colors.teal + '35',
        overflow: 'hidden'
      }}
    >
      {snoozeLabel && (
        <View
          style={{
            position: 'absolute',
            top: 6,
            left: 6,
            zIndex: 20,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 3,
            paddingHorizontal: 6,
            paddingVertical: 3,
            borderRadius: 6,
            backgroundColor: colors.danger
          }}
        >
          <Ban size={10} color={colors.onSolid} />
          <Text
            style={{ fontSize: 10, fontWeight: '700', color: colors.onSolid }}
          >
            {snoozeLabel === '86' ? '86' : `86 · ${snoozeLabel}`}
          </Text>
        </View>
      )}

      {/* Image */}
      <View style={{ height: 104, width: '100%' }}>
        {item.image ? (
          <MenuManagementImage
            image={item.image}
            recyclingKey={item.id}
            style={{ width: '100%', height: '100%' }}
          />
        ) : (
          <View
            style={{
              flex: 1,
              backgroundColor: `${colors.teal}08`,
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <PlaceholderIcon
              color={`${colors.label}60`}
              size={18}
              strokeWidth={2}
            />
          </View>
        )}
      </View>

      {/* Content */}
      <View
        style={{
          paddingHorizontal: 8,
          paddingTop: 7,
          paddingBottom: 42,
          gap: 3
        }}
      >
        <Text
          style={{
            fontSize: 12,
            fontWeight: '600',
            color: colors.heading,
            lineHeight: 15,
            flexShrink: 1
          }}
          numberOfLines={2}
        >
          {item.name}
        </Text>
        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.teal }}>
          ${item.price.toFixed(2)}
        </Text>
      </View>

      {/* Action overlay */}
      <View
        style={{
          position: 'absolute',
          bottom: 7,
          right: 7,
          flexDirection: 'row',
          gap: 4,
          zIndex: 20
        }}
      >
        <TouchableOpacity
          onPress={() => onSnooze(item)}
          disabled={!canSnooze}
          style={{
            padding: 6,
            backgroundColor: colors.danger + '18',
            borderRadius: 6,
            borderWidth: 1,
            borderColor: colors.danger + '35',
            opacity: canSnooze ? 1 : 0.4
          }}
        >
          <Ban size={16} color={colors.danger} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onToggleAvailability(item.id)}
          disabled={!availEditable}
          style={{
            padding: 6,
            backgroundColor: colors.teal + '18',
            borderRadius: 6,
            borderWidth: 1,
            borderColor: colors.teal + '35',
            opacity: availEditable ? 1 : 0.4
          }}
        >
          {isAvailable ? (
            <Eye size={16} color={colors.success} />
          ) : (
            <EyeOff size={16} color={colors.danger} />
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onEdit(item)}
          disabled={!editable}
          style={{
            padding: 6,
            backgroundColor: colors.teal + '18',
            borderRadius: 6,
            borderWidth: 1,
            borderColor: colors.teal + '35',
            opacity: editable ? 1 : 0.4
          }}
        >
          <Pencil size={16} color={editable ? colors.teal : colors.muted} />
        </TouchableOpacity>
      </View>
    </View>
  )
}

export const MenuItemGridCard = React.memo(MenuItemGridCardBase)
