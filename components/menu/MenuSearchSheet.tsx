import { bottomSheetTheme, colors } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import { useMenuManagementSearchStore } from '@/stores/useMenuManagementSearchStore'
import { useMenuStore } from '@/stores/useMenuStore'
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetSectionList,
  BottomSheetTextInput
} from '@/components/ui/bottomSheet'
import { router } from 'expo-router'
import { Search, Settings, X } from 'lucide-react-native'
import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
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
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const inputRef = useRef<any>(null)
  const menuItems = useMenuStore(s => s.menuItems)
  const storeCategories = useMenuStore(s => s.categories)
  const storeMenus = useMenuStore(s => s.menus)
  const modifierGroups = useMenuStore(s => s.modifierGroups)
  const isMenuAvailableNow = useMenuStore(s => s.isMenuAvailableNow)
  const [searchQuery, setSearchQuery] = useState('')
  // Only compute/render results while the sheet is open. This sheet lives in the
  // always-mounted (main) layout at index={-1}; without this gate it rebuilt the
  // full menu/category/modifier result set (and the grouped sections) on every
  // menu-store change for the whole app lifetime — wasted work + retained arrays.
  const [isOpen, setIsOpen] = useState(false)

  const handleChange = useCallback((index: number) => {
    setIsOpen(index >= 0)
  }, [])

  useEffect(() => {
    setSearchQuery('')
  }, [activeTab])

  const searchResults = useMemo(() => {
    if (!isOpen) return []
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
    isOpen,
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

  const cardStyle = getCardStyle(s)
  const nameStyle = getNameStyle(s)
  const subStyle = getSubStyle(s)
  const editBtnStyle = getEditBtn(s)

  const renderItem = ({ item }: { item: any }) => {
    switch (activeTab) {
      case 'items': {
        const isAvailable = item.availability !== false
        return (
          <View style={cardStyle}>
            <View style={{ flex: 1 }}>
              <Text style={nameStyle} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={subStyle}>${item.price.toFixed(2)}</Text>
            </View>
            <Badge
              label={isAvailable ? 'Available' : 'Off'}
              available={isAvailable}
              s={s}
            />
            <TouchableOpacity
              onPress={() => {
                closeSearch()
                router.push(`/menu/edit-item?itemId=${item.id}`)
              }}
              style={editBtnStyle}
            >
              <Settings size={s(13)} color={colors.teal} />
            </TouchableOpacity>
          </View>
        )
      }

      case 'categories': {
        const isActive = item.isActive
        return (
          <View style={cardStyle}>
            <Text style={{ ...nameStyle, flex: 1 }}>{item.name}</Text>
            <Badge
              label={isActive ? 'Active' : 'Inactive'}
              available={isActive}
              s={s}
            />
            <TouchableOpacity
              onPress={() => {
                closeSearch()
                router.push(`/menu/edit-category?id=${item.id}`)
              }}
              style={{ ...editBtnStyle, marginLeft: s(8) }}
            >
              <Settings size={s(13)} color={colors.teal} />
            </TouchableOpacity>
          </View>
        )
      }

      case 'menus': {
        const isActive = item.isActive
        const isAvailableNow = isMenuAvailableNow(item.id)
        const statusOk = isActive && isAvailableNow
        return (
          <View style={cardStyle}>
            <Text style={{ ...nameStyle, flex: 1 }}>{item.name}</Text>
            <Badge
              label={statusOk ? 'Available' : 'Unavailable'}
              available={statusOk}
              s={s}
            />
            <TouchableOpacity
              onPress={() => {
                closeSearch()
                router.push(`/menu/edit-menu?id=${item.id}`)
              }}
              style={{ ...editBtnStyle, marginLeft: s(8) }}
            >
              <Settings size={s(13)} color={colors.teal} />
            </TouchableOpacity>
          </View>
        )
      }

      case 'modifiers': {
        const typeLabel = item.type === 'required' ? 'Required' : 'Optional'
        return (
          <View style={cardStyle}>
            <View style={{ flex: 1 }}>
              <Text style={nameStyle} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={subStyle}>{typeLabel}</Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                closeSearch()
                router.push(`/menu/edit-modifier?id=${item.id}`)
              }}
              style={editBtnStyle}
            >
              <Settings size={s(13)} color={colors.teal} />
            </TouchableOpacity>
          </View>
        )
      }

      case 'schedules': {
        const isMenu = (item as any).type === 'menu'
        return (
          <View
            style={{
              ...cardStyle,
              flexDirection: 'column',
              alignItems: 'stretch'
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginBottom: s(10)
              }}
            >
              <Text style={{ ...nameStyle, flex: 1 }}>{item.name}</Text>
              <Badge label={isMenu ? 'Menu' : 'Category'} available={true} s={s} />
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
      onChange={handleChange}
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
          paddingHorizontal: s(16),
          paddingTop: s(6),
          paddingBottom: s(14),
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.screen,
          gap: s(12)
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
            style={{ fontSize: s(15), fontWeight: '700', color: colors.heading }}
          >
            {TAB_LABELS[activeTab] ?? 'Search'}
          </Text>
          <TouchableOpacity
            onPress={closeSearch}
            style={{
              paddingHorizontal: s(12),
              paddingVertical: s(6),
              borderRadius: s(8),
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border
            }}
          >
            <Text
              style={{ fontSize: s(12), fontWeight: '600', color: colors.label }}
            >
              Close
            </Text>
          </TouchableOpacity>
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            borderRadius: s(8),
            paddingHorizontal: s(12),
            height: s(40),
            borderWidth: 1,
            backgroundColor: colors.card,
            borderColor: colors.border,
            gap: s(10)
          }}
        >
          <Search color={colors.muted} size={s(15)} />
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
              fontSize: s(13),
              fontWeight: '500'
            }}
          />
          {(searchQuery || '').length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X color={colors.muted} size={s(15)} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <BottomSheetSectionList
        sections={groupedResults}
        keyExtractor={(item: any) => item.id}
        ListHeaderComponent={
          searchResults.length > 0 ? (
            <View style={{ paddingBottom: s(4) }}>
              <Text
                style={{ fontSize: s(11), color: colors.muted, fontWeight: '500' }}
              >
                {searchResults.length}{' '}
                {searchResults.length === 1 ? 'result' : 'results'}
              </Text>
            </View>
          ) : null
        }
        renderSectionHeader={({ section }) => (
          <View style={{ paddingVertical: s(5), backgroundColor: colors.panel }}>
            <Text
              style={{
                color: colors.muted,
                fontSize: s(10),
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
          paddingHorizontal: s(16),
          paddingTop: s(10),
          paddingBottom: s(40)
        }}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingTop: s(60), gap: s(12) }}>
            <Search size={s(32)} color={colors.muted} />
            <Text
              style={{ fontSize: s(14), fontWeight: '600', color: colors.label }}
            >
              {searchQuery
                ? `No results for "${searchQuery}"`
                : `No ${TAB_LABELS[activeTab]?.toLowerCase()} found`}
            </Text>
            <Text style={{ fontSize: s(12), color: colors.muted }}>
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
const getCardStyle = (s: (n: number) => number): any => ({
  backgroundColor: colors.card,
  borderRadius: s(10),
  borderWidth: 1,
  borderColor: colors.border,
  paddingHorizontal: s(14),
  paddingVertical: s(12),
  marginBottom: s(8),
  flexDirection: 'row',
  alignItems: 'center',
  gap: s(10)
})

const getNameStyle = (s: (n: number) => number): any => ({
  fontSize: s(13),
  fontWeight: '600',
  color: colors.heading
})

const getSubStyle = (s: (n: number) => number): any => ({
  fontSize: s(12),
  color: colors.teal,
  marginTop: s(3),
  fontWeight: '500'
})

const getEditBtn = (s: (n: number) => number): any => ({
  padding: s(7),
  backgroundColor: colors.teal + '18',
  borderRadius: s(7),
  borderWidth: 1,
  borderColor: colors.teal + '35'
})

// Badge component
function Badge ({
  label,
  available,
  s
}: {
  label: string
  available: boolean
  s: (n: number) => number
}) {
  return (
    <View
      style={{
        paddingHorizontal: s(8),
        paddingVertical: s(4),
        borderRadius: s(6),
        backgroundColor: available ? colors.teal + '18' : colors.danger + '15',
        borderWidth: 1,
        borderColor: available ? colors.teal + '35' : colors.danger + '30'
      }}
    >
      <Text
        style={{
          fontSize: s(11),
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
