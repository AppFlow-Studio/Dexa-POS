/**
 * Tip Settings Screen
 *
 * Configure tip presets, behavior, and view active tip pool/tipout rules (read-only).
 */

import { Switch } from '@/components/ui/switch'
import { colors } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import {
  fetchTipDistributionRulesOverview,
  TipDistributionRulesOverview,
} from '@/services/endOfDayService'
import { useLocationConfigStore } from '@/stores/useLocationConfigStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { useSupabaseClient } from '@/hooks/useSupabaseClient'
import type { TipsConfig } from '@/types/locationConfig'
import {
  AlertTriangle,
  Clock,
  DollarSign,
  Percent,
  Plus,
  Settings,
  Trash2,
  Users,
  X,
} from 'lucide-react-native'
import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

export default function TipSettingsScreen() {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const tipsConfig = useLocationConfigStore(s => s.config.tips)
  const _updateConfig = useLocationConfigStore(s => s.updateConfig)
  const updateTips = useCallback(
    (partial: Partial<TipsConfig>) => _updateConfig('tips', partial),
    [_updateConfig]
  )

  const selectedStore = useStoreSettingsStore(s => s.selectedStore)
  const locationId = selectedStore?.id || ''
  const supabase = useSupabaseClient()

  // Preset editing
  const [showPresetModal, setShowPresetModal] = useState(false)
  const [newPresetValue, setNewPresetValue] = useState('')

  // Active rules (read-only)
  const [rulesData, setRulesData] = useState<TipDistributionRulesOverview | null>(null)
  const [rulesLoading, setRulesLoading] = useState(false)

  useEffect(() => {
    if (!locationId) return
    setRulesLoading(true)
    fetchTipDistributionRulesOverview(supabase, locationId)
      .then(setRulesData)
      .catch(() => setRulesData(null))
      .finally(() => setRulesLoading(false))
  }, [locationId, supabase])

  const presets = tipsConfig.presetPercentages ?? [18, 20, 25]

  const addPreset = () => {
    const num = parseFloat(newPresetValue)
    if (isNaN(num) || num <= 0 || num > 100) return
    if (presets.includes(num)) return
    const updated = [...presets, num].sort((a, b) => a - b)
    updateTips({ presetPercentages: updated })
    setNewPresetValue('')
    setShowPresetModal(false)
  }

  const removePreset = (pct: number) => {
    const updated = presets.filter(p => p !== pct)
    if (updated.length === 0) return
    updateTips({ presetPercentages: updated })
  }

  const formatTipSource = (raw: string) => {
    switch (raw) {
      case 'charged_tips': return 'Charged Tips'
      case 'all_tips': return 'All Tips'
      case 'cash_only': return 'Cash Only'
      default: return raw.replace(/_/g, ' ')
    }
  }

  const formatRuleValue = (rule: TipDistributionRulesOverview['rules'][number]) => {
    if (rule.tipOutType === 'flat_amount') return `$${rule.tipOutValue.toFixed(2)} flat`
    if (rule.tipOutType === 'percentage_of_tips') return `${rule.tipOutValue.toFixed(1)}% of tips`
    if (rule.tipOutType === 'percentage_of_sales') return `${rule.tipOutValue.toFixed(1)}% of sales`
    return `${rule.tipOutValue} ${rule.tipOutType}`
  }

  // ── Render helpers ──────────────────────────────────────────────────────────

  const renderToggleRow = (
    label: string,
    description: string,
    value: boolean,
    onToggle: (v: boolean) => void,
    icon: React.ReactNode
  ) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: s(10),
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
        <View
          style={{
            width: s(32),
            height: s(32),
            backgroundColor: colors.teal + '15',
            borderRadius: s(8),
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: s(10),
          }}
        >
          {icon}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: s(13), color: colors.heading, fontWeight: '500' }}>{label}</Text>
          <Text style={{ fontSize: s(10), color: colors.muted, marginTop: s(1) }}>{description}</Text>
        </View>
      </View>
      <Switch checked={value} onCheckedChange={onToggle} />
    </View>
  )

  const renderNumericRow = (
    label: string,
    description: string,
    value: number,
    onChange: (v: number) => void,
    suffix: string,
    icon: React.ReactNode
  ) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: s(10),
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <View
        style={{
          width: s(32),
          height: s(32),
          backgroundColor: colors.teal + '15',
          borderRadius: s(8),
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: s(10),
        }}
      >
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: s(13), color: colors.heading, fontWeight: '500' }}>{label}</Text>
        <Text style={{ fontSize: s(10), color: colors.muted, marginTop: s(1) }}>{description}</Text>
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.screen,
          borderRadius: s(8),
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <TextInput
          value={String(value)}
          onChangeText={text => {
            const num = parseFloat(text)
            if (!isNaN(num) && num >= 0) onChange(num)
            else if (text === '') onChange(0)
          }}
          keyboardType='decimal-pad'
          style={{
            width: s(60),
            paddingHorizontal: s(10),
            paddingVertical: s(7),
            color: colors.heading,
            fontSize: s(14),
            textAlign: 'center',
          }}
        />
        <Text style={{ fontSize: s(11), color: colors.muted, paddingRight: s(10) }}>{suffix}</Text>
      </View>
    </View>
  )

  // ── Main render ─────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen }}>
      {/* Add Preset Modal */}
      <Modal visible={showPresetModal} transparent animationType='fade'>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <View
            style={{
              width: s(320),
              backgroundColor: colors.panel,
              borderRadius: s(16),
              padding: s(20),
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: s(16) }}>
              <Text style={{ fontSize: s(15), fontWeight: '700', color: colors.heading }}>Add Tip Preset</Text>
              <TouchableOpacity onPress={() => setShowPresetModal(false)} hitSlop={s(8)}>
                <X size={s(18)} color={colors.muted} />
              </TouchableOpacity>
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: colors.screen,
                borderRadius: s(10),
                borderWidth: 1,
                borderColor: colors.border,
                marginBottom: s(16),
              }}
            >
              <TextInput
                value={newPresetValue}
                onChangeText={setNewPresetValue}
                keyboardType='decimal-pad'
                placeholder='e.g. 22'
                placeholderTextColor={colors.muted}
                style={{
                  flex: 1,
                  paddingHorizontal: s(14),
                  paddingVertical: s(12),
                  color: colors.heading,
                  fontSize: s(16),
                }}
                autoFocus
              />
              <Text style={{ fontSize: s(16), color: colors.muted, paddingRight: s(14) }}>%</Text>
            </View>
            <TouchableOpacity
              onPress={addPreset}
              style={{
                backgroundColor: colors.teal,
                borderRadius: s(10),
                paddingVertical: s(12),
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: s(14), fontWeight: '700', color: colors.onSolid }}>Add Preset</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: s(16), paddingBottom: s(40) }}
      >
        {/* Header */}
        <Text style={{ fontSize: s(20), fontWeight: '800', color: colors.heading, marginBottom: s(4) }}>
          Tip Settings
        </Text>
        <Text style={{ fontSize: s(12), color: colors.muted, marginBottom: s(16) }}>
          Configure how tips are collected, displayed, and managed at this location.
        </Text>
        <View style={{ height: 1, backgroundColor: colors.border, marginBottom: s(16) }} />

        {/* Section 1: CFD Tip Presets */}
        <View
          style={{
            backgroundColor: colors.panel,
            padding: s(14),
            borderRadius: s(14),
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: s(12),
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: s(12) }}>
            <View
              style={{
                width: s(32),
                height: s(32),
                backgroundColor: colors.teal + '15',
                borderRadius: s(8),
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: s(10),
              }}
            >
              <Percent size={s(16)} color={colors.teal} />
            </View>
            <Text style={{ fontSize: s(14), fontWeight: '700', color: colors.heading }}>
              Tip Presets
            </Text>
          </View>
          <Text style={{ fontSize: s(11), color: colors.muted, marginBottom: s(12) }}>
            Percentage options shown to customers on the tip selection screen.
          </Text>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s(8), marginBottom: s(12) }}>
            {presets.map(pct => (
              <View
                key={pct}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: colors.teal + '18',
                  borderRadius: s(20),
                  paddingHorizontal: s(12),
                  paddingVertical: s(6),
                  borderWidth: 1,
                  borderColor: colors.teal + '40',
                }}
              >
                <Text style={{ fontSize: s(13), fontWeight: '700', color: colors.teal, marginRight: s(6) }}>
                  {pct}%
                </Text>
                {presets.length > 1 && (
                  <TouchableOpacity onPress={() => removePreset(pct)} hitSlop={s(6)}>
                    <X size={s(14)} color={colors.teal} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
            <TouchableOpacity
              onPress={() => setShowPresetModal(true)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: colors.card,
                borderRadius: s(20),
                paddingHorizontal: s(12),
                paddingVertical: s(6),
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Plus size={s(14)} color={colors.label} />
              <Text style={{ fontSize: s(12), color: colors.label, marginLeft: s(4) }}>Add</Text>
            </TouchableOpacity>
          </View>

          {renderToggleRow(
            'Allow Custom Amount',
            'Let customers enter a custom tip amount',
            tipsConfig.allowCustom ?? true,
            v => updateTips({ allowCustom: v }),
            <DollarSign size={s(16)} color={colors.teal} />
          )}

          {renderNumericRow(
            'Max Tip Percentage',
            'Cap custom tips at this % of the order subtotal',
            tipsConfig.maxTipPercentage ?? 100,
            v => updateTips({ maxTipPercentage: v }),
            '%',
            <AlertTriangle size={s(16)} color={colors.teal} />
          )}
        </View>

        {/* Section 2: Tip Behavior */}
        <View
          style={{
            backgroundColor: colors.panel,
            padding: s(14),
            borderRadius: s(14),
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: s(12),
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: s(12) }}>
            <View
              style={{
                width: s(32),
                height: s(32),
                backgroundColor: colors.teal + '15',
                borderRadius: s(8),
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: s(10),
              }}
            >
              <Settings size={s(16)} color={colors.teal} />
            </View>
            <Text style={{ fontSize: s(14), fontWeight: '700', color: colors.heading }}>
              Tip Behavior
            </Text>
          </View>

          {renderToggleRow(
            'Require Tip on Card',
            'Force a tip selection before processing card payments',
            tipsConfig.requireTipOnCard ?? false,
            v => updateTips({ requireTipOnCard: v }),
            <DollarSign size={s(16)} color={colors.teal} />
          )}

          {renderToggleRow(
            'Enable Tip on Cash',
            'Allow tip entry for cash payments',
            tipsConfig.enableTipOnCash ?? true,
            v => updateTips({ enableTipOnCash: v }),
            <DollarSign size={s(16)} color={colors.teal} />
          )}

          {renderToggleRow(
            'Open Drawer on Tip',
            'Automatically open the cash drawer when a tip is received',
            tipsConfig.openDrawerOnTip ?? false,
            v => updateTips({ openDrawerOnTip: v }),
            <DollarSign size={s(16)} color={colors.teal} />
          )}

          {renderNumericRow(
            'CFD Tip Timeout',
            'Seconds to wait for customer tip selection before auto-skipping',
            tipsConfig.tipAdjustTimeoutSeconds ?? 30,
            v => updateTips({ tipAdjustTimeoutSeconds: v }),
            'sec',
            <Clock size={s(16)} color={colors.teal} />
          )}

          {renderNumericRow(
            'High Tip Warning',
            'Show a warning when tip exceeds this % of the payment',
            tipsConfig.highTipWarningThreshold ?? 30,
            v => updateTips({ highTipWarningThreshold: v }),
            '%',
            <AlertTriangle size={s(16)} color={colors.teal} />
          )}
        </View>

        {/* Section 3: Active Rules (read-only) */}
        <View
          style={{
            backgroundColor: colors.panel,
            padding: s(14),
            borderRadius: s(14),
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: s(12),
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: s(4) }}>
            <View
              style={{
                width: s(32),
                height: s(32),
                backgroundColor: colors.teal + '15',
                borderRadius: s(8),
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: s(10),
              }}
            >
              <Users size={s(16)} color={colors.teal} />
            </View>
            <Text style={{ fontSize: s(14), fontWeight: '700', color: colors.heading }}>
              Active Tip Rules
            </Text>
          </View>
          <Text style={{ fontSize: s(10), color: colors.muted, marginBottom: s(12) }}>
            Tip pools and tip-out rules are managed from your Dexa dashboard.
          </Text>

          {rulesLoading ? (
            <ActivityIndicator size='small' color={colors.teal} style={{ paddingVertical: s(12) }} />
          ) : !rulesData ? (
            <Text style={{ fontSize: s(12), color: colors.label, paddingVertical: s(8) }}>
              Unable to load rules.
            </Text>
          ) : rulesData.configs.length === 0 && rulesData.rules.length === 0 ? (
            <Text style={{ fontSize: s(12), color: colors.label, paddingVertical: s(8) }}>
              No active tip pools or tip-out rules configured.
            </Text>
          ) : (
            <View style={{ gap: s(10) }}>
              {rulesData.configs.length > 0 && (
                <View style={{ gap: s(6) }}>
                  <Text style={{ fontSize: s(11), fontWeight: '700', color: colors.label }}>
                    Tip Pools
                  </Text>
                  {rulesData.configs.map(config => (
                    <View
                      key={config.id}
                      style={{
                        borderRadius: s(10),
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.card,
                        padding: s(10),
                        gap: s(4),
                      }}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: s(13), fontWeight: '700', color: colors.heading }}>
                          {config.name}
                        </Text>
                        <View
                          style={{
                            borderRadius: s(20),
                            paddingHorizontal: s(8),
                            paddingVertical: s(2),
                            backgroundColor: colors.teal + '20',
                          }}
                        >
                          <Text style={{ fontSize: s(10), fontWeight: '600', color: colors.teal }}>
                            {config.distributionMethod.replace('_', ' ')}
                          </Text>
                        </View>
                      </View>
                      <Text style={{ fontSize: s(11), color: colors.label }}>
                        Source: {formatTipSource(config.tipSource)} · {config.sourcePercentage}%
                      </Text>
                      {config.contributingRoleCodes.length > 0 && (
                        <Text style={{ fontSize: s(11), color: colors.label }}>
                          Contributing: {config.contributingRoleCodes.join(', ')}
                        </Text>
                      )}
                      {config.description ? (
                        <Text style={{ fontSize: s(11), color: colors.muted }}>{config.description}</Text>
                      ) : null}
                      {config.shares.length > 0 && (
                        <View style={{ gap: s(2), marginTop: s(2) }}>
                          {config.shares.map(share => (
                            <Text key={share.id} style={{ fontSize: s(10), color: colors.label }}>
                              {share.roleName || share.roleCode}: {share.sharePercentage}%
                              {share.pointsPerHour ? ` (${share.pointsPerHour} pts/hr)` : ''}
                            </Text>
                          ))}
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              )}

              {rulesData.rules.length > 0 && (
                <View style={{ gap: s(6) }}>
                  <Text style={{ fontSize: s(11), fontWeight: '700', color: colors.label }}>
                    Tip-Out Rules
                  </Text>
                  {rulesData.rules.map(rule => (
                    <View
                      key={rule.id}
                      style={{
                        borderRadius: s(10),
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.card,
                        padding: s(10),
                      }}
                    >
                      <Text style={{ fontSize: s(12), color: colors.heading }}>
                        {rule.fromRoleName || rule.fromRoleCode} {'->'} {rule.toRoleName || rule.toRoleCode}
                      </Text>
                      <Text style={{ fontSize: s(10), color: colors.label, marginTop: s(2) }}>
                        {formatRuleValue(rule)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  )
}
