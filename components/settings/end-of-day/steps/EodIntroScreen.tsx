import { colors } from '@/lib/theme'
import { CheckCircle2 } from 'lucide-react-native'
import { Text, TouchableOpacity, View } from 'react-native'

interface EodIntroScreenProps {
  locationName: string | null
  dateLabel: string
  isStartEnabled: boolean
  onStart: () => void
  onViewChecklist: () => void
}

export default function EodIntroScreen ({
  locationName,
  dateLabel,
  isStartEnabled,
  onStart,
  onViewChecklist
}: EodIntroScreenProps) {
  return (
    <View style={{ flex: 1, gap: 16 }}>
      <View
        style={{
          borderRadius: 20,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.panel,
          overflow: 'hidden'
        }}
      >
        <View
          style={{
            padding: 18,
            gap: 14,
            backgroundColor: colors.card,
            borderBottomWidth: 1,
            borderBottomColor: colors.border
          }}
        >
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border
              }}
            >
              <Text
                style={{ fontSize: 10, fontWeight: '600', color: colors.label }}
              >
                Guided closeout
              </Text>
            </View>
          </View>

          <View style={{ gap: 8, maxWidth: 540 }}>
            <Text
              style={{
                fontSize: 30,
                lineHeight: 36,
                fontWeight: '800',
                color: colors.heading
              }}
            >
              Close the day with one clean checklist.
            </Text>
            <Text style={{ fontSize: 13, lineHeight: 19, color: colors.label }}>
              Review the full closeout flow in a clear order so the team can
              finish the day without hunting for steps.
            </Text>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <View
              style={{
                flexGrow: 1,
                flexBasis: 180,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                padding: 12,
                gap: 4
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '700',
                  color: colors.teal,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5
                }}
              >
                Date
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: colors.heading
                }}
              >
                {dateLabel}
              </Text>
            </View>

            <View
              style={{
                flexGrow: 1,
                flexBasis: 180,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                padding: 12,
                gap: 4
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '700',
                  color: colors.teal,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5
                }}
              >
                Location
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: colors.heading
                }}
              >
                {locationName || 'Active location'}
              </Text>
            </View>

            <View
              style={{
                flexGrow: 1,
                flexBasis: 180,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                padding: 12,
                gap: 4
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '700',
                  color: colors.teal,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5
                }}
              >
                Flow
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: colors.heading
                }}
              >
                Step-by-step closeout
              </Text>
            </View>
          </View>
        </View>

        <View style={{ padding: 18, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={16} color={colors.teal} />
            <Text
              style={{ fontSize: 13, fontWeight: '700', color: colors.heading }}
            >
              What you’ll cover
            </Text>
          </View>

          <View style={{ gap: 10 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 10
              }}
            >
              <CheckCircle2
                size={16}
                color={colors.teal}
                style={{ marginTop: 2 }}
              />
              <Text
                style={{
                  fontSize: 12,
                  lineHeight: 18,
                  color: colors.label,
                  flex: 1
                }}
              >
                Reconcile tables and open orders first so the floor is clear.
              </Text>
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 10
              }}
            >
              <CheckCircle2
                size={16}
                color={colors.teal}
                style={{ marginTop: 2 }}
              />
              <Text
                style={{
                  fontSize: 12,
                  lineHeight: 18,
                  color: colors.label,
                  flex: 1
                }}
              >
                Close drawers, review tips, and confirm staff clockouts.
              </Text>
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 10
              }}
            >
              <CheckCircle2
                size={16}
                color={colors.teal}
                style={{ marginTop: 2 }}
              />
              <Text
                style={{
                  fontSize: 12,
                  lineHeight: 18,
                  color: colors.label,
                  flex: 1
                }}
              >
                Finish with the report and close the day from one place.
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View
        style={{
          borderRadius: 20,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          padding: 18,
          gap: 14
        }}
      >
        <View style={{ gap: 4 }}>
          <Text
            style={{ fontSize: 15, fontWeight: '800', color: colors.heading }}
          >
            Ready when you are
          </Text>
          <Text
            style={{
              fontSize: 12,
              lineHeight: 18,
              color: colors.label,
              maxWidth: 540
            }}
          >
            Start the closeout to open the wizard immediately. Validation
            updates in the background so the page stays responsive.
          </Text>
        </View>

        <TouchableOpacity
          onPress={onStart}
          disabled={!isStartEnabled}
          style={{
            minHeight: 56,
            borderRadius: 14,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isStartEnabled ? colors.teal : colors.teal + '66',
            opacity: isStartEnabled ? 1 : 0.5
          }}
        >
          <Text
            style={{ fontSize: 14, fontWeight: '800', color: colors.onSolid }}
          >
            Start Close Out
          </Text>
        </TouchableOpacity>

        {/* <TouchableOpacity
          onPress={onViewChecklist}
          style={{
            paddingVertical: 12,
            borderRadius: 10,
            alignItems: "center",
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.panel,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.label }}>
            View checklist only
          </Text>
        </TouchableOpacity> */}
      </View>
    </View>
  )
}
