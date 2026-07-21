/**
 * Fraud Detection Settings Screen
 *
 * Configure refund-to-self velocity detection: toggle on/off,
 * set alert/block thresholds, and adjust the time window.
 */

import { Switch } from '@/components/ui/switch'
import { colors } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import { useLocationConfigStore } from '@/stores/useLocationConfigStore'
import { useRefundFraudGuardStore } from '@/stores/useRefundFraudGuardStore'
import {
  AlertTriangle,
  Clock,
  Hash,
  Shield,
  ShieldOff,
  Trash2
} from 'lucide-react-native'
import React, { useCallback, useState } from 'react'
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native'

export default function FraudDetectionScreen() {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const fraudConfig = useLocationConfigStore(s => s.config.fraudDetection)
  const _updateConfig = useLocationConfigStore(s => s.updateConfig)
  const update = useCallback(
    (partial: Partial<typeof fraudConfig>) =>
      _updateConfig('fraudDetection', partial),
    [_updateConfig]
  )

  const eventCount = useRefundFraudGuardStore(s => s.events.length)
  const clearEvents = useRefundFraudGuardStore(s => s.recordSelfRefund) // unused, we'll use setState

  const [showClearConfirm, setShowClearConfirm] = useState(false)

  const handleClearEvents = () => {
    useRefundFraudGuardStore.setState({ events: [] })
    setShowClearConfirm(false)
  }

  // ─── Render helpers ─────────────────────────────────────────────────────

  const renderToggleRow = (
    label: string,
    description: string,
    value: boolean,
    onToggle: (v: boolean) => void
  ) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: s(10),
        borderBottomWidth: 1,
        borderBottomColor: colors.border
      }}
    >
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={{ fontSize: s(13), fontWeight: '600', color: colors.heading }}>
          {label}
        </Text>
        <Text style={{ fontSize: s(11), color: colors.muted, marginTop: s(2) }}>
          {description}
        </Text>
      </View>
      <Switch checked={value} onCheckedChange={onToggle} />
    </View>
  )

  const renderNumberRow = (
    label: string,
    description: string,
    value: number,
    onChange: (v: number) => void,
    min: number = 1,
    max: number = 999
  ) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: s(10),
        borderBottomWidth: 1,
        borderBottomColor: colors.border
      }}
    >
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={{ fontSize: s(13), fontWeight: '600', color: colors.heading }}>
          {label}
        </Text>
        <Text style={{ fontSize: s(11), color: colors.muted, marginTop: s(2) }}>
          {description}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
        <TouchableOpacity
          onPress={() => onChange(Math.max(min, value - 1))}
          style={{
            width: s(36),
            height: s(36),
            borderRadius: s(8),
            backgroundColor: colors.screen,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Text style={{ fontSize: s(16), fontWeight: '700', color: colors.heading }}>
            -
          </Text>
        </TouchableOpacity>
        <TextInput
          value={String(value)}
          onChangeText={text => {
            const n = parseInt(text, 10)
            if (!isNaN(n) && n >= min && n <= max) onChange(n)
          }}
          keyboardType="numeric"
          style={{
            width: s(56),
            height: s(36),
            backgroundColor: colors.screen,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: s(8),
            textAlign: 'center',
            fontSize: s(15),
            fontWeight: '700',
            color: colors.heading,
            paddingVertical: 0,
          }}
        />
        <TouchableOpacity
          onPress={() => onChange(Math.min(max, value + 1))}
          style={{
            width: s(36),
            height: s(36),
            borderRadius: s(8),
            backgroundColor: colors.screen,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Text style={{ fontSize: s(16), fontWeight: '700', color: colors.heading }}>
            +
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen, paddingHorizontal: s(14) }}>
      {/* Header */}
      <View style={{ marginBottom: s(12), marginTop: s(8) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
          <Shield size={s(18)} color={colors.teal} />
          <Text style={{ fontSize: s(15), fontWeight: '700', color: colors.heading }}>
            Fraud Detection
          </Text>
        </View>
        <Text style={{ fontSize: s(11), color: colors.muted, marginTop: s(4) }}>
          Detect and prevent refund-to-self fraud patterns. When enabled, the
          system tracks when the same cashier who created an order also refunds
          it for cash, and escalates through alert and block thresholds.
        </Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Master toggle */}
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: s(12),
            borderWidth: 1,
            borderColor: fraudConfig.refundToSelfEnabled
              ? colors.teal + '40'
              : colors.border,
            marginBottom: s(10),
            overflow: 'hidden',
            padding: 14
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <View
                style={{
                  width: s(36),
                  height: s(36),
                  borderRadius: 10,
                  backgroundColor: fraudConfig.refundToSelfEnabled
                    ? colors.teal + '18'
                    : colors.card,
                  borderWidth: 1,
                  borderColor: fraudConfig.refundToSelfEnabled
                    ? colors.teal + '40'
                    : colors.border,
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {fraudConfig.refundToSelfEnabled ? (
                  <Shield size={s(18)} color={colors.teal} />
                ) : (
                  <ShieldOff size={s(18)} color={colors.muted} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: s(14),
                    fontWeight: '700',
                    color: colors.heading
                  }}
                >
                  Refund-to-Self Guard
                </Text>
                <Text style={{ fontSize: s(11), color: colors.muted }}>
                  {fraudConfig.refundToSelfEnabled
                    ? 'Active — monitoring same-cashier cash refunds'
                    : 'Disabled — no refund velocity checks'}
                </Text>
              </View>
            </View>
            <Switch
              checked={fraudConfig.refundToSelfEnabled}
              onCheckedChange={v => update({ refundToSelfEnabled: v })}
            />
          </View>
        </View>

        {/* Threshold settings — only shown when enabled */}
        {fraudConfig.refundToSelfEnabled && (
          <View
            style={{
              backgroundColor: colors.panel,
              borderRadius: s(12),
              borderWidth: 1,
              borderColor: colors.border,
              marginBottom: s(10),
              overflow: 'hidden',
              padding: 14
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8), marginBottom: 10 }}>
              <AlertTriangle size={s(14)} color={colors.warning} />
              <Text style={{ fontSize: s(13), fontWeight: '700', color: colors.heading }}>
                Thresholds
              </Text>
            </View>

            {renderNumberRow(
              'Alert After',
              'Number of same-cashier cash refunds before a manager alert is triggered',
              fraudConfig.alertThreshold,
              v => update({ alertThreshold: v }),
              1,
              20
            )}

            {renderNumberRow(
              'Block After',
              'Number of same-cashier cash refunds before the refund is blocked pending manager PIN',
              fraudConfig.blockThreshold,
              v => update({ blockThreshold: v }),
              1,
              20
            )}

            <View style={{ paddingVertical: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Clock size={s(12)} color={colors.muted} />
                <Text style={{ fontSize: s(13), fontWeight: '600', color: colors.heading }}>
                  Time Window
                </Text>
              </View>
              <Text style={{ fontSize: s(11), color: colors.muted, marginBottom: s(8) }}>
                How far back to look when counting refunds (in minutes)
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
                <TextInput
                  value={String(fraudConfig.windowMinutes)}
                  onChangeText={text => {
                    const n = parseInt(text, 10)
                    if (!isNaN(n) && n >= 5 && n <= 1440) update({ windowMinutes: n })
                  }}
                  keyboardType="numeric"
                  style={{
                    width: s(72),
                    height: s(36),
                    backgroundColor: colors.screen,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: s(8),
                    textAlign: 'center',
                    fontSize: s(15),
                    fontWeight: '700',
                    color: colors.heading,
                    paddingVertical: 0,
                  }}
                />
                <Text style={{ fontSize: s(13), color: colors.label }}>minutes</Text>
              </View>
            </View>

            {/* Validation warning */}
            {fraudConfig.alertThreshold > fraudConfig.blockThreshold && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: colors.warning + '15',
                  borderWidth: 1,
                  borderColor: colors.warning + '40',
                  borderRadius: s(8),
                  padding: 10,
                  marginTop: 6
                }}
              >
                <AlertTriangle size={s(14)} color={colors.warning} />
                <Text style={{ fontSize: s(11), color: colors.warning, flex: 1 }}>
                  Alert threshold should be less than or equal to block threshold.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Event log status */}
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: s(12),
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: s(10),
            overflow: 'hidden',
            padding: 14
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8), marginBottom: s(8) }}>
            <Hash size={s(14)} color={colors.label} />
            <Text style={{ fontSize: s(13), fontWeight: '700', color: colors.heading }}>
              Current Session
            </Text>
          </View>

          <Text style={{ fontSize: s(12), color: colors.muted, marginBottom: 10 }}>
            {eventCount === 0
              ? 'No flagged refund events on this device.'
              : `${eventCount} flagged refund event${eventCount !== 1 ? 's' : ''} tracked on this device.`}
          </Text>

          {eventCount > 0 && (
            <>
              {!showClearConfirm ? (
                <TouchableOpacity
                  onPress={() => setShowClearConfirm(true)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    paddingVertical: 8,
                    borderRadius: s(8),
                    backgroundColor: colors.danger + '10',
                    borderWidth: 1,
                    borderColor: colors.danger + '30'
                  }}
                >
                  <Trash2 size={s(14)} color={colors.danger} />
                  <Text style={{ fontSize: s(12), fontWeight: '600', color: colors.danger }}>
                    Clear Event Log
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={{ flexDirection: 'row', gap: s(8) }}>
                  <TouchableOpacity
                    onPress={() => setShowClearConfirm(false)}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      borderRadius: s(8),
                      borderWidth: 1,
                      borderColor: colors.border,
                      alignItems: 'center'
                    }}
                  >
                    <Text style={{ fontSize: s(12), fontWeight: '600', color: colors.label }}>
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleClearEvents}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      borderRadius: s(8),
                      backgroundColor: colors.danger,
                      alignItems: 'center'
                    }}
                  >
                    <Text style={{ fontSize: s(12), fontWeight: '700', color: colors.onSolid }}>
                      Confirm Clear
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>

        {/* Info card */}
        <View
          style={{
            backgroundColor: colors.teal + '08',
            borderRadius: s(12),
            borderWidth: 1,
            borderColor: colors.teal + '20',
            padding: 14,
            marginBottom: 20
          }}
        >
          <Text style={{ fontSize: s(12), fontWeight: '600', color: colors.teal, marginBottom: 6 }}>
            How it works
          </Text>
          <Text style={{ fontSize: s(11), color: colors.label, lineHeight: 16 }}>
            When a cashier refunds a cash order they created:{'\n'}
            {'\u2022'} After {fraudConfig.alertThreshold} refund{fraudConfig.alertThreshold !== 1 ? 's' : ''}: a warning toast and notification are shown{'\n'}
            {'\u2022'} After {fraudConfig.blockThreshold} refund{fraudConfig.blockThreshold !== 1 ? 's' : ''}: the refund is blocked until a manager enters their PIN{'\n'}
            {'\u2022'} All flagged refunds are logged to the audit trail for nightly review{'\n'}
            {'\u2022'} The counter resets after {fraudConfig.windowMinutes} minutes of no activity
          </Text>
        </View>
      </ScrollView>
    </View>
  )
}
