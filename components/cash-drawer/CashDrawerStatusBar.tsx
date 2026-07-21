/**
 * CashDrawerStatusBar
 *
 * Compact bar rendered above the main flex-row in order-processing.
 * Shows drawer status, running balance, and quick-action buttons.
 */

import { colors } from '@/lib/theme'
import { useCashDrawerStore } from '@/stores/useCashDrawerStore'
import { useLocationConfigStore } from '@/stores/useLocationConfigStore'
import { formatCurrency } from '@/utils/currency'
import { DollarSign } from 'lucide-react-native'
import React, { useEffect } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'

interface CashDrawerStatusBarProps {
  onManagePress: () => void
  onNoSalePress: () => void
}

const CashDrawerStatusBar: React.FC<CashDrawerStatusBarProps> = ({
  onManagePress,
  onNoSalePress
}) => {
  const drawerId = useCashDrawerStore(s => s.drawerId)
  const drawerName = useCashDrawerStore(s => s.drawerName)
  const activeSession = useCashDrawerStore(s => s.activeSession)
  const operations = useCashDrawerStore(s => s.operations)
  const getRunningBalance = useCashDrawerStore(s => s.getRunningBalance)
  const getNoSaleCount = useCashDrawerStore(s => s.getNoSaleCount)
  const shouldPromptOpen = useCashDrawerStore(s => s.shouldPromptOpen)
  const setShouldPromptOpen = useCashDrawerStore(s => s.setShouldPromptOpen)
  const noSaleAlertThreshold = useLocationConfigStore(
    s => s.config.cashDrawer.noSaleAlertThreshold
  )

  // Post-clock-in prompt: auto-open drawer sheet when flagged
  useEffect(() => {
    if (shouldPromptOpen) {
      setShouldPromptOpen(false)
      onManagePress()
    }
  }, [shouldPromptOpen, setShouldPromptOpen, onManagePress])

  if (!drawerId) return null

  const isOpen = activeSession?.status === 'open'
  const balance = isOpen ? getRunningBalance() : 0

  if (!isOpen) {
    return (
      <TouchableOpacity
        onPress={onManagePress}
        className='h-10 flex-row items-center justify-center bg-surface border-b border-border px-4'
      >
        <View
          className='w-2 h-2 rounded-full mr-2'
          style={{ backgroundColor: colors.muted }}
        />
        <Text className='text-sm text-label'>Drawer Closed — Tap to Open</Text>
      </TouchableOpacity>
    )
  }

  return (
    <View className='h-10 flex-row items-center bg-surface border-b border-border px-4'>
      {/* Left: Drawer name + status */}
      <View className='flex-row items-center flex-1'>
        <View
          className='w-2 h-2 rounded-full mr-2'
          style={{ backgroundColor: colors.success }}
        />
        <Text
          className='text-sm font-medium mr-2'
          style={{ color: colors.heading }}
        >
          {drawerName || 'Drawer'}
        </Text>
        <Text
          className='text-xs font-semibold'
          style={{ color: colors.success }}
        >
          Open
        </Text>
      </View>

      {/* Center: Running balance */}
      <View className='flex-row items-center'>
        <DollarSign size={14} color={colors.teal} />
        <Text
          className='text-sm font-bold ml-0.5'
          style={{ color: colors.teal }}
        >
          {formatCurrency(balance)}
        </Text>
      </View>

      {/* Right: Action buttons */}
      <View className='flex-1 flex-row items-center justify-end gap-2'>
        <TouchableOpacity
          onPress={onNoSalePress}
          className='px-3 py-1 rounded-md flex-row items-center'
          style={{
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border
          }}
        >
          <Text
            className='text-xs font-semibold'
            style={{ color: colors.label }}
          >
            No Sale
          </Text>
          {getNoSaleCount() > 0 && (
            <View
              className='ml-1.5 px-1.5 py-0.5 rounded-full'
              style={{
                backgroundColor:
                  noSaleAlertThreshold > 0 &&
                  getNoSaleCount() >= noSaleAlertThreshold
                    ? colors.danger
                    : colors.muted
              }}
            >
              <Text
                className='text-[10px] font-bold'
                style={{ color: colors.onSolid }}
              >
                {getNoSaleCount()}
              </Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onManagePress}
          className='px-3 py-1 rounded-md'
          style={{
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border
          }}
        >
          <Text
            className='text-xs font-semibold'
            style={{ color: colors.label }}
          >
            Manage
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

export default React.memo(CashDrawerStatusBar)
