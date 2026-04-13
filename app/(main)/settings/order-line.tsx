import { colors } from '@/lib/theme'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { Check, CheckCircle2, ChevronDown, ChevronUp, List, Lock } from 'lucide-react-native'
import React, { useState } from 'react'
import { ScrollView, Text, TouchableOpacity, View } from 'react-native'

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

const ORDER_COMPLETION_OPTIONS: { value: 'manual' | 'auto' | 'auto_on_payment'; label: string; description: string }[] = [
  { value: 'manual',          label: 'Manual',              description: 'Require "Mark as Done" to complete orders (current behavior)' },
  { value: 'auto',            label: 'Auto (Paid + Ready)', description: 'Auto-complete when order is fully paid AND kitchen marks ready' },
  { value: 'auto_on_payment', label: 'Auto on Payment',     description: 'Auto-complete immediately when order is fully paid, regardless of kitchen status' },
]

const OVERRIDE_TIMEOUT_OPTIONS: { value: 0 | 5 | 15 | 30 | 60; label: string; description: string }[] = [
  { value: 0,  label: 'Always Require PIN',   description: 'PIN required every time a locked menu or category is accessed' },
  { value: 5,  label: 'Stay Unlocked 5 min',  description: 'One PIN entry unlocks for 5 minutes' },
  { value: 15, label: 'Stay Unlocked 15 min', description: 'One PIN entry unlocks for 15 minutes' },
  { value: 30, label: 'Stay Unlocked 30 min', description: 'One PIN entry unlocks for 30 minutes' },
  { value: 60, label: 'Stay Unlocked 1 hour', description: 'One PIN entry unlocks for 60 minutes' },
]

const OrderLineSettingsScreen = () => {
  const orderLineSettings = useSettingsStore(s => s.orderLineSettings)
  const setOrderLineSettings = useSettingsStore(s => s.setOrderLineSettings)
  const managerOverrideTimeoutMinutes = useStoreSettingsStore(s => s.managerOverrideTimeoutMinutes)
  const orderCompletionMode = useStoreSettingsStore(s => s.orderCompletionMode)
  const updateField = useStoreSettingsStore(s => s.updateField)

  const [expandedSections, setExpandedSections] = useState({
    visibility: true,
    managerOverride: true,
    orderCompletion: true,
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
        paddingHorizontal: 14,
        paddingVertical: 11,
        borderBottomWidth: expandedSections[section] ? 1 : 0,
        borderBottomColor: colors.border
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
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
          {icon}
        </View>
        <Text
          style={{ fontSize: 13, fontWeight: '700', color: colors.heading }}
        >
          {title}
        </Text>
      </View>
      {expandedSections[section] ? (
        <ChevronUp size={14} color={colors.label} />
      ) : (
        <ChevronDown size={14} color={colors.label} />
      )}
    </TouchableOpacity>
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
      {/* Page Header */}
      <View style={{ marginBottom: 2 }}>
        <Text
          style={{ fontSize: 15, fontWeight: '700', color: colors.heading }}
        >
          Order Line Settings
        </Text>
        <Text style={{ fontSize: 11, color: colors.label, marginTop: 1 }}>
          Configure how orders appear in the order line.
        </Text>
      </View>

      <View
        style={{
          height: 1,
          backgroundColor: colors.border,
          marginVertical: 10
        }}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 12 }}
      >
        {/* Order Visibility */}
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: 10,
            overflow: 'hidden'
          }}
        >
          {renderSectionHeader(
            'Order Visibility',
            <List size={16} color={colors.teal} />,
            'visibility'
          )}
          {expandedSections.visibility && (
            <View style={{ padding: 12 }}>
              <Text
                style={{ fontSize: 10, color: colors.muted, marginBottom: 10 }}
              >
                Choose how many days of orders to display in the order line.
                Older orders will be hidden from the order line but can still be
                found in order history.
              </Text>

              <View style={{ gap: 6 }}>
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
                        paddingHorizontal: 10,
                        paddingVertical: 9,
                        borderRadius: 10,
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
                            fontSize: 13,
                            fontWeight: '600',
                            color: isSelected ? colors.teal : colors.heading
                          }}
                        >
                          {option.label}
                        </Text>
                        <Text
                          style={{
                            fontSize: 10,
                            color: colors.muted,
                            marginTop: 1
                          }}
                        >
                          {option.description}
                        </Text>
                      </View>
                      {isSelected && (
                        <View
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 11,
                            backgroundColor: colors.teal,
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginLeft: 10
                          }}
                        >
                          <Check size={13} color={colors.onSolid} />
                        </View>
                      )}
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>
          )}
        </View>

        {/* ── Manager Override Timeout ───────────────────────────────────── */}
        <View
          style={{
            marginTop: 16,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
            backgroundColor: colors.panel,
          }}
        >
          {renderSectionHeader(
            'Manager Override Timeout',
            <Lock size={14} color={colors.teal} />,
            'managerOverride',
          )}
          {expandedSections.managerOverride && (
            <View style={{ padding: 12, gap: 6 }}>
              <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 4, paddingHorizontal: 2 }}>
                After a manager enters their PIN to unlock a schedule-restricted menu or category, how long should it remain accessible without re-entering the PIN?
              </Text>
              {OVERRIDE_TIMEOUT_OPTIONS.map(option => {
                const isSelected = managerOverrideTimeoutMinutes === option.value
                return (
                  <TouchableOpacity
                    key={option.value}
                    onPress={() => updateField('managerOverrideTimeoutMinutes', option.value)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 10,
                      paddingVertical: 9,
                      borderRadius: 10,
                      borderWidth: 1,
                      backgroundColor: isSelected ? colors.teal + '10' : colors.screen,
                      borderColor: isSelected ? colors.teal + '50' : colors.border,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: isSelected ? colors.teal : colors.heading }}>
                        {option.label}
                      </Text>
                      <Text style={{ fontSize: 10, color: colors.muted, marginTop: 1 }}>
                        {option.description}
                      </Text>
                    </View>
                    {isSelected && (
                      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center', marginLeft: 10 }}>
                        <Check size={13} color={colors.onSolid} />
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
            marginTop: 16,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
            backgroundColor: colors.panel,
          }}
        >
          {renderSectionHeader(
            'Order Completion',
            <CheckCircle2 size={14} color={colors.teal} />,
            'orderCompletion',
          )}
          {expandedSections.orderCompletion && (
            <View style={{ padding: 12, gap: 6 }}>
              <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 4, paddingHorizontal: 2 }}>
                Control how orders transition to "completed" status. Completed orders are finalized for reporting and moved to order history.
              </Text>
              {ORDER_COMPLETION_OPTIONS.map(option => {
                const isSelected = orderCompletionMode === option.value
                return (
                  <TouchableOpacity
                    key={option.value}
                    onPress={() => updateField('orderCompletionMode', option.value)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 10,
                      paddingVertical: 9,
                      borderRadius: 10,
                      borderWidth: 1,
                      backgroundColor: isSelected ? colors.teal + '10' : colors.screen,
                      borderColor: isSelected ? colors.teal + '50' : colors.border,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: isSelected ? colors.teal : colors.heading }}>
                        {option.label}
                      </Text>
                      <Text style={{ fontSize: 10, color: colors.muted, marginTop: 1 }}>
                        {option.description}
                      </Text>
                    </View>
                    {isSelected && (
                      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center', marginLeft: 10 }}>
                        <Check size={13} color={colors.onSolid} />
                      </View>
                    )}
                  </TouchableOpacity>
                )
              })}
            </View>
          )}
        </View>

      </ScrollView>
    </View>
  )
}

export default OrderLineSettingsScreen
