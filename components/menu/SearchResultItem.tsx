import { useToast } from '@/contexts/ToastContext'
import { colors } from '@/lib/theme'
import { MenuItemType } from '@/lib/types'
import { useSearchStore } from '@/stores/searchStore'
import { useActiveOrder } from '@/stores/selectors/orderSelectors'
import { useModifierSidebarStore } from '@/stores/useModifierSidebarStore'
import { useOrderStore } from '@/stores/useOrderStore'
import { Plus } from 'lucide-react-native'
import React from 'react'
import { Text, TouchableOpacity, View } from 'react-native'

interface SearchResultItemProps {
  item: MenuItemType
  menuName?: string
  displayPrice?: number
  isDisabled?: boolean
  disabledReason?: string
}

const SearchResultItem: React.FC<SearchResultItemProps> = ({
  item,
  displayPrice,
  isDisabled = false,
  disabledReason
}) => {
  const closeSearchSheet = useSearchStore(state => state.closeSearch)
  const activeOrderId = useOrderStore(s => s.activeOrderId)
  const { openFullscreen } = useModifierSidebarStore()
  const { show } = useToast()
  const activeOrder = useActiveOrder()

  const handleAddToCart = () => {
    if (isDisabled) return

    // if (!activeOrder?.order_type) {
    //   show({
    //     title: "Order Type Required",
    //     message: "Please select an order type before adding items.",
    //     type: "warning",
    //   });
    //   return;
    // }

    openFullscreen(item, activeOrderId)
    closeSearchSheet()
  }

  const finalPrice = displayPrice !== undefined ? displayPrice : item.price

  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 12,
        marginBottom: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card
      }}
    >
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text
          style={{
            fontSize: 13,
            fontWeight: '600',
            color: isDisabled ? colors.muted : colors.heading
          }}
          numberOfLines={1}
        >
          {item.name}
        </Text>
        <View
          style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 2 }}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: '600',
              color: isDisabled ? colors.muted : colors.teal,
              marginTop: 4
            }}
          >
            ${finalPrice.toFixed(2)}
          </Text>
          {item.cashPrice && !isDisabled && (
            <Text style={{ fontSize: 11, color: colors.muted, marginLeft: 8 }}>
              Cash ${item.cashPrice.toFixed(2)}
            </Text>
          )}
        </View>
        {isDisabled && disabledReason && (
          <Text style={{ fontSize: 11, color: colors.danger, marginTop: 3 }}>
            {disabledReason}
          </Text>
        )}
      </View>
      <TouchableOpacity
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 8,
          backgroundColor: isDisabled
            ? `${colors.muted}15`
            : `${colors.teal}20`,
          borderWidth: 1,
          borderColor: isDisabled ? `${colors.muted}30` : `${colors.teal}50`,
          gap: 4
        }}
        onPress={handleAddToCart}
        disabled={isDisabled}
      >
        <Plus
          color={isDisabled ? colors.muted : colors.teal}
          size={13}
          strokeWidth={3}
        />
        <Text
          style={{
            fontSize: 12,
            fontWeight: '600',
            color: isDisabled ? colors.muted : colors.teal
          }}
        >
          Add
        </Text>
      </TouchableOpacity>
    </View>
  )
}

export default SearchResultItem
