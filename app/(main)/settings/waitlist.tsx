import { Switch } from '@/components/ui/switch'
import { useSupabaseClient } from '@/hooks/useSupabaseClient'
import { colors } from '@/lib/theme'
import { useLocationConfigStore } from '@/stores/useLocationConfigStore'
import {
  setReservationSupabaseClient,
  useReservationStore
} from '@/stores/useReservationStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { useWaitlistStore } from '@/stores/useWaitlistStore'
import {
  CalendarDays,
  Check,
  ChevronRight,
  Clock,
  MessageSquare,
  Plus,
  Users,
  X
} from 'lucide-react-native'
import React, { useEffect, useMemo, useRef } from 'react'
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Per-event SMS templates. `key` matches the notify `template_key` read by the
// edge functions; `placeholder` mirrors the built-in default (shown when the
// merchant leaves the field blank). Kept in sync with the server defaults in
// supabase/functions/_shared/notifyTemplates.ts.
const WAITLIST_EVENTS: { key: string; label: string; placeholder: string }[] = [
  {
    key: 'waitlist.added',
    label: 'Added to waitlist',
    placeholder:
      "Hi {name}, you're on the waitlist at {store}. Your seat should be ready {wait}. We'll text you when it's ready."
  },
  {
    key: 'waitlist.tableReady',
    label: 'Table ready',
    placeholder:
      'Hi {name}! Your table at {store} is ready. Please check in with the host within 10 minutes.'
  },
  {
    key: 'waitlist.almostReady',
    label: 'Almost ready',
    placeholder:
      'Hi {name}! Your table at {store} will be ready in about 5 minutes.'
  },
  {
    key: 'waitlist.runningLate',
    label: 'Running late',
    placeholder:
      "Hi {name}, we're running a few more minutes behind at {store}. Thanks for your patience."
  },
  {
    key: 'waitlist.updateConfirmed',
    label: 'Wait update',
    placeholder:
      'Hi {name}, just a quick update on your wait at {store}. We\'ll have your table ready as soon as possible.'
  },
  {
    key: 'waitlist.cancelled',
    label: 'Removed from waitlist',
    placeholder:
      "Hi {name}, you've been removed from the waitlist at {store}. Please contact us if this was a mistake."
  }
]

const RESERVATION_EVENTS: { key: string; label: string; placeholder: string }[] =
  [
    {
      key: 'reservation.created',
      label: 'Reservation confirmed',
      placeholder:
        'Hi {name}, your reservation at {store} for {party_size} is confirmed for {date} at {time}.'
    },
    {
      key: 'reservation.moved',
      label: 'Reservation moved',
      placeholder:
        'Hi {name}, your reservation at {store} has been moved to {date} at {time}.'
    },
    {
      key: 'reservation.timeChanged',
      label: 'Time changed',
      placeholder:
        'Hi {name}, your reservation time at {store} on {date} has changed to {time}.'
    },
    {
      key: 'reservation.confirmation',
      label: 'Confirmation reminder',
      placeholder:
        'Hi {name}, this is {store} confirming your reservation on {date} at {time}.'
    },
    {
      key: 'reservation.cancelled',
      label: 'Reservation cancelled',
      placeholder:
        'Hi {name}, your reservation at {store} on {date} at {time} has been cancelled.'
    }
  ]

// Tappable variable chips — the merchant inserts tokens instead of typing the
// { } braces by hand. `token` is the literal the edge functions interpolate.
type TokenChip = { token: string; label: string }
const WAITLIST_TOKEN_CHIPS: TokenChip[] = [
  { token: '{name}', label: 'Name' },
  { token: '{store}', label: 'Store' },
  { token: '{store_address}', label: 'Address' },
  { token: '{wait}', label: 'Wait' },
  { token: '{party_size}', label: 'Party size' }
]
const RESERVATION_TOKEN_CHIPS: TokenChip[] = [
  { token: '{name}', label: 'Name' },
  { token: '{store}', label: 'Store' },
  { token: '{store_address}', label: 'Address' },
  { token: '{party_size}', label: 'Party size' },
  { token: '{date}', label: 'Date' },
  { token: '{time}', label: 'Time' },
  { token: '{confirmation}', label: 'Confirmation' }
]

