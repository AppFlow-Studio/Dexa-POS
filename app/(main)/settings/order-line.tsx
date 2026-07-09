import { colors } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  List,
  Lock,
  PlusCircle,
  UserCheck
} from 'lucide-react-native'
import React, { useState } from 'react'
import { ScrollView, Switch, Text, TouchableOpacity, View } from 'react-native'

const DAY_OPTIONS = [
  { value: 0, label: 'Today Only', description: 'Only show orders from today' },
  { value: 1, label: 'Last 2 Days', description: 'Today and yesterday' },
  { value: 2, label: 'Last 3 Days', description: 'Today and 2 previous days' },
  { value: 6, label: 'Last 7 Days', description: 'Orders from the past week' },
  {
    value: 13,
    label: 'Last 14 Days',
    description: 'Orders from the past 2 weeks'
  },
  {
    value: 29,
    label: 'Last 30 Days',
    description: 'Orders from the past month'
  }
]

const ORDER_COMPLETION_OPTIONS: {
  value: 'manual' | 'auto' | 'auto_on_payment'
  label: string
  description: string
}[] = [
  {
    value: 'manual',
    label: 'Manual',
    description: 'Require "Mark as Done" to complete orders (current behavior)'
  },
  {
    value: 'auto',
    label: 'Auto (Paid + Ready)',
    description:
      'Auto-complete when order is fully paid AND kitchen marks ready'
  },
  {
    value: 'auto_on_payment',
    label: 'Auto on Payment',
    description:
      'Auto-complete immediately when order is fully paid, regardless of kitchen status'
  }
]

const OVERRIDE_TIMEOUT_OPTIONS: {
  value: 0 | 5 | 15 | 30 | 60
  label: string
  description: string
}[] = [
  {
    value: 0,
    label: 'Always Require PIN',
    description: 'PIN required every time a locked menu or category is accessed'
  },
  {
    value: 5,
    label: 'Stay Unlocked 5 min',
    description: 'One PIN entry unlocks for 5 minutes'
  },
  {
    value: 15,
    label: 'Stay Unlocked 15 min',
    description: 'One PIN entry unlocks for 15 minutes'
  },
  {
    value: 30,
    label: 'Stay Unlocked 30 min',
    description: 'One PIN entry unlocks for 30 minutes'
  },
  {
    value: 60,
    label: 'Stay Unlocked 1 hour',
    description: 'One PIN entry unlocks for 60 minutes'
  }
]

const ORDER_LINE_VIEW_OPTIONS: {
  value: 'default' | 'minimal'
  label: string
  description: string
}[] = [
  {
    value: 'default',
    label: 'Default View',
    description: 'Always show the current order line ribbon.'
  },
  {
    value: 'minimal',
    label: 'Minimal View',
    description: 'Show a button that opens a scrollable order cards module.'
  }
]

const MINIMAL_MODE_ROW_OPTIONS: {
  value: 2 | 3
  label: string
  description: string
}[] = [
  {
    value: 2,
    label: '2 Rows',
    description: 'Open a compact order sheet sized to show about two rows.'
  },
  {
    value: 3,
    label: '3 Rows',
    description: 'Open the full-height order sheet.'
  }
]

