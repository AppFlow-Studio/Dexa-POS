import { colors } from '@/lib/theme'
import { MenuItemType } from '@/lib/types'
import { useMenuStore } from '@/stores/useMenuStore'
import { useUiScale } from '@/lib/uiScale'
import { Pencil } from 'lucide-react-native'
import React from 'react'
import { Text, TouchableOpacity, View } from 'react-native'

interface CategoryCardProps {
  categoryName: string
  isExpanded: boolean
  onToggleExpand: (name: string) => void
  onEdit: () => void
}

export const CategoryCard: React.FC<CategoryCardProps> = ({
  categoryName,
  isExpanded,
  onToggleExpand,
  onEdit
}) => {
  const getItemsInCategory = useMenuStore(s => s.getItemsInCategory)
  const categories = useMenuStore(s => s.categories)
  const categoryItems = getItemsInCategory(categoryName)
  const categoryDetails = categories.find(c => c.name === categoryName)
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)

  return (
    <View
      style={{
        backgroundColor: colors.panel,
        borderRadius: s(8),
        borderWidth: 1,
        borderColor: colors.border,
        padding: s(16),
        marginBottom: s(12)
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <TouchableOpacity
          onPress={() => onToggleExpand(categoryName)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: s(8),
            flex: 1
          }}
        >
          <Text
            style={{ fontWeight: '500', color: colors.heading, fontSize: s(20) }}
          >
            {categoryName}
          </Text>
          <View
            style={{
              backgroundColor: colors.heading + '30',
              borderWidth: 1,
              borderColor: colors.heading,
              paddingHorizontal: s(8),
              paddingVertical: s(4),
              borderRadius: s(4)
            }}
          >
            <Text style={{ fontSize: s(14), color: colors.heading }}>
              {categoryItems.length} items
            </Text>
          </View>
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
          <TouchableOpacity
            onPress={onEdit}
            style={{
              padding: s(8),
              backgroundColor: colors.panel,
              borderRadius: s(4),
              borderWidth: 1,
              borderColor: colors.border
            }}
          >
            <Pencil size={s(16)} color={colors.label} />
          </TouchableOpacity>
        </View>
      </View>

      {isExpanded && (
        <View style={{ marginTop: s(12), gap: s(8) }}>
          {categoryItems.length === 0 ? (
            <Text style={{ fontSize: s(16), color: colors.muted }}>
              No items in this category.
            </Text>
          ) : (
            <View style={{ gap: s(8), flexDirection: 'row', flexWrap: 'wrap' }}>
              {categoryItems.map((item: MenuItemType) => (
                <View
                  key={item.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: colors.panel,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: s(6),
                    paddingHorizontal: s(12),
                    paddingVertical: s(8)
                  }}
                >
                  <Text style={{ fontSize: s(16), color: colors.heading }}>
                    {item.name}
                  </Text>
                  <Text
                    style={{ fontSize: s(16), color: colors.label, marginLeft: s(8) }}
                  >
                    $ ${item.price.toFixed(2)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  )
}

export const DraggableMenuCategory = () => <View /> // Placeholder remains
