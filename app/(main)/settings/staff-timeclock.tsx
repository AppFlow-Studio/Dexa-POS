import { Switch } from '@/components/ui/switch'
import { colors } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import { useLocationConfigStore } from '@/stores/useLocationConfigStore'
import { Clock, UserCheck } from 'lucide-react-native'
import { ScrollView, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const StaffTimeclockScreen = () => {
  const insets = useSafeAreaInsets()
  const timeclock = useLocationConfigStore(s => s.config.timeclock)
  const updateConfig = useLocationConfigStore(s => s.updateConfig)

  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)

  const cardStyle = {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: s(12),
    padding: s(12),
    marginBottom: s(10),
  }

  const sectionTitleStyle = {
    fontSize: s(13),
    fontWeight: '700' as const,
    color: colors.heading,
  }

  const rowStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  }

  const rowTitleStyle = {
    fontSize: s(13),
    color: colors.heading,
    fontWeight: '500' as const,
  }

  const rowMetaStyle = {
    fontSize: s(10),
    color: colors.muted,
    marginTop: s(1),
  }

  const iconBoxStyle = {
    width: s(32),
    height: s(32),
    borderRadius: s(8),
    backgroundColor: colors.teal + '15',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  }

  const inputStyle = {
    backgroundColor: colors.screen,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: s(8),
    paddingHorizontal: s(10),
    paddingVertical: s(6),
    fontSize: s(13),
    color: colors.heading,
    height: s(34),
    textAlignVertical: 'center' as const,
    width: s(70),
    textAlign: 'center' as const,
  }

  const dividerStyle = {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: s(10),
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen, paddingHorizontal: s(14), paddingVertical: s(10) }}>
      <View style={{ marginBottom: s(10) }}>
        <Text style={{ fontSize: s(15), fontWeight: '700', color: colors.heading }}>Staff Timeclock</Text>
        <Text style={{ fontSize: s(11), color: colors.label, marginTop: s(1) }}>
          Break policies and clock-in requirements.
        </Text>
      </View>

      <View style={{ height: 1, backgroundColor: colors.border, marginBottom: s(10) }} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + s(12) }}>
        {/* Break Settings */}
        <View style={cardStyle}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8), marginBottom: s(12) }}>
            <View style={iconBoxStyle}>
              <Clock size={s(16)} color={colors.teal} />
            </View>
            <Text style={sectionTitleStyle}>Break Settings</Text>
          </View>

          <View style={{ gap: s(10) }}>
            <View style={rowStyle}>
              <View style={{ flex: 1, paddingRight: s(12) }}>
                <Text style={rowTitleStyle}>Break & Switch</Text>
                <Text style={rowMetaStyle}>Allow employees to switch accounts during a break</Text>
              </View>
              <Switch
                checked={timeclock.breakAndSwitchEnabled}
                onCheckedChange={v => updateConfig('timeclock', { breakAndSwitchEnabled: v })}
              />
            </View>

            <View style={dividerStyle} />

            <View style={rowStyle}>
              <View style={{ flex: 1, paddingRight: s(12) }}>
                <Text style={rowTitleStyle}>Default Break Duration</Text>
                <Text style={rowMetaStyle}>Minutes</Text>
              </View>
              <TextInput
                style={inputStyle}
                value={timeclock.breakDurationMinutes.toString()}
                onChangeText={v => updateConfig('timeclock', { breakDurationMinutes: parseInt(v) || 30 })}
                keyboardType='numeric'
              />
            </View>
          </View>
        </View>

        {/* Clock-In Policy */}
        <View style={cardStyle}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8), marginBottom: s(12) }}>
            <View style={iconBoxStyle}>
              <UserCheck size={s(16)} color={colors.teal} />
            </View>
            <Text style={sectionTitleStyle}>Clock-In Policy</Text>
          </View>

          <View style={{ gap: s(10) }}>
            <View style={rowStyle}>
              <View style={{ flex: 1, paddingRight: s(12) }}>
                <Text style={rowTitleStyle}>Require PIN on Clock-In</Text>
                <Text style={rowMetaStyle}>Employee must enter PIN to clock in</Text>
              </View>
              <Switch
                checked={timeclock.clockInRequirePin}
                onCheckedChange={v => updateConfig('timeclock', { clockInRequirePin: v })}
              />
            </View>

            <View style={rowStyle}>
              <View style={{ flex: 1, paddingRight: s(12) }}>
                <Text style={rowTitleStyle}>Prevent Early Clock-In</Text>
                <Text style={rowMetaStyle}>Block clock-in before scheduled shift start</Text>
              </View>
              <Switch
                checked={timeclock.preventEarlyClockIn}
                onCheckedChange={v => updateConfig('timeclock', { preventEarlyClockIn: v })}
              />
            </View>

            <View style={rowStyle}>
              <View style={{ flex: 1, paddingRight: s(12) }}>
                <Text style={rowTitleStyle}>Prevent Clock-Out with Open Orders</Text>
                <Text style={rowMetaStyle}>Block clock-out if employee has open orders</Text>
              </View>
              <Switch
                checked={timeclock.preventOpenOrdersClockOut}
                onCheckedChange={v => updateConfig('timeclock', { preventOpenOrdersClockOut: v })}
              />
            </View>

          </View>
        </View>
      </ScrollView>
    </View>
  )
}

export default StaffTimeclockScreen
