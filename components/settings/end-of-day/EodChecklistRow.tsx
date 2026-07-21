import { colors } from '@/lib/theme'
import { ChecklistStatus } from '@/stores/useEndOfDayStore'
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  Minus
} from 'lucide-react-native'
import React from 'react'
import {
  StyleProp,
  Text,
  TouchableOpacity,
  View,
  ViewStyle
} from 'react-native'
import { useUiScale } from '@/lib/uiScale'

const ICON_SIZE = 16

const STATUS_CONFIG: Record<
  ChecklistStatus,
  { color: string; icon: React.ReactNode; label: string }
> = {
  pending: {
    color: colors.label,
    icon: <Clock size={ICON_SIZE} color={colors.label} />,
    label: 'Pending'
  },
  in_progress: {
    color: colors.info,
    icon: <Loader2 size={ICON_SIZE} color={colors.info} />,
    label: 'In progress'
  },
  passed: {
    color: colors.teal,
    icon: <CheckCircle size={ICON_SIZE} color={colors.teal} />,
    label: 'Passed'
  },
  failed: {
    color: colors.danger,
    icon: <AlertCircle size={ICON_SIZE} color={colors.danger} />,
    label: 'Failed'
  },
  skipped: {
    color: colors.muted,
    icon: <Minus size={ICON_SIZE} color={colors.muted} />,
    label: 'Skipped'
  }
}

interface EodChecklistRowProps {
  title: string
  description?: string
  status: ChecklistStatus
  detail?: string
  actionLabel?: string
  onPress?: () => void
  containerStyle?: StyleProp<ViewStyle>
  actionOnly?: boolean
  centerContent?: boolean
}

export default function EodChecklistRow ({
  title,
  description,
  status,
  detail,
  actionLabel,
  onPress,
  containerStyle,
  actionOnly = false,
  centerContent = false
}: EodChecklistRowProps) {
  const scale = useUiScale()
  const s = (value: number) => Math.round(value * scale)
  const statusInfo = STATUS_CONFIG[status]
  const isCardPressable = !!onPress && !actionOnly
  const isActionPressable = !!onPress

  return (
    <TouchableOpacity
      onPress={isCardPressable ? onPress : undefined}
      disabled={!isCardPressable}
      activeOpacity={0.9}
      style={[
        {
          borderRadius: s(12),
          borderWidth: 1,
          borderColor: colors.border,
          borderLeftWidth: 3,
          borderLeftColor: statusInfo.color,
          backgroundColor: colors.panel,
          paddingHorizontal: s(10),
          paddingVertical: s(8),
          opacity: onPress ? 1 : 0.92
        },
        containerStyle
      ]}
    >
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: centerContent ? 'center' : 'flex-start',
          gap: s(8)
        }}
      >
        <View
          style={{
            height: s(22),
            justifyContent: 'center',
            marginTop: centerContent ? 0 : s(1),
            opacity: 0.95
          }}
        >
          {statusInfo.icon}
        </View>
        <View
          style={{
            flex: 1,
            gap: s(4),
            justifyContent: centerContent ? 'center' : 'space-between'
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: s(8),
              minHeight: centerContent ? undefined : s(22)
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: s(6),
                flex: 1,
                minWidth: 0
              }}
            >
              <Text
                style={{
                  fontSize: s(12.5),
                  fontWeight: '700',
                  color: colors.heading
                }}
                numberOfLines={1}
              >
                {title}
              </Text>
              <View
                style={{
                  borderRadius: s(20),
                  paddingHorizontal: s(7),
                  paddingVertical: s(2),
                  backgroundColor: statusInfo.color + '1a'
                }}
              >
                <Text
                  style={{
                    fontSize: s(9.5),
                    fontWeight: '700',
                    color: statusInfo.color
                  }}
                >
                  {statusInfo.label}
                </Text>
              </View>
            </View>
          </View>
          {description ? (
            <Text
              style={{ fontSize: s(10.5), color: colors.label, lineHeight: s(14) }}
              numberOfLines={1}
            >
              {description}
            </Text>
          ) : null}
          {detail ? (
            <Text
              style={{
                fontSize: s(9.5),
                fontWeight: '600',
                color: status === 'failed' ? colors.danger : colors.label
              }}
              numberOfLines={1}
            >
              {detail}
            </Text>
          ) : null}
        </View>

        {actionLabel ? (
          <View style={{ alignSelf: 'stretch', justifyContent: 'center' }}>
            <TouchableOpacity
              onPress={isActionPressable ? onPress : undefined}
              disabled={!isActionPressable}
              style={{
                borderRadius: s(8),
                backgroundColor: colors.teal + '20',
                borderWidth: 1,
                borderColor: colors.teal + '50',
                paddingHorizontal: s(8),
                paddingVertical: s(4),
                opacity: isActionPressable ? 1 : 0.6
              }}
            >
              <Text
                style={{
                  fontSize: s(10.5),
                  fontWeight: '700',
                  color: colors.teal
                }}
              >
                {actionLabel}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  )
}
