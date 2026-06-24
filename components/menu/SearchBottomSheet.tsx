import { bottomSheetTheme, colors } from '@/lib/theme'
import { MenuItemType, Schedule } from '@/lib/types'
import { useSearchStore } from '@/stores/searchStore'
import { useMenuStore } from '@/stores/useMenuStore'
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetTextInput
} from '@gorhom/bottom-sheet'
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types'
import { Search, X } from 'lucide-react-native'
import React, {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { Keyboard, Text, TouchableOpacity, View } from 'react-native'
import SearchResultItem from './SearchResultItem'

// Helper to check schedule availability
const isScheduleActive = (schedules: Schedule[] | undefined): boolean => {
  if (!schedules || schedules.length === 0) return true

  const now = new Date()
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const currentDay = days[now.getDay()]
  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  return schedules.some(schedule => {
    if (!schedule.isActive) return false
    if (!schedule.days.includes(currentDay)) return false

    const [startH, startM] = schedule.startTime.split(':').map(Number)
    const [endH, endM] = schedule.endTime.split(':').map(Number)
    const startTotal = startH * 60 + startM
    const endTotal = endH * 60 + endM

    if (endTotal < startTotal) {
      // Overnight schedule (e.g. 10PM to 2AM)
      return currentMinutes >= startTotal || currentMinutes <= endTotal
    }
    return currentMinutes >= startTotal && currentMinutes <= endTotal
  })
}

type SearchItem = MenuItemType & {
  menuName: string
  displayPrice: number
  isDisabled: boolean
  disabledReason?: string
  uniqueKey: string
}

interface SearchSection {
  title: string
  data: SearchItem[]
}

// Flattened rows for the virtualized list: a section header or an item.
type SearchRow =
  | { type: 'header'; key: string; title: string }
  | { type: 'item'; key: string; item: SearchItem }

const SearchBottomSheet = React.forwardRef<BottomSheet>(() => {
  const searchSheetRef = useRef<BottomSheetMethods>(null)
  const inputRef = useRef<any>(null)
  const snapPoints = useMemo(() => ['85%'], [])
  const [searchText, setSearchText] = useState('')
  // Track open state so the (potentially huge) menu list only mounts while the
  // sheet is visible. The sheet sits in the always-mounted root POS tree at
  // index={-1}; without this gate it rendered EVERY menu item as a live view
  // for the whole app lifetime (~2000 views on a full menu), inflating the
  // baseline view tree the moment a station is selected.
  const [isOpen, setIsOpen] = useState(false)

  const { menus } = useMenuStore(state => state)
  const { closeSearch, setSearchSheetRef } = useSearchStore()

  // Menu-Aware Search Logic. Skip all work while the sheet is closed — there's
  // nothing to display, and an empty search would otherwise materialize the
  // entire menu into section data on every menus/searchText change.
  const searchResults = useMemo<SearchSection[]>(() => {
    if (!isOpen) return []
    const trimmedSearch = searchText.trim().toLowerCase()

    const availableSections: SearchSection[] = []
    const unavailableSections: SearchSection[] = []

    menus.forEach(menu => {
      // 1. Check Menu Schedule
      const isMenuAvailable = isScheduleActive(menu.schedules)
      const menuItems: SearchSection['data'] = []

      menu.categories.forEach(category => {
        // 2. Check Category Schedule
        const isCategoryAvailable = isScheduleActive(category.schedules)

        category.items?.forEach(item => {
          // 3. Match Search Text - only filter if search is not empty
          if (trimmedSearch) {
            const matchName = item.name.toLowerCase().includes(trimmedSearch)
            const matchDesc = item.description
              ?.toLowerCase()
              .includes(trimmedSearch)
            if (!matchName && !matchDesc) return // Skip this item if it doesn't match
          }
          // If search is empty or item matches, add it

          // 4. Calculate Price (Menu > Category > Item)
          let price = item.price
          if (
            item.menuPriceOverrides &&
            item.menuPriceOverrides[menu.id] !== undefined
          ) {
            price = item.menuPriceOverrides[menu.id]
          } else if (
            item.categoryPriceOverrides &&
            item.categoryPriceOverrides[category.id] !== undefined
          ) {
            price = item.categoryPriceOverrides[category.id]
          }

          // 5. Determine Availability
          let isDisabled = false
          let disabledReason = undefined

          if (item.availability === false) {
            isDisabled = true
            disabledReason = 'Out of Stock'
          } else if (!isMenuAvailable) {
            isDisabled = true
            disabledReason = 'Menu Unavailable'
          } else if (!isCategoryAvailable) {
            isDisabled = true
            disabledReason = 'Category Unavailable'
          }

          menuItems.push({
            ...item,
            uniqueKey: `${menu.id}-${category.id}-${item.id}`,
            menuName: menu.name,
            displayPrice: price,
            isDisabled,
            disabledReason
          })
        })
      })

      if (menuItems.length > 0) {
        const section = {
          title: menu.name,
          data: menuItems
        }

        if (isMenuAvailable) {
          availableSections.push(section)
        } else {
          unavailableSections.push(section)
        }
      }
    })

    return [...availableSections, ...unavailableSections]
  }, [isOpen, searchText, menus])

  // Flatten sections → a single virtualizable row list (header + item rows) so
  // BottomSheetFlatList only mounts the rows currently on screen.
  const searchRows = useMemo<SearchRow[]>(() => {
    const rows: SearchRow[] = []
    searchResults.forEach((section, sectionIndex) => {
      rows.push({
        type: 'header',
        key: `section-${sectionIndex}`,
        title: section.title
      })
      section.data.forEach(item => {
        rows.push({ type: 'item', key: item.uniqueKey, item })
      })
    })
    return rows
  }, [searchResults])

  useLayoutEffect(() => {
    setSearchSheetRef(searchSheetRef as React.RefObject<BottomSheetMethods>)
  }, [setSearchSheetRef])

  const renderBackdrop = useMemo(
    () => (props: any) =>
      (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.7}
        />
      ),
    []
  )

  const renderRow = useCallback(({ item: row }: { item: SearchRow }) => {
    if (row.type === 'header') {
      return (
        <View
          style={{
            paddingVertical: 6,
            marginTop: 12,
            marginBottom: 8,
            borderBottomWidth: 1,
            borderBottomColor: colors.border
          }}
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              color: colors.teal,
              letterSpacing: 0.5,
              textTransform: 'uppercase'
            }}
          >
            {row.title}
          </Text>
        </View>
      )
    }
    return (
      <SearchResultItem
        item={row.item}
        menuName={row.item.menuName}
        displayPrice={row.item.displayPrice}
        isDisabled={row.item.isDisabled}
        disabledReason={row.item.disabledReason}
      />
    )
  }, [])

  const handleSheetChange = useCallback((index: number) => {
    const open = index >= 0
    setIsOpen(open)
    if (open) {
      // Delay focus slightly so Android opens keyboard after expand animation starts.
      setTimeout(() => {
        inputRef.current?.focus?.()
      }, 80)
    } else {
      // Drop the search text on close so the next open starts clean and we don't
      // hold a filtered result set while hidden.
      setSearchText('')
    }
  }, [])

  return (
    <BottomSheet
      ref={searchSheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose={true}
      onClose={Keyboard.dismiss}
      onChange={handleSheetChange}
      backdropComponent={renderBackdrop}
      keyboardBehavior='extend'
      {...bottomSheetTheme}
    >
      {/* Search header */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 14,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.screen
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              flex: 1,
              borderRadius: 8,
              paddingHorizontal: 12,
              height: 40,
              borderWidth: 1,
              backgroundColor: colors.card,
              borderColor: colors.border,
              gap: 10
            }}
          >
            <Search color={colors.label} size={16} />
            <BottomSheetTextInput
              ref={inputRef}
              value={searchText}
              onChangeText={setSearchText}
              placeholder='Search items...'
              placeholderTextColor={colors.muted}
              style={{
                flex: 1,
                color: colors.heading,
                fontSize: 13,
                fontWeight: '500'
              }}
            />
            {searchText.length > 0 && (
              <TouchableOpacity onPress={() => setSearchText('')}>
                <X color={colors.label} size={16} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity onPress={closeSearch}>
            <Text
              style={{ color: colors.label, fontSize: 13, fontWeight: '600' }}
            >
              Cancel
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <BottomSheetFlatList
        data={searchRows}
        keyExtractor={row => row.key}
        renderItem={renderRow}
        keyboardShouldPersistTaps='handled'
        removeClippedSubviews
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 40
        }}
        ListEmptyComponent={
          <View
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              height: 192,
              marginTop: 40
            }}
          >
            <Search size={48} color={colors.muted} />
            <Text
              style={{
                color: colors.muted,
                marginTop: 12,
                textAlign: 'center',
                fontSize: 13
              }}
            >
              {searchText
                ? `No items found for "${searchText}"`
                : 'No items available'}
            </Text>
          </View>
        }
      />
    </BottomSheet>
  )
})

export default SearchBottomSheet
