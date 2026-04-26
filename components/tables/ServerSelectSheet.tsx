import { bottomSheetTheme, colors } from '@/lib/theme'
import { useEmployeeStore } from '@/stores/useEmployeeStore'
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetSectionList,
  BottomSheetTextInput,
  BottomSheetView
} from '@gorhom/bottom-sheet'
import { Check, Search, X } from 'lucide-react-native'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'

interface ServerSelectSheetProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (fullName: string) => void
  currentServer?: string | null
}

const ServerSelectSheet: React.FC<ServerSelectSheetProps> = ({
  isOpen,
  onClose,
  onSelect,
  currentServer
}) => {
  const sheetRef = useRef<BottomSheetModal>(null)
  const snapPoints = useMemo(() => ['60%', '85%'], [])
  const [search, setSearch] = useState('')

  const employees = useEmployeeStore(s => s.employees)

  const clockedInEmployees = useMemo(() => {
    const normalizedCurrent = currentServer?.trim().toLowerCase()
    const filtered = employees.filter(
      e =>
        e.shiftStatus === 'clocked_in' &&
        (!normalizedCurrent || e.fullName.toLowerCase() !== normalizedCurrent)
    )
    if (!search.trim()) return filtered
    const q = search.toLowerCase()
    return filtered.filter(e => e.fullName.toLowerCase().includes(q))
  }, [employees, search, currentServer])

  const groupedEmployees = useMemo(() => {
    const map: Record<string, typeof clockedInEmployees> = {}
    for (const e of clockedInEmployees) {
      const first = (e.fullName || '?')[0].toUpperCase()
      const key = /[A-Z]/.test(first) ? first : '#'
      if (!map[key]) map[key] = []
      map[key].push(e)
    }
    const letters = Object.keys(map).sort((a, b) => {
      if (a === '#') return 1
      if (b === '#') return -1
      return a.localeCompare(b)
    })
    return letters.map(letter => ({ title: letter, data: map[letter] }))
  }, [clockedInEmployees])

  const handleSelect = useCallback(
    (fullName: string) => {
      onSelect(fullName)
      setSearch('')
    },
    [onSelect]
  )

  const handleClose = useCallback(() => {
    setSearch('')
    onClose()
  }, [onClose])

  // Sync open/close state with the sheet ref
  useEffect(() => {
    if (isOpen) {
      sheetRef.current?.present()
    } else {
      sheetRef.current?.dismiss()
    }
  }, [isOpen])

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
      />
    ),
    []
  )

  const renderItem = useCallback(
    ({ item }: { item: typeof clockedInEmployees[0] }) => {
      const isSelected =
        currentServer?.toLowerCase() === item.fullName.toLowerCase()

      return (
        <TouchableOpacity
          onPress={() => handleSelect(item.fullName)}
          activeOpacity={0.7}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.border + '50'
          }}
        >
          {/* Avatar circle */}
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: colors.teal + '20',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 12
            }}
          >
            <Text
              style={{ color: colors.teal, fontSize: 13, fontWeight: '700' }}
            >
              {item.fullName.charAt(0).toUpperCase()}
            </Text>
          </View>

          {/* Name + role */}
          <View style={{ flex: 1 }}>
            <Text
              style={{ color: colors.heading, fontSize: 13, fontWeight: '500' }}
            >
              {item.fullName}
            </Text>
            {item.role && (
              <Text
                style={{
                  color: colors.muted,
                  fontSize: 11,
                  marginTop: 2,
                  textTransform: 'capitalize'
                }}
              >
                {item.role}
              </Text>
            )}
          </View>

          {/* Checkmark if selected */}
          {isSelected && <Check color={colors.teal} size={20} />}
        </TouchableOpacity>
      )
    },
    [currentServer, handleSelect]
  )

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      enableDynamicSizing={false}
      onDismiss={handleClose}
      backdropComponent={renderBackdrop}
      backgroundStyle={bottomSheetTheme.backgroundStyle}
      handleIndicatorStyle={bottomSheetTheme.handleIndicatorStyle}
      enablePanDownToClose
    >
      <BottomSheetView style={{ flex: 1, backgroundColor: colors.panel }}>
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingBottom: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.border
          }}
        >
          <Text
            style={{ color: colors.heading, fontSize: 15, fontWeight: '600' }}
          >
            Assign Server
          </Text>
          <TouchableOpacity onPress={handleClose} style={{ padding: 4 }}>
            <X color={colors.muted} size={20} />
          </TouchableOpacity>
        </View>

        {/* Search bar */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginHorizontal: 16,
            marginVertical: 12,
            paddingHorizontal: 12,
            paddingVertical: 8,
            backgroundColor: colors.card,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border
          }}
        >
          <Search color={colors.muted} size={16} />
          <BottomSheetTextInput
            value={search}
            onChangeText={setSearch}
            placeholder='Search employees...'
            placeholderTextColor={colors.muted}
            style={{
              flex: 1,
              color: colors.heading,
              fontSize: 13,
              marginLeft: 8,
              padding: 0
            }}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <X color={colors.muted} size={14} />
            </TouchableOpacity>
          )}
        </View>

        {/* Employee list */}
        <BottomSheetSectionList
          sections={groupedEmployees}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          renderSectionHeader={({ section }) => (
            <View
              style={{
                paddingVertical: 4,
                paddingHorizontal: 16,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                marginBottom: 4,
                backgroundColor: colors.panel
              }}
            >
              <Text
                style={{
                  color: colors.teal,
                  fontSize: 11,
                  fontWeight: '700',
                  letterSpacing: 1
                }}
              >
                {section.title}
              </Text>
            </View>
          )}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
              <Text style={{ color: colors.muted, fontSize: 13 }}>
                {search
                  ? 'No matching employees found'
                  : 'No other clocked-in employees'}
              </Text>
            </View>
          }
        />
      </BottomSheetView>
    </BottomSheetModal>
  )
}

export default ServerSelectSheet
