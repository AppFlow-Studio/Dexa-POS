import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { colors } from '@/lib/theme'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { useWaitlistStore } from '@/stores/useWaitlistStore'
import {
  CalendarDays,
  Check,
  ChevronRight,
  Clock,
  MessageSquare,
  Users,
  X
} from 'lucide-react-native'
import { useState } from 'react'
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const WaitlistScreen = () => {
  const insets = useSafeAreaInsets()
  const { waitlist, removeWaitlistEntry } = useWaitlistStore()
  const waitlistNotificationGracePeriodMinutes = useStoreSettingsStore(
    s => s.waitlistNotificationGracePeriodMinutes
  )
  const updateStoreSetting = useStoreSettingsStore(s => s.updateField)

  // Waitlist Configuration
  const [enableWaitlist, setEnableWaitlist] = useState(true)
  const [autoSmsEnabled, setAutoSmsEnabled] = useState(true)
  const [smsTemplate, setSmsTemplate] = useState(
    'Hi {name}, your table for {party_size} at Dexa Bistro is ready! Please check in with the host within 5 minutes.'
  )

  // Reservation Configuration
  const [enableReservations, setEnableReservations] = useState(true)
  const [daysAhead, setDaysAhead] = useState('30')
  const [maxGuestsPerSlot, setMaxGuestsPerSlot] = useState('6')
  const [slotDuration, setSlotDuration] = useState('90')
  const [requireDeposit, setRequireDeposit] = useState(false)
  const [depositAmount, setDepositAmount] = useState('20')
  const [cancellationPolicy, setCancellationPolicy] = useState(
    'Cancellations must be made 24 hours in advance to receive a full refund.'
  )

  // Mock Reservation Data for Timeline
  const mockReservations = [
    { time: '6:00 PM', name: 'Johnson', party: 4 },
    { time: '6:30 PM', name: 'Williams', party: 2 },
    { time: '7:00 PM', name: 'Davis', party: 6 },
    { time: '7:15 PM', name: 'Miller', party: 3 }
  ]

  const avgWaitTime =
    waitlist.length > 0
      ? Math.round(
          waitlist.reduce((acc, curr) => acc + curr.quotedTime, 0) /
            waitlist.length
        )
      : 0

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen, padding: 20 }}>
      {/* Page Header */}
      <View style={{ marginBottom: 4 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.heading }}>
          Waitlist & Reservations
        </Text>
        <Text style={{ fontSize: 12, color: colors.label, marginTop: 2 }}>
          Manage digital waitlist and reservation settings.
        </Text>
      </View>

      <View
        style={{ height: 1, backgroundColor: colors.border, marginVertical: 14 }}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20, gap: 14 }}
      >
        {/* Digital Waitlist Section */}
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
          }}
        >
          {/* Section Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                backgroundColor: colors.teal + '15',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 10,
              }}
            >
              <Users size={16} color={colors.teal} />
            </View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.heading }}>
              Digital Waitlist
            </Text>
          </View>

          <View style={{ padding: 12, gap: 14 }}>
            {/* Enable Toggle */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.heading }}>
                Enable Digital Waitlist
              </Text>
              <Switch
                checked={enableWaitlist}
                onCheckedChange={setEnableWaitlist}
              />
            </View>

            {enableWaitlist && (
              <>
                <View style={{ height: 1, backgroundColor: colors.border }} />

                {/* Live Dashboard */}
                <View style={{ gap: 10 }}>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '700',
                      color: colors.muted,
                      textTransform: 'uppercase',
                      letterSpacing: 0.8,
                    }}
                  >
                    Live Dashboard
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View
                      style={{
                        flex: 1,
                        backgroundColor: colors.card,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: colors.border,
                        padding: 12,
                      }}
                    >
                      <Text style={{ fontSize: 11, color: colors.label }}>Waiting</Text>
                      <Text
                        style={{ fontSize: 22, fontWeight: '700', color: colors.heading, marginTop: 2 }}
                      >
                        {waitlist.length}
                      </Text>
                    </View>
                    <View
                      style={{
                        flex: 1,
                        backgroundColor: colors.card,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: colors.border,
                        padding: 12,
                      }}
                    >
                      <Text style={{ fontSize: 11, color: colors.label }}>Avg Wait</Text>
                      <Text
                        style={{ fontSize: 22, fontWeight: '700', color: colors.teal, marginTop: 2 }}
                      >
                        {avgWaitTime}m
                      </Text>
                    </View>
                  </View>

                  {/* Active Waitlist Items */}
                  <View
                    style={{
                      backgroundColor: colors.card,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: colors.border,
                      overflow: 'hidden',
                    }}
                  >
                    <View
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderBottomWidth: 1,
                        borderBottomColor: colors.border,
                        backgroundColor: colors.panel,
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '600', color: colors.heading }}>
                        Active Parties
                      </Text>
                    </View>
                    {waitlist.length === 0 ? (
                      <View style={{ padding: 20, alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, color: colors.muted }}>
                          Waitlist is empty
                        </Text>
                      </View>
                    ) : (
                      waitlist.slice(0, 3).map(entry => (
                        <View
                          key={entry.id}
                          style={{
                            padding: 12,
                            borderBottomWidth: 1,
                            borderBottomColor: colors.border,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <View>
                            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.heading }}>
                              {entry.name}
                            </Text>
                            <Text style={{ fontSize: 11, color: colors.label, marginTop: 1 }}>
                              Party of {entry.partySize} · {entry.quotedTime}m quote
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', gap: 6 }}>
                            <TouchableOpacity
                              style={{
                                padding: 7,
                                backgroundColor: colors.info + '20',
                                borderRadius: 7,
                                borderWidth: 1,
                                borderColor: colors.info + '50',
                              }}
                            >
                              <MessageSquare size={14} color={colors.info} />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={{
                                padding: 7,
                                backgroundColor: colors.success + '20',
                                borderRadius: 7,
                                borderWidth: 1,
                                borderColor: colors.success + '50',
                              }}
                            >
                              <Check size={14} color={colors.success} />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => removeWaitlistEntry(entry.id)}
                              style={{
                                padding: 7,
                                backgroundColor: colors.danger + '15',
                                borderRadius: 7,
                                borderWidth: 1,
                                borderColor: colors.danger + '30',
                              }}
                            >
                              <X size={14} color={colors.danger} />
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))
                    )}
                    {waitlist.length > 3 && (
                      <View
                        style={{
                          padding: 8,
                          alignItems: 'center',
                          borderTopWidth: 1,
                          borderTopColor: colors.border,
                        }}
                      >
                        <Text style={{ fontSize: 11, color: colors.muted }}>
                          +{waitlist.length - 3} more
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                <View style={{ height: 1, backgroundColor: colors.border }} />

                {/* SMS Configuration */}
                <View style={{ gap: 12 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.heading }}>
                      Auto-SMS When Ready
                    </Text>
                    <Switch
                      checked={autoSmsEnabled}
                      onCheckedChange={setAutoSmsEnabled}
                    />
                  </View>
                  {autoSmsEnabled && (
                    <View>
                      <Text style={{ fontSize: 12, color: colors.label, marginBottom: 6 }}>
                        SMS Template
                      </Text>
                      <TextInput
                        multiline
                        numberOfLines={3}
                        style={{
                          backgroundColor: colors.card,
                          borderWidth: 1,
                          borderColor: colors.border,
                          borderRadius: 8,
                          padding: 10,
                          color: colors.heading,
                          fontSize: 12,
                          height: 80,
                          textAlignVertical: 'top',
                        }}
                        value={smsTemplate}
                        onChangeText={setSmsTemplate}
                        textAlignVertical="top"
                        placeholderTextColor={colors.muted}
                      />
                      <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>
                        Available variables: {'{name}'}, {'{party_size}'}
                      </Text>
                    </View>
                  )}

                  <View>
                    <Text style={{ fontSize: 12, color: colors.label, marginBottom: 6 }}>
                      No-show grace period after notification (minutes)
                    </Text>
                    <Input
                      className="bg-screen border-gray-600 text-white h-10"
                      value={String(waitlistNotificationGracePeriodMinutes ?? 10)}
                      onChangeText={value => {
                        const parsed = parseInt(value || '10', 10)
                        updateStoreSetting(
                          'waitlistNotificationGracePeriodMinutes',
                          Number.isFinite(parsed) && parsed > 0 ? parsed : 10
                        )
                      }}
                      keyboardType="numeric"
                    />
                    <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>
                      Default is 10 minutes.
                    </Text>
                  </View>
                </View>
              </>
            )}
          </View>
        </View>

        {/* Reservation System Section */}
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
          }}
        >
          {/* Section Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                backgroundColor: colors.warning + '15',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 10,
              }}
            >
              <CalendarDays size={16} color={colors.warning} />
            </View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.heading }}>
              Reservation System
            </Text>
          </View>

          <View style={{ padding: 12, gap: 14 }}>
            {/* Enable Toggle */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.heading }}>
                Enable Reservations
              </Text>
              <Switch
                checked={enableReservations}
                onCheckedChange={setEnableReservations}
              />
            </View>

            {enableReservations && (
              <>
                <View style={{ height: 1, backgroundColor: colors.border }} />

                {/* Booking Settings */}
                <View style={{ gap: 10 }}>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '700',
                      color: colors.muted,
                      textTransform: 'uppercase',
                      letterSpacing: 0.8,
                    }}
                  >
                    Booking Rules
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1, gap: 5 }}>
                      <Text style={{ fontSize: 11, color: colors.label }}>Days Ahead</Text>
                      <Input
                        className="bg-screen border-gray-600 text-white h-10"
                        value={daysAhead}
                        onChangeText={setDaysAhead}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={{ flex: 1, gap: 5 }}>
                      <Text style={{ fontSize: 11, color: colors.label }}>Max Guests</Text>
                      <Input
                        className="bg-screen border-gray-600 text-white h-10"
                        value={maxGuestsPerSlot}
                        onChangeText={setMaxGuestsPerSlot}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={{ flex: 1, gap: 5 }}>
                      <Text style={{ fontSize: 11, color: colors.label }}>Slot (min)</Text>
                      <Input
                        className="bg-screen border-gray-600 text-white h-10"
                        value={slotDuration}
                        onChangeText={setSlotDuration}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                </View>

                {/* Deposits */}
                <View style={{ gap: 10 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.heading }}>
                      Require Deposit
                    </Text>
                    <Switch
                      checked={requireDeposit}
                      onCheckedChange={setRequireDeposit}
                    />
                  </View>
                  {requireDeposit && (
                    <View style={{ gap: 10 }}>
                      <View>
                        <Text style={{ fontSize: 12, color: colors.label, marginBottom: 6 }}>
                          Amount per Person ($)
                        </Text>
                        <Input
                          className="bg-screen border-gray-600 text-white h-10"
                          value={depositAmount}
                          onChangeText={setDepositAmount}
                          keyboardType="numeric"
                        />
                      </View>
                      <View>
                        <Text style={{ fontSize: 12, color: colors.label, marginBottom: 6 }}>
                          Cancellation Policy
                        </Text>
                        <TextInput
                          multiline
                          style={{
                            backgroundColor: colors.card,
                            borderWidth: 1,
                            borderColor: colors.border,
                            borderRadius: 8,
                            padding: 10,
                            color: colors.heading,
                            fontSize: 12,
                            height: 72,
                            textAlignVertical: 'top',
                          }}
                          value={cancellationPolicy}
                          onChangeText={setCancellationPolicy}
                          textAlignVertical="top"
                          placeholderTextColor={colors.muted}
                        />
                      </View>
                    </View>
                  )}
                </View>

                <View style={{ height: 1, backgroundColor: colors.border }} />

                {/* External Integration */}
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.teal + '20',
                    borderWidth: 1,
                    borderColor: colors.teal + '50',
                    paddingVertical: 12,
                    borderRadius: 10,
                    gap: 6,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.teal }}>
                    Connect Google Reserve
                  </Text>
                  <ChevronRight color={colors.teal} size={16} />
                </TouchableOpacity>

                {/* Today's Timeline Preview */}
                <View>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '700',
                      color: colors.heading,
                      marginBottom: 8,
                    }}
                  >
                    Today's Upcoming
                  </Text>
                  <View style={{ gap: 6 }}>
                    {mockReservations.map((res, index) => (
                      <View
                        key={index}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          backgroundColor: colors.card,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: colors.border,
                          paddingHorizontal: 12,
                          paddingVertical: 9,
                          gap: 10,
                        }}
                      >
                        <Clock size={14} color={colors.label} />
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: '700',
                            color: colors.teal,
                            width: 72,
                          }}
                        >
                          {res.time}
                        </Text>
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: '600',
                            color: colors.heading,
                            flex: 1,
                          }}
                        >
                          {res.name}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Users size={12} color={colors.label} />
                          <Text style={{ fontSize: 12, color: colors.label }}>
                            {res.party}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              </>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

export default WaitlistScreen
