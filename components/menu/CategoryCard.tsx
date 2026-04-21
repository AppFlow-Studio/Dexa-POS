import { colors } from '@/lib/theme'
import { MenuItemType } from '@/lib/types'
import { useMenuStore } from '@/stores/useMenuStore'
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

  return (
    <View
      style={{
        backgroundColor: colors.panel,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 16,
        marginBottom: 12
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
            gap: 8,
            flex: 1
          }}
        >
          <Text
            style={{ fontWeight: '500', color: colors.heading, fontSize: 20 }}
          >
            {categoryName}
          </Text>
          <View
            style={{
              backgroundColor: colors.heading + '30',
              borderWidth: 1,
              borderColor: colors.heading,
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 4
            }}
          >
            <Text style={{ fontSize: 14, color: colors.heading }}>
              {categoryItems.length} items
            </Text>
          </View>
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            onPress={onEdit}
            style={{
              padding: 8,
              backgroundColor: colors.panel,
              borderRadius: 4,
              borderWidth: 1,
              borderColor: colors.border
            }}
          >
            <Pencil size={16} color={colors.label} />
          </TouchableOpacity>
        </View>
      </View>

      {isExpanded && (
        <View style={{ marginTop: 12, gap: 8 }}>
          {categoryItems.length === 0 ? (
            <Text style={{ fontSize: 16, color: colors.muted }}>
              No items in this category.
            </Text>
          ) : (
            <View style={{ gap: 8, flexDirection: 'row', flexWrap: 'wrap' }}>
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
                    borderRadius: 6,
                    paddingHorizontal: 12,
                    paddingVertical: 8
                  }}
                >
                  <Text style={{ fontSize: 16, color: colors.heading }}>
                    {item.name}
                  </Text>
                  <Text
                    style={{ fontSize: 16, color: colors.label, marginLeft: 8 }}
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