const OrderLineSettingsScreen = () => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const orderLineSettings = useSettingsStore(s => s.orderLineSettings)
  const setOrderLineSettings = useSettingsStore(s => s.setOrderLineSettings)
  const managerOverrideTimeoutMinutes = useStoreSettingsStore(
    s => s.managerOverrideTimeoutMinutes
  )
  const orderCompletionMode = useStoreSettingsStore(s => s.orderCompletionMode)
  const requirePinPerOrder = useStoreSettingsStore(s => s.requirePinPerOrder)
  const autoCreateOrder = useStoreSettingsStore(s => s.autoCreateOrder)
  const updateField = useStoreSettingsStore(s => s.updateField)

  const [expandedSections, setExpandedSections] = useState({
    visibility: true,
    viewMode: true,
    managerOverride: true,
    orderCompletion: true,
    staffAttribution: true,
    orderCreation: true
  })

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  const renderSectionHeader = (
    title: string,
    icon: React.ReactNode,
    section: keyof typeof expandedSections
  ) => (
    <TouchableOpacity
      onPress={() => toggleSection(section)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: s(14),
        paddingVertical: s(11),
        borderBottomWidth: expandedSections[section] ? 1 : 0,
        borderBottomColor: colors.border
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View
          style={{
            width: s(32),
            height: s(32),
            borderRadius: s(8),
            backgroundColor: colors.teal + '15',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: s(10)
          }}
        >
          {icon}
        </View>
        <Text
          style={{ fontSize: s(13), fontWeight: '700', color: colors.heading }}
        >
          {title}
        </Text>
      </View>
      {expandedSections[section] ? (
        <ChevronUp size={s(14)} color={colors.label} />
      ) : (
        <ChevronDown size={s(14)} color={colors.label} />
      )}
    </TouchableOpacity>
  )

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.screen,
        paddingHorizontal: s(14),
        paddingVertical: s(10)
      }}
    >
      {/* Page Header */}
      <View style={{ marginBottom: s(2) }}>
        <Text
          style={{ fontSize: s(15), fontWeight: '700', color: colors.heading }}
        >
          Orders Processing Settings
        </Text>
        <Text style={{ fontSize: s(11), color: colors.label, marginTop: s(1) }}>
          Configure how orders appear in the order line.
        </Text>
      </View>

      <View
        style={{
          height: 1,
          backgroundColor: colors.border,
          marginVertical: s(10)
        }}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: s(12) }}
      >
        {/* Order Visibility */}
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: s(12),
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: s(10),
            overflow: 'hidden'
          }}
        >
          {renderSectionHeader(
            'Order Visibility',
            <List size={16} color={colors.teal} />,
            'visibility'
          )}
          {expandedSections.visibility && (
            <View style={{ padding: s(12) }}>
              <Text
                style={{ fontSize: s(10), color: colors.muted, marginBottom: s(10) }}
              >
                Choose how many days of orders to display in the order line.
                Older orders will be hidden from the order line but can still be
                found in order history.
              </Text>

              <View style={{ gap: s(6) }}>
                {DAY_OPTIONS.map(option => {
                  const isSelected =
                    orderLineSettings.daysToShow === option.value
                  return (
                    <TouchableOpacity
                      key={option.value}
                      onPress={() =>
                        setOrderLineSettings({ daysToShow: option.value })
                      }
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingHorizontal: s(10),
                        paddingVertical: s(9),
                        borderRadius: s(10),
                        borderWidth: 1,
                        backgroundColor: isSelected
                          ? colors.teal + '10'
                          : colors.screen,
                        borderColor: isSelected
                          ? colors.teal + '50'
                          : colors.border
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontSize: s(13),
                            fontWeight: '600',
                            color: isSelected ? colors.teal : colors.heading
                          }}
                        >
                          {option.label}
                        </Text>
                        <Text
                          style={{
                            fontSize: s(10),
                            color: colors.muted,
                            marginTop: s(1)
                          }}
                        >
                          {option.description}
                        </Text>
                      </View>
                      {isSelected && (
                        <View
                          style={{
                            width: s(22),
                            height: s(22),
                            borderRadius: s(11),
                            backgroundColor: colors.teal,
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginLeft: s(10)
                          }}
                        >
                          <Check size={s(13)} color={colors.onSolid} />
                        </View>
                      )}
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>
          )}
        </View>

        {/* Order Line View Mode */}
        <View
          style={{
            marginTop: s(16),
            borderRadius: s(12),
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
            backgroundColor: colors.panel
          }}
        >
          {renderSectionHeader(
            'Order Line View',
            <LayoutGrid size={s(14)} color={colors.teal} />,
            'viewMode'
          )}
          {expandedSections.viewMode && (
            <View style={{ padding: s(12), gap: s(6) }}>
              <Text
                style={{
                  fontSize: s(11),
                  color: colors.muted,
                  marginBottom: s(4),
                  paddingHorizontal: s(2)
                }}
              >
                Choose whether the order line is always visible, or hidden
                behind a button that opens order cards.
              </Text>
              {ORDER_LINE_VIEW_OPTIONS.map(option => {
                const currentMode = orderLineSettings.viewMode ?? 'default'
                const isSelected = currentMode === option.value
                return (
                  <TouchableOpacity
                    key={option.value}
                    onPress={() =>
                      setOrderLineSettings({ viewMode: option.value })
                    }
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: s(10),
                      paddingVertical: s(9),
                      borderRadius: s(10),
                      borderWidth: 1,
                      backgroundColor: isSelected
                        ? colors.teal + '10'
                        : colors.screen,
                      borderColor: isSelected
                        ? colors.teal + '50'
                        : colors.border
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: s(13),
                          fontWeight: '600',
                          color: isSelected ? colors.teal : colors.heading
                        }}
                      >
                        {option.label}
                      </Text>
                      <Text
                        style={{
                          fontSize: s(10),
                          color: colors.muted,
                          marginTop: s(1)
                        }}
                      >
                        {option.description}
                      </Text>
                    </View>
                    {isSelected && (
                      <View
                        style={{
                          width: s(22),
                          height: s(22),
                          borderRadius: s(11),
                          backgroundColor: colors.teal,
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginLeft: s(10)
                        }}
                      >
                        <Check size={s(13)} color={colors.onSolid} />
                      </View>
                    )}
                  </TouchableOpacity>
                )
              })}

              {(orderLineSettings.viewMode ?? 'default') === 'minimal' && (
                <View style={{ marginTop: s(6), gap: s(6) }}>
                  <Text
                    style={{
                      fontSize: s(11),
                      color: colors.muted,
                      marginTop: s(4),
                      paddingHorizontal: s(2)
                    }}
                  >
                    In minimal mode, choose how tall the order sheet opens.
                  </Text>
                  {MINIMAL_MODE_ROW_OPTIONS.map(option => {
                    const currentRows = orderLineSettings.minimalModeRows ?? 3
                    const isSelected = currentRows === option.value
                    return (
                      <TouchableOpacity
                        key={option.value}
                        onPress={() =>
                          setOrderLineSettings({
                            minimalModeRows: option.value
                          })
                        }
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingHorizontal: s(10),
                          paddingVertical: s(9),
                          borderRadius: s(10),
                          borderWidth: 1,
                          backgroundColor: isSelected
                            ? colors.teal + '10'
                            : colors.screen,
                          borderColor: isSelected
                            ? colors.teal + '50'
                            : colors.border
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              fontSize: s(13),
                              fontWeight: '600',
                              color: isSelected ? colors.teal : colors.heading
                            }}
                          >
                            {option.label}
                          </Text>
                          <Text
                            style={{
                              fontSize: s(10),
                              color: colors.muted,
                              marginTop: s(1)
                            }}
                          >
                            {option.description}
                          </Text>
                        </View>
                        {isSelected && (
                          <View
                            style={{
                              width: s(22),
                              height: s(22),
                              borderRadius: s(11),
                              backgroundColor: colors.teal,
                              alignItems: 'center',
                              justifyContent: 'center',
                              marginLeft: s(10)
                            }}
                          >
                            <Check size={s(13)} color={colors.onSolid} />
                          </View>
                        )}
                      </TouchableOpacity>
                    )
                  })}
                </View>
              )}
            </View>
          )}
        </View>

        {/* ── Manager Override Timeout ───────────────────────────────────── */}
        <View
          style={{
            marginTop: s(16),
            borderRadius: s(12),
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
            backgroundColor: colors.panel
          }}
        >
          {renderSectionHeader(
            'Manager Override Timeout',
            <Lock size={s(14)} color={colors.teal} />,
            'managerOverride'
          )}
          {expandedSections.managerOverride && (
            <View style={{ padding: s(12), gap: s(6) }}>
              <Text
                style={{
                  fontSize: s(11),
                  color: colors.muted,
                  marginBottom: s(4),
                  paddingHorizontal: s(2)
                }}
              >
                After a manager enters their PIN to unlock a schedule-restricted
                menu or category, how long should it remain accessible without
                re-entering the PIN?
              </Text>
              {OVERRIDE_TIMEOUT_OPTIONS.map(option => {
                const isSelected =
                  managerOverrideTimeoutMinutes === option.value
                return (
                  <TouchableOpacity
                    key={option.value}
                    onPress={() =>
                      updateField('managerOverrideTimeoutMinutes', option.value)
                    }
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: s(10),
                      paddingVertical: s(9),
                      borderRadius: s(10),
                      borderWidth: 1,
                      backgroundColor: isSelected
                        ? colors.teal + '10'
                        : colors.screen,
                      borderColor: isSelected
                        ? colors.teal + '50'
                        : colors.border
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: s(13),
                          fontWeight: '600',
                          color: isSelected ? colors.teal : colors.heading
                        }}
                      >
                        {option.label}
                      </Text>
                      <Text
                        style={{
                          fontSize: s(10),
                          color: colors.muted,
                          marginTop: s(1)
                        }}
                      >
                        {option.description}
                      </Text>
                    </View>
                    {isSelected && (
                      <View
                        style={{
                          width: s(22),
                          height: s(22),
                          borderRadius: s(11),
                          backgroundColor: colors.teal,
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginLeft: s(10)
                        }}
                      >
                        <Check size={s(13)} color={colors.onSolid} />
                      </View>
                    )}
                  </TouchableOpacity>
                )
              })}
            </View>
          )}
        </View>

        {/* ── Order Completion Mode ──────────────────────────────────── */}
        <View
          style={{
            marginTop: s(16),
            borderRadius: s(12),
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
            backgroundColor: colors.panel
          }}
        >
          {renderSectionHeader(
            'Order Completion',
            <CheckCircle2 size={s(14)} color={colors.teal} />,
            'orderCompletion'
          )}
          {expandedSections.orderCompletion && (
            <View style={{ padding: s(12), gap: s(6) }}>
              <Text
                style={{
                  fontSize: s(11),
                  color: colors.muted,
                  marginBottom: s(4),
                  paddingHorizontal: s(2)
                }}
              >
                Control how orders transition to "completed" status. Completed
                orders are finalized for reporting and moved to order history.
              </Text>
              {ORDER_COMPLETION_OPTIONS.map(option => {
                const isSelected = orderCompletionMode === option.value
                return (
                  <TouchableOpacity
                    key={option.value}
                    onPress={() =>
                      updateField('orderCompletionMode', option.value)
                    }
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: s(10),
                      paddingVertical: s(9),
                      borderRadius: s(10),
                      borderWidth: 1,
                      backgroundColor: isSelected
                        ? colors.teal + '10'
                        : colors.screen,
                      borderColor: isSelected
                        ? colors.teal + '50'
                        : colors.border
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: s(13),
                          fontWeight: '600',
                          color: isSelected ? colors.teal : colors.heading
                        }}
                      >
                        {option.label}
                      </Text>
                      <Text
                        style={{
                          fontSize: s(10),
                          color: colors.muted,
                          marginTop: s(1)
                        }}
                      >
                        {option.description}
                      </Text>
                    </View>
                    {isSelected && (
                      <View
                        style={{
                          width: s(22),
                          height: s(22),
                          borderRadius: s(11),
                          backgroundColor: colors.teal,
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginLeft: s(10)
                        }}
                      >
                        <Check size={s(13)} color={colors.onSolid} />
                      </View>
                    )}
                  </TouchableOpacity>
                )
              })}
            </View>
          )}
        </View>

        {/* ── Staff Attribution (per-order PIN) ──────────────────────── */}
        <View
          style={{
            marginTop: s(16),
            borderRadius: s(12),
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
            backgroundColor: colors.panel
          }}
        >
          {renderSectionHeader(
            'Staff Attribution',
            <UserCheck size={s(14)} color={colors.teal} />,
            'staffAttribution'
          )}
          {expandedSections.staffAttribution && (
            <View style={{ padding: s(12) }}>
              <Text
                style={{
                  fontSize: s(11),
                  color: colors.muted,
                  marginBottom: s(10),
                  paddingHorizontal: s(2)
                }}
              >
                On shared registers, require a PIN before each new order so the
                staff who rings it up is credited as that order&apos;s creator.
                The PIN is attribution-only — it does not sign anyone in or clock
                them in/out. When off, the signed-in user is credited for every
                order.
              </Text>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() =>
                  updateField('requirePinPerOrder', !requirePinPerOrder)
                }
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: s(10),
                  paddingVertical: s(9),
                  borderRadius: s(10),
                  borderWidth: 1,
                  backgroundColor: requirePinPerOrder
                    ? colors.teal + '10'
                    : colors.screen,
                  borderColor: requirePinPerOrder
                    ? colors.teal + '50'
                    : colors.border
                }}
              >
                <View style={{ flex: 1, marginRight: s(10) }}>
                  <Text
                    style={{
                      fontSize: s(13),
                      fontWeight: '600',
                      color: requirePinPerOrder ? colors.teal : colors.heading
                    }}
                  >
                    Require PIN per order
                  </Text>
                  <Text
                    style={{
                      fontSize: s(10),
                      color: colors.muted,
                      marginTop: s(1)
                    }}
                  >
                    Return to a PIN prompt after each order is sent.
                  </Text>
                </View>
                <Switch
                  value={requirePinPerOrder}
                  onValueChange={value =>
                    updateField('requirePinPerOrder', value)
                  }
                  trackColor={{ false: colors.border, true: colors.teal }}
                  thumbColor={colors.onSolid}
                />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── Order Creation ─────────────────────────────────────────── */}
        <View
          style={{
            marginTop: s(16),
            borderRadius: s(12),
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
            backgroundColor: colors.panel
          }}
        >
          {renderSectionHeader(
            'Order Creation',
            <PlusCircle size={s(14)} color={colors.teal} />,
            'orderCreation'
          )}
          {expandedSections.orderCreation && (
            <View style={{ padding: s(12) }}>
              <Text
                style={{
                  fontSize: s(11),
                  color: colors.muted,
                  marginBottom: s(10),
                  paddingHorizontal: s(2)
                }}
              >
                When on, the register auto-creates an order when you open the
                order screen and after each payment. Turn this off to require the
                operator to explicitly start an order — the screen stays empty
                until then, and no order is created until the first item is added.
              </Text>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() =>
                  updateField('autoCreateOrder', !autoCreateOrder)
                }
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: s(10),
                  paddingVertical: s(9),
                  borderRadius: s(10),
                  borderWidth: 1,
                  backgroundColor: autoCreateOrder
                    ? colors.teal + '10'
                    : colors.screen,
                  borderColor: autoCreateOrder
                    ? colors.teal + '50'
                    : colors.border
                }}
              >
                <View style={{ flex: 1, marginRight: s(10) }}>
                  <Text
                    style={{
                      fontSize: s(13),
                      fontWeight: '600',
                      color: autoCreateOrder ? colors.teal : colors.heading
                    }}
                  >
                    Auto-create orders
                  </Text>
                  <Text
                    style={{
                      fontSize: s(10),
                      color: colors.muted,
                      marginTop: s(1)
                    }}
                  >
                    Off: operator must explicitly start each order.
                  </Text>
                </View>
                <Switch
                  value={autoCreateOrder}
                  onValueChange={value =>
                    updateField('autoCreateOrder', value)
                  }
                  trackColor={{ false: colors.border, true: colors.teal }}
                  thumbColor={colors.onSolid}
                />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  )
}

export default OrderLineSettingsScreen
