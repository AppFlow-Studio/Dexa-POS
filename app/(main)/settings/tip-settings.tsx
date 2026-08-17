/**
 * Tip Settings Screen
 *
 * Configure tip presets, behavior, and view active tip pool/tipout rules (read-only).
 */

import { Switch } from '@/components/ui/switch'
import { colors } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import { useLocationConfigStore } from '@/stores/useLocationConfigStore'
import type { TipsConfig } from '@/types/locationConfig'
import { useRouter } from 'expo-router'
import {
  AlertTriangle,
  ChevronRight,
  Clock,
  DollarSign,
  HandCoins,
  Percent,
  Plus,
  Settings,
  X,
} from 'lucide-react-native'
import React, { useCallback, useState } from 'react'
import {
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

  const router = useRouter()

  // Preset editing
  const [showPresetModal, setShowPresetModal] = useState(false)
  const [newPresetValue, setNewPresetValue] = useState('')

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

        {/* Section 3: Pointer to Tip Management (pools, tip-out rules, distribution) */}
        <TouchableOpacity
          onPress={() => router.push('/settings/tips-management' as any)}
          activeOpacity={0.7}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.panel,
            padding: s(14),
            borderRadius: s(14),
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: s(12),
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
            <HandCoins size={s(16)} color={colors.teal} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: s(14), fontWeight: '700', color: colors.heading }}>
              Tip Pools & Tip-Out Rules
            </Text>
            <Text style={{ fontSize: s(10), color: colors.muted, marginTop: s(1) }}>
              View pools, tip-out rules, and distribution in Tip Management.
            </Text>
          </View>
          <ChevronRight size={s(18)} color={colors.muted} />
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}
