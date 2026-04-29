import { colors } from '@/lib/theme'
import { Lock, ArrowRight } from 'lucide-react-native'
import React from 'react'
import { Text, TouchableOpacity, View } from 'react-native'

interface ReadOnlyBannerProps {
  /** Display name of the station that currently owns the order. Falls back to a generic label. */
  sourceStationName?: string | null
  /** Disable the take-over button while the claim RPC is in flight. */
  isClaiming?: boolean
  onTakeOver: () => void
}

/**
 * Top-of-bill banner shown when the active order belongs to another station.
 * Pairs with the disabled-state styling on Add-Item / Discount / Tender / More
 * controls — the cashier can see the order but can't mutate the cart until they
 * Take Over via `claim_order_v1`.
 */
const ReadOnlyBanner: React.FC<ReadOnlyBannerProps> = ({
  sourceStationName,
  isClaiming,
  onTakeOver
}) => {
  const stationLabel = sourceStationName?.trim() || 'another station'

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginHorizontal: 12,
        marginTop: 8,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.warning + '55',
        backgroundColor: colors.warning + '15'
      }}
      accessibilityRole='alert'
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          backgroundColor: colors.warning + '25',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Lock size={14} color={colors.warning} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{ fontSize: 12, fontWeight: '700', color: colors.heading }}
        >
          Read-only
        </Text>
        <Text
          style={{ fontSize: 11, color: colors.label, marginTop: 1 }}
          numberOfLines={1}
        >
          Owned by {stationLabel}. Take over to edit.
        </Text>
      </View>
      <TouchableOpacity
        onPress={onTakeOver}
        disabled={isClaiming}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 8,
          backgroundColor: isClaiming ? colors.muted + '30' : colors.teal,
          opacity: isClaiming ? 0.6 : 1
        }}
        accessibilityRole='button'
        accessibilityLabel='Take over this order'
      >
        <Text
          style={{ color: colors.onSolid, fontSize: 12, fontWeight: '700' }}
        >
          {isClaiming ? 'Taking over…' : 'Take Over'}
        </Text>
        {!isClaiming && <ArrowRight size={12} color={colors.onSolid} />}
      </TouchableOpacity>
    </View>
  )
}

export default React.memo(ReadOnlyBanner)
