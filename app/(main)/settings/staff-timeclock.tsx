import { Switch } from '@/components/ui/switch'
import { colors } from '@/lib/theme'
import { useLocationConfigStore } from '@/stores/useLocationConfigStore'
import { Clock, UserCheck } from 'lucide-react-native'
import { ScrollView, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const StaffTimeclockScreen = () => {
  const insets = useSafeAreaInsets()
  const timeclock = useLocationConfigStore(s => s.config.timeclock)
  const updateConfig = useLocationConfigStore(s => s.updateConfig)

  const cardStyle = {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  }

  const sectionTitleStyle = {
    fontSize: 13,
    fontWeight: '700' as const,
    color: colors.heading,
  }

  const rowStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  }

  const rowTitleStyle = {
    fontSize: 13,
    color: colors.heading,
    fontWeight: '500' as const,
  }

  const rowMetaStyle = {
    fontSize: 10,
    color: colors.muted,
    marginTop: 1,
  }

  const iconBoxStyle = {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.teal + '15',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  }

  const inputStyle = {
    backgroundColor: colors.screen,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: colors.heading,
    height: 34,
    textAlignVertical: 'center' as const,
    width: 70,
    textAlign: 'center' as const,
  }

  const dividerStyle = {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 10,
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen, paddingHorizontal: 14, paddingVertical: 10 }}>
      <View style={{ marginBottom: 10 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.heading }}>Staff Timeclock</Text>
        <Text style={{ fontSize: 11, color: colors.label, marginTop: 1 }}>
          Break policies and clock-in requirements.
        </Text>
      </View>

      <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 10 }} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 12 }}>
        {/* Break Settings */}
        <View style={cardStyle}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <View style={iconBoxStyle}>
              <Clock size={16} color={colors.teal} />
            </View>
            <Text style={sectionTitleStyle}>Break Settings</Text>
          </View>

          <View style={{ gap: 10 }}>
            <View style={rowStyle}>
              <View style={{ flex: 1, paddingRight: 12 }}>
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
              <View style={{ flex: 1, paddingRight: 12 }}>
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <View style={iconBoxStyle}>
              <UserCheck size={16} color={colors.teal} />
            </View>
            <Text style={sectionTitleStyle}>Clock-In Policy</Text>
          </View>

          <View style={{ gap: 10 }}>
            <View style={rowStyle}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={rowTitleStyle}>Require PIN on Clock-In</Text>
                <Text style={rowMetaStyle}>Employee must enter PIN to clock in</Text>
              </View>
              <Switch
                checked={timeclock.clockInRequirePin}
                onCheckedChange={v => updateConfig('timeclock', { clockInRequirePin: v })}
              />
            </View>

            <View style={rowStyle}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={rowTitleStyle}>Prevent Early Clock-In</Text>
                <Text style={rowMetaStyle}>Block clock-in before scheduled shift start</Text>
              </View>
              <Switch
                checked={timeclock.preventEarlyClockIn}
                onCheckedChange={v => updateConfig('timeclock', { preventEarlyClockIn: v })}
              />
            </View>

            <View style={rowStyle}>
              <View style={{ flex: 1, paddingRight: 12 }}>
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
