import { bottomSheetTheme, colors } from '@/lib/theme'
import { useMenuManagementSearchStore } from '@/stores/useMenuManagementSearchStore'
import { useMenuStore } from '@/stores/useMenuStore'
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetSectionList,
  BottomSheetTextInput
} from '@gorhom/bottom-sheet'
import { router } from 'expo-router'
import { Search, Settings, X } from 'lucide-react-native'
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import { ScheduleCard } from './ScheduleCard'

const TAB_LABELS: Record<string, string> = {
  menus: 'Menus',
  categories: 'Categories',
  items: 'Items',
  modifiers: 'Modifiers',
  schedules: 'Schedules'
}

const MenuSearchSheet = forwardRef<BottomSheet>((_, ref) => {
  const { closeSearch, activeTab } = useMenuManagementSearchStore()
  const inputRef = useRef<any>(null)
  const menuItems = useMenuStore(s => s.menuItems)
  const storeCategories = useMenuStore(s => s.categories)
  const storeMenus = useMenuStore(s => s.menus)
  const modifierGroups = useMenuStore(s => s.modifierGroups)
  const isMenuAvailableNow = useMenuStore(s => s.isMenuAvailableNow)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    setSearchQuery('')
  }, [activeTab])

  const searchResults = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()

    switch (activeTab) {
      case 'items':
        return menuItems.filter(item =>
          query ? item.name.toLowerCase().includes(query) : true
        )
      case 'categories':
        return storeCategories.filter(cat =>
          query ? cat.name.toLowerCase().includes(query) : true
        )
      case 'menus':
        return storeMenus.filter(menu =>
          query ? menu.name.toLowerCase().includes(query) : true
        )
      case 'modifiers':
        return modifierGroups.filter(mod =>
          query ? mod.name.toLowerCase().includes(query) : true
        )
      case 'schedules': {
        const scheduledMenus = storeMenus
          .filter(
            m =>
              m.schedules?.length &&
              (query ? m.name.toLowerCase().includes(query) : true)
          )
          .map(m => ({
            ...m,
            type: 'menu' as const,
            schedules: m.schedules || []
          }))
        const scheduledCategories = storeCategories
          .filter(
            c =>
              c.schedules?.length &&
              (query ? c.name.toLowerCase().includes(query) : true)
          )
          .map(c => ({
            ...c,
            type: 'category' as const,
            schedules: c.schedules || []
          }))
        return [...scheduledMenus, ...scheduledCategories]
      }
      default:
        return []
    }
  }, [
    searchQuery,
    activeTab,
    menuItems,
    storeCategories,
    storeMenus,
    modifierGroups
  ])

  const groupedResults = useMemo(() => {
    const map: Record<string, any[]> = {}
    for (const item of searchResults) {
      const first = ((item as any).name || '?')[0].toUpperCase()
      const key = /[A-Z]/.test(first) ? first : '#'
      if (!map[key]) map[key] = []
      map[key].push(item)
    }
    const letters = Object.keys(map).sort((a, b) => {
      if (a === '#') return 1
      if (b === '#') return -1
      return a.localeCompare(b)
    })
    return letters.map(letter => ({ title: letter, data: map[letter] }))
  }, [searchResults])

  const renderItem = ({ item }: { item: any }) => {
    switch (activeTab) {
      case 'items': {
        const isAvailable = item.availability !== false
        return (
          <View style={getCardStyle()}>
            <View style={{ flex: 1 }}>
              <Text style={getNameStyle()} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={getSubStyle()}>${item.price.toFixed(2)}</Text>
            </View>
            <Badge
              label={isAvailable ? 'Available' : 'Off'}
              available={isAvailable}
            />
            <TouchableOpacity
              onPress={() => {
                closeSearch()
                router.push(`/menu/edit-item?itemId=${item.id}`)
              }}
              style={getEditBtn()}
            >
              <Settings size={13} color={colors.teal} />
            </TouchableOpacity>
          </View>
        )
      }

      case 'categories': {
        const isActive = item.isActive
        return (
          <View style={getCardStyle()}>
            <Text style={{ ...getNameStyle(), flex: 1 }}>{item.name}</Text>
            <Badge
              label={isActive ? 'Active' : 'Inactive'}
              available={isActive}
            />
            <TouchableOpacity
              onPress={() => {
                closeSearch()
                router.push(`/menu/edit-category?id=${item.id}`)
              }}
              style={{ ...getEditBtn(), marginLeft: 8 }}
            >
              <Settings size={13} color={colors.teal} />
            </TouchableOpacity>
          </View>
        )
      }

      case 'menus': {
        const isActive = item.isActive
        const isAvailableNow = isMenuAvailableNow(item.id)
        const statusOk = isActive && isAvailableNow
        return (
          <View style={getCardStyle()}>
            <Text style={{ ...getNameStyle(), flex: 1 }}>{item.name}</Text>
            <Badge
              label={statusOk ? 'Available' : 'Unavailable'}
              available={statusOk}
            />
            <TouchableOpacity
              onPress={() => {
                closeSearch()
                router.push(`/menu/edit-menu?id=${item.id}`)
              }}
              style={{ ...getEditBtn(), marginLeft: 8 }}
            >
              <Settings size={13} color={colors.teal} />
            </TouchableOpacity>
          </View>
        )
      }

      case 'modifiers': {
        const typeLabel = item.type === 'required' ? 'Required' : 'Optional'
        return (
          <View style={getCardStyle()}>
            <View style={{ flex: 1 }}>
              <Text style={getNameStyle()} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={getSubStyle()}>{typeLabel}</Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                closeSearch()
                router.push(`/menu/edit-modifier?id=${item.id}`)
              }}
              style={getEditBtn()}
            >
              <Settings size={13} color={colors.teal} />
            </TouchableOpacity>
          </View>
        )
      }

      case 'schedules': {
        const isMenu = (item as any).type === 'menu'
        return (
          <View
            style={{
              ...getCardStyle(),
              flexDirection: 'column',
              alignItems: 'stretch'
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginBottom: 10
              }}
            >
              <Text style={{ ...getNameStyle(), flex: 1 }}>{item.name}</Text>
              <Badge label={isMenu ? 'Menu' : 'Category'} available={true} />
            </View>
            {item.schedules?.map((schedule: any) => (
              <ScheduleCard key={schedule.id} item={schedule} />
            ))}
          </View>
        )
      }

      default:
        return null
    }
  }

  return (
    <BottomSheet
      ref={ref}
      index={-1}
      snapPoints={['90%']}
      enablePanDownToClose={true}
      onClose={closeSearch}
      backdropComponent={({ style, animatedIndex, animatedPosition }) => (
        <BottomSheetBackdrop
          style={style}
          animatedIndex={animatedIndex}
          animatedPosition={animatedPosition}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.7}
        />
      )}
      keyboardBehavior='extend'
      {...bottomSheetTheme}
    >
      {/* Header */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 6,
          paddingBottom: 14,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.screen,
          gap: 12
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <Text
            style={{ fontSize: 15, fontWeight: '700', color: colors.heading }}
          >
            {TAB_LABELS[activeTab] ?? 'Search'}
          </Text>
          <TouchableOpacity
            onPress={closeSearch}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 8,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border
            }}
          >
            <Text
              style={{ fontSize: 12, fontWeight: '600', color: colors.label }}
            >
              Close
            </Text>
          </TouchableOpacity>
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            borderRadius: 8,
            paddingHorizontal: 12,
            height: 40,
            borderWidth: 1,
            backgroundColor: colors.card,
            borderColor: colors.border,
            gap: 10
          }}
        >
          <Search color={colors.muted} size={15} />
          <BottomSheetTextInput
            ref={inputRef}
            value={searchQuery || ''}
            onChangeText={setSearchQuery}
            placeholder={`Search ${
              TAB_LABELS[activeTab]?.toLowerCase() ?? ''
            }...`}
            placeholderTextColor={colors.muted}
            style={{
              flex: 1,
              color: colors.heading,
              fontSize: 13,
              fontWeight: '500'
            }}
          />
          {(searchQuery || '').length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X color={colors.muted} size={15} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <BottomSheetSectionList
        sections={groupedResults}
        keyExtractor={(item: any) => item.id}
        ListHeaderComponent={
          searchResults.length > 0 ? (
            <View style={{ paddingBottom: 4 }}>
              <Text
                style={{ fontSize: 11, color: colors.muted, fontWeight: '500' }}
              >
                {searchResults.length}{' '}
                {searchResults.length === 1 ? 'result' : 'results'}
              </Text>
            </View>
          ) : null
        }
        renderSectionHeader={({ section }) => (
          <View style={{ paddingVertical: 5, backgroundColor: colors.panel }}>
            <Text
              style={{
                color: colors.muted,
                fontSize: 10,
                fontWeight: '700',
                letterSpacing: 0.8,
                textTransform: 'uppercase'
              }}
            >
              {section.title}
            </Text>
          </View>
        )}
        renderItem={renderItem}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 10,
          paddingBottom: 40
        }}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
            <Search size={32} color={colors.muted} />
            <Text
              style={{ fontSize: 14, fontWeight: '600', color: colors.label }}
            >
              {searchQuery
                ? `No results for "${searchQuery}"`
                : `No ${TAB_LABELS[activeTab]?.toLowerCase()} found`}
            </Text>
            <Text style={{ fontSize: 12, color: colors.muted }}>
              {searchQuery
                ? 'Try a different search term'
                : 'Add some to get started'}
            </Text>
          </View>
        }
      />
    </BottomSheet>
  )
})

// Shared styles
const getCardStyle = (): any => ({
  backgroundColor: colors.card,
  borderRadius: 10,
  borderWidth: 1,
  borderColor: colors.border,
  paddingHorizontal: 14,
  paddingVertical: 12,
  marginBottom: 8,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 10
})

const getNameStyle = (): any => ({
  fontSize: 13,
  fontWeight: '600',
  color: colors.heading
})

const getSubStyle = (): any => ({
  fontSize: 12,
  color: colors.teal,
  marginTop: 3,
  fontWeight: '500'
})

const getEditBtn = (): any => ({
  padding: 7,
  backgroundColor: colors.teal + '18',
  borderRadius: 7,
  borderWidth: 1,
  borderColor: colors.teal + '35'
})

// Badge component
function Badge ({ label, available }: { label: string; available: boolean }) {
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        backgroundColor: available ? colors.teal + '18' : colors.danger + '15',
        borderWidth: 1,
        borderColor: available ? colors.teal + '35' : colors.danger + '30'
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: '600',
          color: available ? colors.teal : colors.danger
        }}
      >
        {label}
      </Text>
    </View>
  )
}

export default MenuSearchSheet
