import { colors } from '@/lib/theme'
import { usePaymentStore } from '@/stores/usePaymentStore'
import { ArrowRight, Check } from 'lucide-react-native'
import { Text, TouchableOpacity, View } from 'react-native'
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated'

const SplitPaymentSuccessView = () => {
  const splits = usePaymentStore(s => s.splits)
  const activeSplitId = usePaymentStore(s => s.activeSplitId)
  const moveToNextSplit = usePaymentStore(s => s.moveToNextSplit)

  const justPaidSplit = splits.find(s => s.id === activeSplitId)
  const nextSplit = splits.find(s => s.status === 'pending')

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.screen,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16
      }}
    >
      {/* Success Icon */}
      <Animated.View
        entering={FadeIn.delay(100)}
        style={{ alignItems: 'center', marginBottom: 20, marginTop: 20 }}
      >
        <View
          style={{
            width: 80,
            height: 80,
            backgroundColor: colors.success + '15',
            borderRadius: 40,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 20,
            borderWidth: 2,
            borderColor: colors.success + '40'
          }}
        >
          <Check color={colors.success} size={44} strokeWidth={3.5} />
        </View>

        <Text
          style={{
            fontSize: 28,
            fontWeight: '800',
            color: colors.heading,
            marginBottom: 8,
            textAlign: 'center'
          }}
        >
          Payment Received
        </Text>
        <Text
          style={{
            fontSize: 14,
            color: colors.label,
            textAlign: 'center',
            lineHeight: 20
          }}
        >
          {justPaidSplit?.customerName} is all set!
        </Text>
      </Animated.View>

      {/* Next Guest Info */}
      {nextSplit && (
        <Animated.View
          entering={FadeInUp.delay(200)}
          style={{
            width: '100%',
            backgroundColor: colors.panel,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 16,
            marginBottom: 20
          }}
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              color: colors.muted,
              marginBottom: 8
            }}
          >
            Next Guest
          </Text>
          <Text
            style={{ fontSize: 16, fontWeight: '700', color: colors.heading }}
          >
            {nextSplit.customerName}
          </Text>
        </Animated.View>
      )}

      {/* Action Button */}
      <TouchableOpacity
        onPress={moveToNextSplit}
        style={{
          width: '100%',
          paddingVertical: 12,
          backgroundColor: colors.teal,
          borderRadius: 10,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          shadowColor: colors.teal,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.25,
          shadowRadius: 8,
          elevation: 6
        }}
      >
        <Text
          style={{ color: colors.onSolid, fontWeight: '700', fontSize: 14 }}
        >
          Pay for {nextSplit?.customerName || 'Next Guest'}
        </Text>
        <ArrowRight size={16} color={colors.onSolid} />
      </TouchableOpacity>
    </View>
  )
}

export default SplitPaymentSuccessView
