/**
 * Developer-only screen for toggling Bad-WiFi Phase 2 idempotency feature
 * flags. Hidden in production builds (returns null when !__DEV__). Use to
 * canary-test the v(n+1) RPCs locally before shipping per-location flips.
 *
 * Flags are MMKV-backed via `lib/network/featureFlags.ts`. Changes take
 * effect on the next RPC call — no app restart needed.
 */

import SettingsCard from '@/components/settings/SettingsCard'
import { Switch } from '@/components/ui/switch'
import {
  isIdempotentEnabled,
  isPaymentRecoveryUIEnabled,
  setIdempotentEnabled,
  setPaymentRecoveryUIEnabled,
  subscribeFlags,
  type IdempotentRpc,
} from '@/lib/network/featureFlags'
import { colors } from '@/lib/theme'
import { Redirect } from 'expo-router'
import {
  AlertTriangle,
  CheckCircle2,
  CircleOff,
  FlaskConical,
} from 'lucide-react-native'
import React, { useEffect, useState } from 'react'
import { ScrollView, Text, TouchableOpacity, View } from 'react-native'

const ALL_RPCS: { key: IdempotentRpc; label: string; description: string }[] = [
  { key: 'seat_guests', label: 'seat_guests', description: 'Seating guests at a table → seat_guests_v3' },
  { key: 'add_order_item', label: 'add_order_item', description: 'Hot path. Add menu item to order → add_order_item_v3' },
  { key: 'manage_order_discount', label: 'manage_order_discount', description: 'Apply / void discount → manage_order_discount_v2' },
  { key: 'add_order_item_modifier', label: 'add_order_item_modifier', description: 'Add a single modifier → _v2' },
  { key: 'remove_order_item_modifier', label: 'remove_order_item_modifier', description: 'Remove a single modifier → _v2' },
  { key: 'duplicate_order_item', label: 'duplicate_order_item', description: 'Duplicate an item with modifiers → _v2' },
  { key: 'replace_order_item_modifiers', label: 'replace_order_item_modifiers', description: 'Hot path. Replace all modifiers on an item → _v2 (signature dispatch)' },
  { key: 'recall_kds_items', label: 'recall_kds_items', description: 'Recall items from KDS → _v2' },
  { key: 'add_open_item', label: 'add_open_item', description: 'Add ad-hoc open item → add_open_item_v3' },
  { key: 'create_order', label: 'create_order', description: 'Create new order → create_order_v3' },
  { key: 'apply_refund_to_payment', label: 'apply_refund_to_payment', description: 'Money path. Apply refund to a payment → _v2' },
  { key: 'record_refund_items', label: 'record_refund_items', description: 'Money path. Record refund line items → _v2' },
  { key: 'create_reversal', label: 'create_reversal', description: 'Money path. Create reversal record → _v2' },
  { key: 'process_payment', label: 'process_payment', description: 'NOT WIRED — process_payment_v9 deferred' },
]

export default function DevFlagsScreen () {
  // Production build: redirect away, do not render the screen at all.
  if (!__DEV__) {
    return <Redirect href='/settings/general' />
  }

  // Subscribe to flag changes so toggling one updates the UI.
  const [, forceRender] = useState(0)
  useEffect(() => subscribeFlags(() => forceRender(n => n + 1)), [])

  const enabledCount = ALL_RPCS.filter(r => isIdempotentEnabled(r.key)).length
  const allOn = enabledCount === ALL_RPCS.length

  const setAll = (enabled: boolean) => {
    for (const r of ALL_RPCS) setIdempotentEnabled(r.key, enabled)
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      {/* Banner */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          padding: 12,
          borderRadius: 12,
          backgroundColor: colors.warning + '15',
          borderWidth: 1,
          borderColor: colors.warning + '40',
        }}
      >
        <FlaskConical size={20} color={colors.warning} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.heading, fontSize: 14, fontWeight: '700' }}>
            Developer-only — Bad-WiFi Phase 2 flags
          </Text>
          <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>
            Hidden in production builds. Toggling routes the client to v(n+1) RPCs that pass `p_idempotency_key`. Watch the `idempotency_keys` table on staging to confirm.
          </Text>
        </View>
      </View>

      {/* Master controls */}
      <SettingsCard title='Master Controls'>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          <TouchableOpacity
            onPress={() => setAll(true)}
            style={{
              flex: 1,
              padding: 12,
              borderRadius: 10,
              backgroundColor: allOn ? colors.teal + '15' : colors.card,
              borderWidth: 1,
              borderColor: allOn ? colors.teal : colors.border,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <CheckCircle2 size={16} color={allOn ? colors.teal : colors.muted} />
            <Text style={{ color: allOn ? colors.teal : colors.label, fontWeight: '600' }}>
              Enable All
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setAll(false)}
            style={{
              flex: 1,
              padding: 12,
              borderRadius: 10,
              backgroundColor: enabledCount === 0 ? colors.danger + '15' : colors.card,
              borderWidth: 1,
              borderColor: enabledCount === 0 ? colors.danger : colors.border,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <CircleOff size={16} color={enabledCount === 0 ? colors.danger : colors.muted} />
            <Text style={{ color: enabledCount === 0 ? colors.danger : colors.label, fontWeight: '600' }}>
              Disable All
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={{ color: colors.muted, fontSize: 12, textAlign: 'center' }}>
          {enabledCount} of {ALL_RPCS.length} RPCs flag-ON
        </Text>
      </SettingsCard>

      {/* Recovery UI flag */}
      <SettingsCard title='Wave 1: Recovery UI'>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 8,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.label, fontSize: 14, fontWeight: '600' }}>
              flag.paymentRecoveryUI
            </Text>
            <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
              Reserved for future verifying-state UI. Currently the defensive auth-check on payment-queue replay always runs (no flag needed).
            </Text>
          </View>
          <Switch
            checked={isPaymentRecoveryUIEnabled()}
            onCheckedChange={setPaymentRecoveryUIEnabled}
          />
        </View>
      </SettingsCard>

      {/* Per-RPC flags */}
      <SettingsCard title='Wave 2: Per-RPC Idempotency'>
        {ALL_RPCS.map((rpc, idx) => {
          const enabled = isIdempotentEnabled(rpc.key)
          const notWired = rpc.key === 'process_payment'
          return (
            <View
              key={rpc.key}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 12,
                borderBottomWidth: idx < ALL_RPCS.length - 1 ? 1 : 0,
                borderBottomColor: colors.border,
                opacity: notWired ? 0.5 : 1,
              }}
            >
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text
                    style={{
                      color: colors.label,
                      fontSize: 13,
                      fontWeight: '600',
                      fontFamily: 'monospace',
                    }}
                  >
                    {rpc.label}
                  </Text>
                  {notWired && (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 3,
                        backgroundColor: colors.warning + '20',
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 4,
                      }}
                    >
                      <AlertTriangle size={10} color={colors.warning} />
                      <Text style={{ fontSize: 9, color: colors.warning, fontWeight: '600' }}>
                        DEFERRED
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={{ color: colors.muted, fontSize: 11, marginTop: 3 }}>
                  {rpc.description}
                </Text>
              </View>
              <Switch
                checked={enabled}
                onCheckedChange={v => setIdempotentEnabled(rpc.key, v)}
                disabled={notWired}
              />
            </View>
          )
        })}
      </SettingsCard>
    </ScrollView>
  )
}
