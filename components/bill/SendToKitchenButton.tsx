import { colors } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import {
  selectIsOpen as selectModifierIsOpen,
  useModifierSidebarStore
} from '@/stores/useModifierSidebarStore'
import { Printer } from 'lucide-react-native'
import React from 'react'
import { Text, TouchableOpacity } from 'react-native'

/**
 * Top-level "Send" button for non-table (BillSection) orders. Self-subscribes
 * to the modifier-sidebar store so opening/closing the modifier screen only
 * re-renders this small button instead of the entire bill panel.
 */
export const SendToKitchenButton = React.memo(function SendToKitchenButton ({
  onPress,
  extraDisabled
}: {
  onPress: () => void
  extraDisabled: boolean
}) {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const isModifierScreenOpen = useModifierSidebarStore(selectModifierIsOpen)
  const disabled = extraDisabled || isModifierScreenOpen

  return (
    <TouchableOpacity
      className={`h-8 px-3 rounded-lg flex-row items-center justify-center gap-1 ${
        disabled ? 'opacity-50' : ''
      }`}
      style={{ backgroundColor: colors.teal }}
      disabled={disabled}
      onPress={onPress}
    >
      <Printer size={s(12)} color={colors.onSolid} />
      <Text
        style={{
          color: colors.onSolid,
          fontSize: s(12),
          fontWeight: '500'
        }}
      >
        Send
      </Text>
    </TouchableOpacity>
  )
})

/**
 * Per-course "Send" button used by CourseSubHeader (TableBillSection) and
 * CourseGroup (CourseAccordion). Self-subscribes to the modifier-sidebar
 * store so its parent doesn't need to.
 */
export const SendCourseButton = React.memo(function SendCourseButton ({
  onPress
}: {
  onPress: () => void
}) {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const isModifierScreenOpen = useModifierSidebarStore(selectModifierIsOpen)

  return (
    <TouchableOpacity
      disabled={isModifierScreenOpen}
      onPress={e => {
        e.stopPropagation()
        onPress()
      }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(4),
        paddingHorizontal: s(10),
        height: s(24),
        borderRadius: s(6),
        backgroundColor: colors.teal,
        opacity: isModifierScreenOpen ? 0.4 : 1
      }}
      activeOpacity={0.8}
    >
      <Printer size={s(11)} color={colors.onSolid} />
      <Text style={{ color: colors.onSolid, fontSize: s(11), fontWeight: '600' }}>
        Send
      </Text>
    </TouchableOpacity>
  )
})

/**
 * "Send All to Kitchen" button used by DenseSeatView and CourseAccordion.
 * Self-subscribes to the modifier-sidebar store so its parent doesn't need to.
 */
export const SendAllButton = React.memo(function SendAllButton ({
  onPress,
  unsentCount
}: {
  onPress: () => void
  unsentCount: number
}) {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const isModifierScreenOpen = useModifierSidebarStore(selectModifierIsOpen)
  const disabled = unsentCount === 0 || isModifierScreenOpen

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(4),
        paddingHorizontal: s(9),
        paddingVertical: s(5),
        borderRadius: s(6),
        backgroundColor: colors.teal,
        opacity: disabled ? 0.4 : 1
      }}
      activeOpacity={0.8}
    >
      <Printer size={s(12)} color={colors.onSolid} />
      <Text
        style={{
          fontSize: s(10),
          fontWeight: '600',
          color: colors.onSolid
        }}
      >
        Send All{unsentCount > 0 ? ` (${unsentCount})` : ''}
      </Text>
    </TouchableOpacity>
  )
})