// Themed numeric field. Replaces the old `Input` with the dead
// `text-white` className that rendered invisible values on the light theme.
const NumField = ({
  value,
  onChangeText
}: {
  value: string
  onChangeText: (v: string) => void
}) => (
  <TextInput
    value={value}
    onChangeText={onChangeText}
    keyboardType="numeric"
    placeholderTextColor={colors.muted}
    style={{
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      height: 40,
      color: colors.heading,
      fontSize: 13
    }}
  />
)

const toInt = (value: string, fallback: number) => {
  const n = parseInt(value, 10)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}
const toNum = (value: string, fallback: number) => {
  const n = parseFloat(value)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

const WaitlistScreen = () => {
  const insets = useSafeAreaInsets()
  const { waitlist, removeWaitlistEntry } = useWaitlistStore()
  const waitlistConfig = useLocationConfigStore(s => s.config.waitlist)
  const updateConfig = useLocationConfigStore(s => s.updateConfig)

  // All waitlist/reservation settings live in pos_config (namespace: waitlist).
  const enableWaitlist = waitlistConfig.enabled
  const autoSmsEnabled = waitlistConfig.autoSmsEnabled
  const messageTemplates = waitlistConfig.messageTemplates ?? {}
  const waitlistNotificationGracePeriodMinutes =
    waitlistConfig.notificationGracePeriodMinutes

  const enableReservations = waitlistConfig.reservationsEnabled
  const daysAhead = String(waitlistConfig.reservationDaysAhead)
  const maxGuestsPerSlot = String(waitlistConfig.maxGuestsPerSlot)
  const slotDuration = String(waitlistConfig.slotDurationMinutes)
  const requireDeposit = waitlistConfig.requireDeposit
  const depositAmount = String(waitlistConfig.depositAmount)
  const cancellationPolicy = waitlistConfig.cancellationPolicy

  // ── config setters (thin wrappers over the pos_config `waitlist` namespace) ──
  const setEnableWaitlist = (v: boolean) => updateConfig('waitlist', { enabled: v })
  const setAutoSmsEnabled = (v: boolean) =>
    updateConfig('waitlist', { autoSmsEnabled: v })
  const setEnableReservations = (v: boolean) =>
    updateConfig('waitlist', { reservationsEnabled: v })
  const setRequireDeposit = (v: boolean) =>
    updateConfig('waitlist', { requireDeposit: v })
  const setDaysAhead = (v: string) =>
    updateConfig('waitlist', { reservationDaysAhead: toInt(v, 30) })
  const setMaxGuestsPerSlot = (v: string) =>
    updateConfig('waitlist', { maxGuestsPerSlot: toInt(v, 6) })
  const setSlotDuration = (v: string) =>
    updateConfig('waitlist', { slotDurationMinutes: toInt(v, 90) })
  const setDepositAmount = (v: string) =>
    updateConfig('waitlist', { depositAmount: toNum(v, 20) })
  const setCancellationPolicy = (v: string) =>
    updateConfig('waitlist', { cancellationPolicy: v })
  const setGracePeriod = (v: string) =>
    updateConfig('waitlist', {
      notificationGracePeriodMinutes: toInt(v, 10) || 10
    })

  // Merge the edited key back into the full map — the backend jsonb merge is
  // shallow at the namespace level, so we must send the complete object.
  const setTemplate = (key: string, value: string) =>
    updateConfig('waitlist', {
      messageTemplates: { ...messageTemplates, [key]: value }
    })

  const avgWaitTime =
    waitlist.length > 0
      ? Math.round(
          waitlist.reduce((acc, curr) => acc + curr.quoted_wait_minutes, 0) /
            waitlist.length
        )
      : 0

  // Last known cursor position per field, so a chip tap inserts the token where
  // the merchant left off (falls back to end-of-text). A ref avoids re-rendering
  // on every selection change.
  const selectionRef = useRef<Record<string, { start: number; end: number }>>({})

  const insertToken = (key: string, token: string) => {
    const current = messageTemplates[key] ?? ''
    const sel = selectionRef.current[key]
    const start = sel ? sel.start : current.length
    const end = sel ? sel.end : current.length
    const next = current.slice(0, start) + token + current.slice(end)
    const caret = start + token.length
    selectionRef.current[key] = { start: caret, end: caret }
    setTemplate(key, next)
  }

  const renderTemplateField = (
    event: { key: string; label: string; placeholder: string },
    chips: TokenChip[]
  ) => (
    <View key={event.key} style={{ gap: 6 }}>
      <Text style={{ fontSize: 12, color: colors.label }}>{event.label}</Text>
      <TextInput
        multiline
        value={messageTemplates[event.key] ?? ''}
        onChangeText={value => setTemplate(event.key, value)}
        onSelectionChange={e => {
          selectionRef.current[event.key] = e.nativeEvent.selection
        }}
        placeholder={event.placeholder}
        placeholderTextColor={colors.muted}
        textAlignVertical="top"
        style={{
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
          padding: 10,
          color: colors.heading,
          fontSize: 12,
          minHeight: 68,
          textAlignVertical: 'top'
        }}
      />
      {/* Tap a chip to insert the variable at the cursor — no typing braces. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {chips.map(chip => (
          <TouchableOpacity
            key={chip.token}
            onPress={() => insertToken(event.key, chip.token)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 3,
              paddingHorizontal: 9,
              paddingVertical: 5,
              borderRadius: 999,
              backgroundColor: colors.teal + '12',
              borderWidth: 1,
              borderColor: colors.teal + '30'
            }}
          >
            <Plus size={11} color={colors.teal} />
            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.teal }}>
              {chip.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )

  // ── Today's real reservations (replaces the old hardcoded timeline) ──
  const supabaseClient = useSupabaseClient()
  const locationId = useStoreSettingsStore(s => s.selectedStore?.id || '')
  const reservations = useReservationStore(s => s.reservations)
  const fetchReservations = useReservationStore(s => s.fetchReservations)

  useEffect(() => {
    if (!supabaseClient || !locationId) return
    setReservationSupabaseClient(supabaseClient)
    // Default date = today (store falls back to selectedDate → new Date()).
    fetchReservations(locationId, undefined, { silent: true })
  }, [supabaseClient, locationId, fetchReservations])

  const parseReservationTime = (r: {
    reservation_time: string
    reservation_date?: string
  }): Date | null => {
    const direct = new Date(r.reservation_time)
    if (Number.isFinite(direct.getTime())) return direct
    if (r.reservation_date) {
      const combined = new Date(`${r.reservation_date}T${r.reservation_time}`)
      if (Number.isFinite(combined.getTime())) return combined
    }
    return null
  }

  const upcomingReservations = useMemo(() => {
    const inactive = new Set(['cancelled', 'completed', 'no_show'])
    return reservations
      .filter(r => !inactive.has(r.status))
      .map(r => ({ reservation: r, at: parseReservationTime(r) }))
      .sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0))
      .slice(0, 5)
  }, [reservations])

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
            overflow: 'hidden'
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
              borderBottomColor: colors.border
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
                marginRight: 10
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
                justifyContent: 'space-between'
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.heading }}>
                Enable Digital Waitlist
              </Text>
              <Switch checked={enableWaitlist} onCheckedChange={setEnableWaitlist} />
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
                      letterSpacing: 0.8
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
                        padding: 12
                      }}
                    >
                      <Text style={{ fontSize: 11, color: colors.label }}>Waiting</Text>
                      <Text
                        style={{
                          fontSize: 22,
                          fontWeight: '700',
                          color: colors.heading,
                          marginTop: 2
                        }}
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
                        padding: 12
                      }}
                    >
                      <Text style={{ fontSize: 11, color: colors.label }}>Avg Wait</Text>
                      <Text
                        style={{
                          fontSize: 22,
                          fontWeight: '700',
                          color: colors.teal,
                          marginTop: 2
                        }}
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
                      overflow: 'hidden'
                    }}
                  >
                    <View
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderBottomWidth: 1,
                        borderBottomColor: colors.border,
                        backgroundColor: colors.panel
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
                            justifyContent: 'space-between'
                          }}
                        >
                          <View>
                            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.heading }}>
                              {entry.party_name}
                            </Text>
                            <Text style={{ fontSize: 11, color: colors.label, marginTop: 1 }}>
                              Party of {entry.party_size} · {entry.quoted_wait_minutes}m quote
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', gap: 6 }}>
                            <TouchableOpacity
                              style={{
                                padding: 7,
                                backgroundColor: colors.info + '20',
                                borderRadius: 7,
                                borderWidth: 1,
                                borderColor: colors.info + '50'
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
                                borderColor: colors.success + '50'
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
                                borderColor: colors.danger + '30'
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
                          borderTopColor: colors.border
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
                      justifyContent: 'space-between'
                    }}
                  >
                    <View style={{ flex: 1, paddingRight: 10 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.heading }}>
                        Automatic SMS
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                        Auto-text guests when added to or removed from the waitlist.
                      </Text>
                    </View>
                    <Switch checked={autoSmsEnabled} onCheckedChange={setAutoSmsEnabled} />
                  </View>

                  {/* Per-event message templates */}
                  <View style={{ gap: 12 }}>
                    <View>
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: '700',
                          color: colors.muted,
                          textTransform: 'uppercase',
                          letterSpacing: 0.8
                        }}
                      >
                        Message Templates
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>
                        Leave a field blank to use the default message. Tap a
                        variable below to insert it.
                      </Text>
                    </View>
                    {WAITLIST_EVENTS.map(e =>
                      renderTemplateField(e, WAITLIST_TOKEN_CHIPS)
                    )}
                  </View>

                  <View>
                    <Text style={{ fontSize: 12, color: colors.label, marginBottom: 6 }}>
                      No-show grace period after notification (minutes)
                    </Text>
                    <NumField
                      value={String(waitlistNotificationGracePeriodMinutes ?? 10)}
                      onChangeText={setGracePeriod}
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
            overflow: 'hidden'
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
              borderBottomColor: colors.border
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
                marginRight: 10
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
                justifyContent: 'space-between'
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
                      letterSpacing: 0.8
                    }}
                  >
                    Booking Rules
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1, gap: 5 }}>
                      <Text style={{ fontSize: 11, color: colors.label }}>Days Ahead</Text>
                      <NumField value={daysAhead} onChangeText={setDaysAhead} />
                    </View>
                    <View style={{ flex: 1, gap: 5 }}>
                      <Text style={{ fontSize: 11, color: colors.label }}>Max Guests</Text>
                      <NumField value={maxGuestsPerSlot} onChangeText={setMaxGuestsPerSlot} />
                    </View>
                    <View style={{ flex: 1, gap: 5 }}>
                      <Text style={{ fontSize: 11, color: colors.label }}>Slot (min)</Text>
                      <NumField value={slotDuration} onChangeText={setSlotDuration} />
                    </View>
                  </View>
                </View>

                {/* Reservation message templates */}
                <View style={{ gap: 12 }}>
                  <View>
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '700',
                        color: colors.muted,
                        textTransform: 'uppercase',
                        letterSpacing: 0.8
                      }}
                    >
                      Reservation Messages
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>
                      Leave a field blank to use the default message. Tap a
                      variable below to insert it.
                    </Text>
                  </View>
                  {RESERVATION_EVENTS.map(e =>
                    renderTemplateField(e, RESERVATION_TOKEN_CHIPS)
                  )}
                </View>

                {/* Deposits */}
                <View style={{ gap: 10 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.heading }}>
                      Require Deposit
                    </Text>
                    <Switch checked={requireDeposit} onCheckedChange={setRequireDeposit} />
                  </View>
                  {requireDeposit && (
                    <View style={{ gap: 10 }}>
                      <View>
                        <Text style={{ fontSize: 12, color: colors.label, marginBottom: 6 }}>
                          Amount per Person ($)
                        </Text>
                        <NumField
                          value={depositAmount}
                          onChangeText={setDepositAmount}
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
                            textAlignVertical: 'top'
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
                    gap: 6
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
                      marginBottom: 8
                    }}
                  >
                    Today's Upcoming
                  </Text>
                  <View style={{ gap: 6 }}>
                    {upcomingReservations.length === 0 ? (
                      <View
                        style={{
                          backgroundColor: colors.card,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: colors.border,
                          padding: 20,
                          alignItems: 'center'
                        }}
                      >
                        <Text style={{ fontSize: 12, color: colors.muted }}>
                          No upcoming reservations today
                        </Text>
                      </View>
                    ) : (
                      upcomingReservations.map(({ reservation, at }) => (
                        <View
                          key={reservation.id}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            backgroundColor: colors.card,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: colors.border,
                            paddingHorizontal: 12,
                            paddingVertical: 9,
                            gap: 10
                          }}
                        >
                          <Clock size={14} color={colors.label} />
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: '700',
                              color: colors.teal,
                              width: 72
                            }}
                          >
                            {at
                              ? at.toLocaleTimeString([], {
                                  hour: 'numeric',
                                  minute: '2-digit'
                                })
                              : '—'}
                          </Text>
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: '600',
                              color: colors.heading,
                              flex: 1
                            }}
                          >
                            {reservation.party_name}
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Users size={12} color={colors.label} />
                            <Text style={{ fontSize: 12, color: colors.label }}>
                              {reservation.party_size}
                            </Text>
                          </View>
                        </View>
                      ))
                    )}
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
