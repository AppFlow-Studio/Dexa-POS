import { Checkbox } from '@/components/ui/checkbox'
import CustomSlider from '@/components/ui/custom-slider'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { colors } from '@/lib/theme'
import { useKDSStore } from '@/stores/useKDSStore'
import { useMenuStore } from '@/stores/useMenuStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import {
  CheckCircle2,
  Clock,
  Package,
  PauseCircle,
  PlayCircle,
  Utensils
} from 'lucide-react-native'
import React, { useMemo } from 'react'
import { ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Helper to get local minutes from ISO or HH:MM:SS time string
const getMinutesFromTime = (time: string) => {
  if (time.includes('T')) {
    const d = new Date(time)
    return d.getHours() * 60 + d.getMinutes()
  }
  const [h, m] = time.split(':').map(Number)
  return h * 60 + (m || 0)
}

const formatScheduleTime = (time: string) => {
  const mins = getMinutesFromTime(time)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const period = h >= 12 ? 'PM' : 'AM'
  const displayH = h % 12 === 0 ? 12 : h % 12
  return `${displayH}:${m.toString().padStart(2, '0')} ${period}`
}

const DAY_ABBR: Record<string, string> = {
  Monday: 'Mon',
  Tuesday: 'Tue',
  Wednesday: 'Wed',
  Thursday: 'Thu',
  Friday: 'Fri',
  Saturday: 'Sat',
  Sunday: 'Sun'
}

const TIMELINE_COLORS_HEX = [
  '#2DD4BF',
  '#14B8A6',
  '#06B6D4',
  '#0891B2',
  '#0F766E',
  '#22D3EE'
]

// Timeline bar across 24h
const MenuTimeline = ({ menus }: { menus: any[] }) => {
  const TOTAL_MINUTES = 24 * 60
  return (
    <View style={{ marginBottom: 8 }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginBottom: 4,
          paddingHorizontal: 2
        }}
      >
        <Text style={{ fontSize: 11, color: colors.muted }}>6 AM</Text>
        <Text style={{ fontSize: 11, color: colors.muted }}>12 PM</Text>
        <Text style={{ fontSize: 11, color: colors.muted }}>6 PM</Text>
        <Text style={{ fontSize: 11, color: colors.muted }}>12 AM</Text>
      </View>
      <View
        style={{
          height: 28,
          width: '100%',
          backgroundColor: colors.border,
          borderRadius: 8,
          overflow: 'hidden',
          position: 'relative'
        }}
      >
        {menus.map((menu, index) => {
          const schedule = menu.schedules?.find((s: any) => s.isActive)
          if (!schedule) return null
          const startMinutes = getMinutesFromTime(schedule.startTime)
          let endMinutes = getMinutesFromTime(schedule.endTime)
          if (endMinutes < startMinutes) endMinutes = TOTAL_MINUTES
          const widthPercent =
            ((endMinutes - startMinutes) / TOTAL_MINUTES) * 100
          const leftPercent = (startMinutes / TOTAL_MINUTES) * 100
          const c = TIMELINE_COLORS_HEX[index % TIMELINE_COLORS_HEX.length]
          return (
            <View
              key={menu.id}
              style={{
                position: 'absolute',
                height: '100%',
                left: `${leftPercent}%` as any,
                width: `${widthPercent}%` as any,
                backgroundColor: c,
                borderRightWidth: 1,
                borderRightColor: colors.screen + '99',
                justifyContent: 'center',
                paddingHorizontal: 4
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 9,
                  fontWeight: '700',
                  color: colors.onSolid
                }}
              >
                {menu.name}
              </Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

import { useRouter } from 'expo-router'

const OnlineOrderingScreen = () => {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  // Store Connection
  const onlineOrderingEnabled = useStoreSettingsStore(
    s => s.onlineOrderingEnabled
  )
  const updateField = useStoreSettingsStore(s => s.updateField)
  const onlinePauseReason = useStoreSettingsStore(s => s.onlinePauseReason)
  const dynamicPrepTimeEnabled = useStoreSettingsStore(
    s => s.dynamicPrepTimeEnabled
  )
  const basePrepTime = useStoreSettingsStore(s => s.basePrepTime)
  const prepTimeAdjustments = useStoreSettingsStore(s => s.prepTimeAdjustments)
  const updatePrepAdjustment = useStoreSettingsStore(
    s => s.updatePrepAdjustment
  )

  const { menus } = useMenuStore()

  // KDS live data
  const kdsTicketsByStatus = useKDSStore(s => s.ticketsByStatus)
  const liveKitchenOrderCount =
    (kdsTicketsByStatus.pending?.length ?? 0) +
    (kdsTicketsByStatus.cooking?.length ?? 0)

  // Calculated Prep Time Logic
  const currentPrepTime = useMemo(() => {
    let time = basePrepTime
    if (dynamicPrepTimeEnabled) {
      if (prepTimeAdjustments.kitchenLoad && liveKitchenOrderCount >= 25)
        time += 10
      if (prepTimeAdjustments.peakHours) {
        const hour = new Date().getHours()
        if (hour >= 17 && hour < 20) time += 5
      }
    }
    return time
  }, [
    basePrepTime,
    dynamicPrepTimeEnabled,
    prepTimeAdjustments,
    liveKitchenOrderCount
  ])

  const isOrdersPaused = !onlineOrderingEnabled
  const buttonColor = isOrdersPaused ? colors.danger : colors.teal
  const buttonIcon = isOrdersPaused ? PauseCircle : PlayCircle
  const buttonText = isOrdersPaused ? 'ORDERS PAUSED' : 'ACCEPTING ORDERS'

  const menusWithSchedules = menus.filter(
    m => m.schedules && m.schedules.length > 0
  )

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.screen,
        paddingHorizontal: 14,
        paddingVertical: 10
      }}
    >
      <View style={{ marginBottom: 10 }}>
        <Text
          style={{ fontSize: 15, fontWeight: '700', color: colors.heading }}
        >
          Online Ordering
        </Text>
        <Text style={{ fontSize: 11, color: colors.label, marginTop: 1 }}>
          Manage orders, workflows, and scheduling.
        </Text>
      </View>

      <View
        style={{ height: 1, backgroundColor: colors.border, marginBottom: 10 }}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
      >
        <View style={{ gap: 10 }}>
          {/* 1. Order Status Control */}
          <View
            style={{
              backgroundColor: colors.panel,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 12
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: '700',
                color: colors.heading,
                marginBottom: 10
              }}
            >
              Order Status Control
            </Text>

            <TouchableOpacity
              onPress={() =>
                updateField('onlineOrderingEnabled', !onlineOrderingEnabled)
              }
              style={{
                width: '100%',
                height: 48,
                backgroundColor: buttonColor + '20',
                borderRadius: 10,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                borderWidth: 1,
                borderColor: buttonColor + '50'
              }}
            >
              {React.createElement(buttonIcon, {
                size: 20,
                color: buttonColor
              })}
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: buttonColor,
                  letterSpacing: 0.8
                }}
              >
                {buttonText}
              </Text>
            </TouchableOpacity>

            {/* Pause Reason (when disabled) */}
            {isOrdersPaused && (
              <View style={{ gap: 8, marginTop: 12 }}>
                <Text
                  style={{
                    fontSize: 12,
                    color: colors.label,
                    fontWeight: '500'
                  }}
                >
                  Pause Reason
                </Text>
                <Select
                  value={{
                    value: onlinePauseReason || '',
                    label: onlinePauseReason || 'Select Reason'
                  }}
                  onValueChange={opt =>
                    updateField('onlinePauseReason', opt?.value || null)
                  }
                >
                  <SelectTrigger
                    style={{
                      backgroundColor: colors.screen,
                      borderColor: colors.border
                    }}
                  >
                    <SelectValue
                      placeholder='Select a reason...'
                      className='text-white'
                    />
                  </SelectTrigger>
                  <SelectContent
                    style={{
                      backgroundColor: colors.screen,
                      borderColor: colors.border
                    }}
                  >
                    <SelectGroup>
                      <SelectItem
                        label='Kitchen at Capacity'
                        value='Kitchen at Capacity'
                      />
                      <SelectItem
                        label='Staff Shortage'
                        value='Staff Shortage'
                      />
                      <SelectItem
                        label='Emergency Maintenance'
                        value='Emergency Maintenance'
                      />
                      <SelectItem label='Closing Early' value='Closing Early' />
                    </SelectGroup>
                  </SelectContent>
                </Select>

                {/* Base prep time when disabled */}
                <View style={{ marginTop: 8, gap: 10 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <Text style={{ fontSize: 12, color: colors.label }}>
                      Base Prep Time Quote
                    </Text>
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: '700',
                        color: colors.teal
                      }}
                    >
                      {basePrepTime} min
                    </Text>
                  </View>
                  <CustomSlider
                    value={basePrepTime}
                    onValueChange={val => updateField('basePrepTime', val)}
                    min={5}
                    max={60}
                    step={5}
                  />
                  <Text style={{ fontSize: 11, color: colors.muted }}>
                    Customers will see this as the estimated wait time while
                    orders are paused.
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* Only show the rest when online ordering is enabled */}
          {onlineOrderingEnabled && (
            <>
              {/* Stats row */}
              <View
                style={{
                  backgroundColor: colors.panel,
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <View style={{ alignItems: 'center', flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 10,
                      color: colors.label,
                      textTransform: 'uppercase',
                      marginBottom: 4,
                      letterSpacing: 0.6
                    }}
                  >
                    Orders Today
                  </Text>
                  <Text
                    style={{
                      fontSize: 18,
                      fontWeight: '700',
                      color: colors.heading
                    }}
                  >
                    142
                  </Text>
                </View>
                <View
                  style={{
                    width: 1,
                    height: 32,
                    backgroundColor: colors.border
                  }}
                />
                <View style={{ alignItems: 'center', flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 10,
                      color: colors.label,
                      textTransform: 'uppercase',
                      marginBottom: 4,
                      letterSpacing: 0.6
                    }}
                  >
                    Avg Prep Time
                  </Text>
                  <Text
                    style={{
                      fontSize: 18,
                      fontWeight: '700',
                      color: colors.heading
                    }}
                  >
                    28m
                  </Text>
                </View>
                <View
                  style={{
                    width: 1,
                    height: 32,
                    backgroundColor: colors.border
                  }}
                />
                <View style={{ alignItems: 'center', flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 10,
                      color: colors.label,
                      textTransform: 'uppercase',
                      marginBottom: 4,
                      letterSpacing: 0.6
                    }}
                  >
                    KDS Active
                  </Text>
                  <Text
                    style={{
                      fontSize: 18,
                      fontWeight: '700',
                      color: colors.teal
                    }}
                  >
                    {liveKitchenOrderCount}
                  </Text>
                </View>
              </View>

              {/* Dynamic Prep Times */}
              <View
                style={{
                  backgroundColor: colors.panel,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  padding: 12
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    marginBottom: 14
                  }}
                >
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      backgroundColor: colors.teal + '15',
                      borderRadius: 8,
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <Clock color={colors.teal} size={16} />
                  </View>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '700',
                        color: colors.heading
                      }}
                    >
                      Dynamic Prep Times
                    </Text>
                    <View
                      style={{
                        backgroundColor: colors.teal + '20',
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 20,
                        borderWidth: 1,
                        borderColor: colors.teal + '50'
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 9,
                          color: colors.teal,
                          fontWeight: '700'
                        }}
                      >
                        REAL-TIME
                      </Text>
                    </View>
                  </View>
                </View>

                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 14
                  }}
                >
                  <Text style={{ fontSize: 13, color: colors.heading }}>
                    Show Dynamic Prep Times
                  </Text>
                  <Switch
                    checked={dynamicPrepTimeEnabled}
                    onCheckedChange={val =>
                      updateField('dynamicPrepTimeEnabled', val)
                    }
                  />
                </View>

                <View
                  style={{
                    gap: 10,
                    marginBottom: dynamicPrepTimeEnabled ? 14 : 0
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between'
                    }}
                  >
                    <Text style={{ fontSize: 12, color: colors.label }}>
                      Base Prep Time
                    </Text>
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: '700',
                        color: colors.teal
                      }}
                    >
                      {basePrepTime} min
                    </Text>
                  </View>
                  <CustomSlider
                    value={basePrepTime}
                    onValueChange={val => updateField('basePrepTime', val)}
                    min={5}
                    max={60}
                    step={5}
                  />
                </View>

                {dynamicPrepTimeEnabled && (
                  <>
                    <View
                      style={{
                        backgroundColor: colors.screen,
                        padding: 14,
                        borderRadius: 10,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: 14,
                        borderWidth: 1,
                        borderColor: colors.border
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          color: colors.muted,
                          textTransform: 'uppercase',
                          letterSpacing: 1.5,
                          marginBottom: 4
                        }}
                      >
                        Current Quoted Time
                      </Text>
                      <Text
                        style={{
                          fontSize: 34,
                          fontWeight: '800',
                          color: colors.teal
                        }}
                      >
                        {currentPrepTime} min
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          color: colors.label,
                          marginTop: 4
                        }}
                      >
                        Updated just now
                      </Text>
                    </View>

                    <View style={{ gap: 10, marginBottom: 14 }}>
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '700',
                          color: colors.heading
                        }}
                      >
                        Auto-Adjustments:
                      </Text>
                      {[
                        {
                          key: 'kitchenLoad',
                          label: `Add 10 min when kitchen has 25+ orders (now: ${liveKitchenOrderCount})`,
                          checked: prepTimeAdjustments.kitchenLoad
                        },
                        {
                          key: 'peakHours',
                          label: 'Add 5 min during peak hours (5–8 PM)',
                          checked: prepTimeAdjustments.peakHours
                        }
                      ].map(item => (
                        <View
                          key={item.key}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 10
                          }}
                        >
                          <Checkbox
                            checked={item.checked}
                            onCheckedChange={v =>
                              updatePrepAdjustment(item.key as any, v)
                            }
                            className='border-gray-500 data-[state=checked]:bg-teal-600 data-[state=checked]:border-teal-600'
                          />
                          <Text style={{ fontSize: 12, color: colors.label }}>
                            {item.label}
                          </Text>
                        </View>
                      ))}
                    </View>

                    {/* KDS Factors block */}
                    <View
                      style={{
                        backgroundColor: colors.teal + '10',
                        padding: 14,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: colors.teal + '30'
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '700',
                          color: colors.teal,
                          marginBottom: 8
                        }}
                      >
                        Current Factors (KDS Live):
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          color: colors.label,
                          marginBottom: 4
                        }}
                      >
                        • Kitchen Load: {liveKitchenOrderCount} orders
                        {prepTimeAdjustments.kitchenLoad &&
                        liveKitchenOrderCount >= 25
                          ? ' (+10 min)'
                          : ' (no adjustment)'}
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          color: colors.label,
                          marginBottom: 8
                        }}
                      >
                        • Peak Hours (5–8 PM):
                        {prepTimeAdjustments.peakHours &&
                        new Date().getHours() >= 17 &&
                        new Date().getHours() < 20
                          ? ' Active (+5 min)'
                          : ' Not active'}
                      </Text>
                      <View
                        style={{
                          height: 1,
                          backgroundColor: colors.teal + '30',
                          marginBottom: 8
                        }}
                      />
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '700',
                          color: colors.heading
                        }}
                      >
                        Total: {basePrepTime} + {currentPrepTime - basePrepTime}{' '}
                        = {currentPrepTime} min
                      </Text>
                    </View>
                  </>
                )}
              </View>

              {/* Time-Based Menus */}
              <View
                style={{
                  backgroundColor: colors.panel,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  padding: 12
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    marginBottom: 14
                  }}
                >
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      backgroundColor: colors.teal + '15',
                      borderRadius: 8,
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <Utensils color={colors.teal} size={16} />
                  </View>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '700',
                        color: colors.heading
                      }}
                    >
                      Time-Based Menus
                    </Text>
                    <View
                      style={{
                        backgroundColor: colors.teal + '20',
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 20,
                        borderWidth: 1,
                        borderColor: colors.teal + '50'
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 9,
                          color: colors.teal,
                          fontWeight: '700'
                        }}
                      >
                        SMART MENUS
                      </Text>
                    </View>
                  </View>
                </View>

                {menusWithSchedules.length > 0 && (
                  <MenuTimeline menus={menusWithSchedules} />
                )}

                {/* Active menu indicator */}
                {(() => {
                  const activeMenu = menus.find(m =>
                    useMenuStore.getState().isMenuAvailableNow(m.id)
                  )
                  return (
                    <View
                      style={{
                        backgroundColor: colors.teal + '10',
                        padding: 10,
                        borderRadius: 8,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        borderWidth: 1,
                        borderColor: colors.teal + '20',
                        marginBottom: 14
                      }}
                    >
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: activeMenu
                            ? colors.teal
                            : colors.muted
                        }}
                      />
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '700',
                          color: activeMenu ? colors.teal : colors.muted
                        }}
                      >
                        Active Now:{' '}
                        {activeMenu ? `"${activeMenu.name}"` : 'None'}
                      </Text>
                    </View>
                  )
                })()}

                {/* Per-menu schedule cards */}
                <View style={{ gap: 8 }}>
                  {menus.map((menu, i) => {
                    const isActiveNow = useMenuStore
                      .getState()
                      .isMenuAvailableNow(menu.id)
                    const activeSchedules = (menu.schedules || []).filter(
                      (s: any) => s.isActive
                    )
                    const dotColor =
                      TIMELINE_COLORS_HEX[i % TIMELINE_COLORS_HEX.length]

                    return (
                      <View
                        key={menu.id}
                        style={{
                          backgroundColor: colors.screen,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: colors.border,
                          overflow: 'hidden'
                        }}
                      >
                        {/* Menu header */}
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            paddingHorizontal: 12,
                            paddingVertical: 10,
                            borderBottomWidth: 1,
                            borderBottomColor: colors.border
                          }}
                        >
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 8
                            }}
                          >
                            <View
                              style={{
                                width: 10,
                                height: 10,
                                borderRadius: 5,
                                backgroundColor: dotColor
                              }}
                            />
                            <Text
                              style={{
                                fontSize: 13,
                                fontWeight: '600',
                                color: colors.heading
                              }}
                            >
                              {menu.name}
                            </Text>
                          </View>
                          {isActiveNow ? (
                            <View
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 5,
                                backgroundColor: colors.teal + '20',
                                paddingHorizontal: 8,
                                paddingVertical: 3,
                                borderRadius: 20,
                                borderWidth: 1,
                                borderColor: colors.teal + '50'
                              }}
                            >
                              <CheckCircle2 size={11} color={colors.teal} />
                              <Text
                                style={{
                                  fontSize: 11,
                                  color: colors.teal,
                                  fontWeight: '500'
                                }}
                              >
                                Active Now
                              </Text>
                            </View>
                          ) : (
                            <Text style={{ fontSize: 11, color: colors.muted }}>
                              Inactive
                            </Text>
                          )}
                        </View>

                        {/* Schedules */}
                        {activeSchedules.length === 0 ? (
                          <View
                            style={{
                              paddingHorizontal: 12,
                              paddingVertical: 10
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 12,
                                color: colors.muted,
                                fontStyle: 'italic'
                              }}
                            >
                              No schedule — always available
                            </Text>
                          </View>
                        ) : (
                          activeSchedules.map((s: any) => (
                            <View
                              key={s.id}
                              style={{
                                paddingHorizontal: 12,
                                paddingVertical: 10,
                                borderBottomWidth: 1,
                                borderBottomColor: colors.border + '80',
                                flexDirection: 'row',
                                alignItems: 'flex-start',
                                justifyContent: 'space-between'
                              }}
                            >
                              <View
                                style={{
                                  flexDirection: 'row',
                                  flexWrap: 'wrap',
                                  gap: 4,
                                  flex: 1,
                                  marginRight: 12
                                }}
                              >
                                {(s.days || []).map((day: string) => (
                                  <View
                                    key={day}
                                    style={{
                                      backgroundColor: colors.teal + '10',
                                      borderWidth: 1,
                                      borderColor: colors.teal + '30',
                                      paddingHorizontal: 6,
                                      paddingVertical: 2,
                                      borderRadius: 4
                                    }}
                                  >
                                    <Text
                                      style={{
                                        fontSize: 11,
                                        color: colors.teal
                                      }}
                                    >
                                      {DAY_ABBR[day] ?? day}
                                    </Text>
                                  </View>
                                ))}
                              </View>
                              <View
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  gap: 4
                                }}
                              >
                                <Clock size={11} color={colors.muted} />
                                <Text
                                  style={{ fontSize: 12, color: colors.label }}
                                >
                                  {formatScheduleTime(s.startTime)} –{' '}
                                  {formatScheduleTime(s.endTime)}
                                </Text>
                              </View>
                            </View>
                          ))
                        )}
                      </View>
                    )
                  })}
                </View>

                <TouchableOpacity
                  onPress={() =>
                    router.push({
                      pathname: '/(main)/menu',
                      params: { returnTo: '/settings/online-ordering' }
                    })
                  }
                  style={{
                    backgroundColor: 'transparent',
                    paddingVertical: 12,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.border,
                    alignItems: 'center',
                    marginTop: 12
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '700',
                      color: colors.label
                    }}
                  >
                    Edit Menu Schedules
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          <View style={{ height: 10 }} />
        </View>
      </ScrollView>
    </View>
  )
}

export default OnlineOrderingScreen
