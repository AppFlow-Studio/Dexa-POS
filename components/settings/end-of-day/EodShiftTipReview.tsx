/**
 * EodShiftTipReview
 *
 * Displays all shifts for the day with their cash tip declaration status.
 * Manager can declare tips for undeclared shifts inline.
 * Embedded in EodStepTips above the tip distribution snapshot.
 */

import {
  declareCashTips,
  fetchShiftDeclarationStatus,
  ShiftDeclarationRow,
} from '@/services/cashTipDeclarationService'
import { colors } from '@/lib/theme'
import { formatCurrency } from '@/utils/currency'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { SupabaseClient } from '@supabase/supabase-js'
import {
  AlertTriangle,
  Check,
  Circle,
  DollarSign,
  Users,
  X,
} from 'lucide-react-native'
import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'

// ── Types ───────────────────────────────────────────────────────────────────

interface EodShiftTipReviewProps {
  supabase: SupabaseClient
  locationId: string
  date: string // YYYY-MM-DD
  afterCutoff?: string | null // Last approved session cutoff — scope to current window
}

const NUM_PAD_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', '⌫'],
]

// ── Component ───────────────────────────────────────────────────────────────

export default function EodShiftTipReview({
  supabase,
  locationId,
  date,
  afterCutoff,
}: EodShiftTipReviewProps) {
  const selectedStore = useStoreSettingsStore(s => s.selectedStore)
  const bdConfig = {
    timezone: selectedStore?.timezone || 'UTC',
    rolloverHour: selectedStore?.business_day_start_hour ?? 0,
  }
  const [shifts, setShifts] = useState<ShiftDeclarationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Manager declare-for-them modal
  const [declareForShift, setDeclareForShift] = useState<ShiftDeclarationRow | null>(null)
  const [declareInput, setDeclareInput] = useState('0')
  const [declaring, setDeclaring] = useState(false)

  const loadShifts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchShiftDeclarationStatus(supabase, locationId, date, bdConfig, afterCutoff)
      setShifts(data)
    } catch (e: any) {
      setError(e?.message || 'Failed to load shifts')
    } finally {
      setLoading(false)
    }
  }, [supabase, locationId, date])

  useEffect(() => {
    if (locationId) loadShifts()
  }, [locationId, loadShifts])

  // Stats
  const completedShifts = shifts.filter(s => s.status === 'completed')
  const activeShifts = shifts.filter(s => s.status !== 'completed')
  const declaredShifts = completedShifts.filter(s => s.tipsDeclaredAt != null)
  const undeclaredShifts = completedShifts.filter(s => s.tipsDeclaredAt == null)
  const totalDeclared = shifts.reduce((sum, s) => sum + s.declaredCashTips, 0)

  // ── Manager declare numpad ─────────────────────────────────────────────

  const handleNumpadKey = (key: string) => {
    setDeclareInput(prev => {
      const next = prev === '0' && key !== '.' ? key : prev + key
      if (!/^\d*\.?\d{0,2}$/.test(next)) return prev
      if (parseFloat(next) > 10_000) return prev
      return next
    })
  }

  const handleBackspace = () => {
    setDeclareInput(prev => (prev.length <= 1 ? '0' : prev.slice(0, -1)))
  }

  const handleDeclareSubmit = async () => {
    if (!declareForShift) return
    const amount = parseFloat(declareInput) || 0

    if (amount > 1000) {
      Alert.alert(
        'Large Amount',
        `Declaring $${amount.toFixed(2)} for ${declareForShift.staffName}. Sure?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Confirm', onPress: () => submitDeclaration(amount) },
        ],
      )
    } else {
      await submitDeclaration(amount)
    }
  }

  const submitDeclaration = async (amount: number) => {
    if (!declareForShift) return
    setDeclaring(true)
    try {
      await declareCashTips(supabase, declareForShift.id, amount)
      setDeclareForShift(null)
      setDeclareInput('0')
      await loadShifts() // Refresh list
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to declare tips')
    } finally {
      setDeclaring(false)
    }
  }

  // ── Status badge ───────────────────────────────────────────────────────

  const renderStatusBadge = (shift: ShiftDeclarationRow) => {
    if (shift.status !== 'completed') {
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Circle size={8} color='#3B82F6' fill='#3B82F6' />
          <Text style={{ fontSize: 10, color: '#3B82F6', fontWeight: '600' }}>Active</Text>
        </View>
      )
    }
    if (shift.tipsDeclaredAt) {
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Check size={12} color={colors.success} />
          <Text style={{ fontSize: 10, color: colors.success, fontWeight: '600' }}>
            {formatCurrency(shift.declaredCashTips)}
          </Text>
        </View>
      )
    }
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <AlertTriangle size={10} color={colors.warning} />
        <Text style={{ fontSize: 10, color: colors.warning, fontWeight: '600' }}>Undeclared</Text>
      </View>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <View
      style={{
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.panel,
        padding: 12,
        gap: 10,
        marginBottom: 10,
      }}
    >
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              backgroundColor: colors.teal + '15',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Users size={14} color={colors.teal} />
          </View>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.heading }}>
            Shift Tip Declarations
          </Text>
        </View>
        <TouchableOpacity onPress={loadShifts} hitSlop={8}>
          <Text style={{ fontSize: 10, color: colors.label }}>
            {loading ? 'Loading...' : 'Refresh'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Error */}
      {error && (
        <Text style={{ fontSize: 11, color: colors.danger }}>{error}</Text>
      )}

      {/* Loading */}
      {loading && !shifts.length ? (
        <ActivityIndicator size='small' color={colors.teal} style={{ paddingVertical: 12 }} />
      ) : shifts.length === 0 ? (
        <Text style={{ fontSize: 12, color: colors.label, paddingVertical: 8 }}>
          No shifts found for today.
        </Text>
      ) : (
        <>
          {/* Shift rows */}
          <View style={{ gap: 4 }}>
            {shifts.map(shift => (
              <View
                key={shift.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 8,
                  paddingHorizontal: 10,
                  borderRadius: 10,
                  backgroundColor: colors.card,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                {/* Name + time */}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.heading }}>
                    {shift.staffName}
                  </Text>
                  <Text style={{ fontSize: 10, color: colors.muted, marginTop: 1 }}>
                    {new Date(shift.clockInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {shift.clockOutTime
                      ? ` — ${new Date(shift.clockOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                      : ' — now'}
                  </Text>
                </View>

                {/* Status */}
                <View style={{ minWidth: 80, alignItems: 'flex-end', marginRight: 8 }}>
                  {renderStatusBadge(shift)}
                </View>

                {/* Action */}
                {shift.status === 'completed' && !shift.tipsDeclaredAt && (
                  <TouchableOpacity
                    onPress={() => {
                      setDeclareForShift(shift)
                      setDeclareInput('0')
                    }}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 6,
                      backgroundColor: colors.teal + '18',
                      borderWidth: 1,
                      borderColor: colors.teal + '40',
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: '600', color: colors.teal }}>
                      Declare
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>

          {/* Summary bar */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingVertical: 8,
              paddingHorizontal: 10,
              borderRadius: 10,
              backgroundColor: undeclaredShifts.length > 0 ? colors.warning + '10' : colors.teal + '10',
              borderWidth: 1,
              borderColor: undeclaredShifts.length > 0 ? colors.warning + '30' : colors.teal + '30',
            }}
          >
            <View>
              <Text style={{ fontSize: 11, fontWeight: '600', color: colors.heading }}>
                {declaredShifts.length}/{completedShifts.length} shifts declared
                {activeShifts.length > 0 ? ` · ${activeShifts.length} active` : ''}
              </Text>
              {undeclaredShifts.length > 0 && (
                <Text style={{ fontSize: 10, color: colors.warning, marginTop: 2 }}>
                  {undeclaredShifts.length} undeclared — calculation will use $0 for those
                </Text>
              )}
            </View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.teal }}>
              {formatCurrency(totalDeclared)}
            </Text>
          </View>
        </>
      )}

      {/* Manager declare-for-them modal */}
      <Modal visible={!!declareForShift} transparent animationType='fade' onRequestClose={() => setDeclareForShift(null)}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.7)',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <View
            style={{
              width: 420,
              maxHeight: '80%',
              backgroundColor: colors.panel,
              borderRadius: 16,
              padding: 20,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.heading }}>
                Declare for {declareForShift?.staffName}
              </Text>
              <TouchableOpacity onPress={() => setDeclareForShift(null)} hitSlop={8}>
                <X size={18} color={colors.muted} />
              </TouchableOpacity>
            </View>

            {/* Dollar display */}
            <View
              style={{
                alignItems: 'center',
                paddingVertical: 14,
                borderRadius: 12,
                backgroundColor: colors.teal + '12',
                borderWidth: 1,
                borderColor: colors.teal + '40',
                marginBottom: 12,
              }}
            >
              <Text style={{ fontSize: 28, fontWeight: '800', color: colors.teal }}>
                ${declareInput}
              </Text>
            </View>

            {/* Numpad */}
            <View style={{ gap: 5, marginBottom: 14 }}>
              {NUM_PAD_ROWS.map((row, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 5 }}>
                  {row.map(key => (
                    <TouchableOpacity
                      key={key}
                      onPress={() => (key === '⌫' ? handleBackspace() : handleNumpadKey(key))}
                      style={{
                        flex: 1,
                        paddingVertical: 14,
                        borderRadius: 8,
                        backgroundColor: key === '⌫' ? colors.danger + '12' : colors.screen,
                        borderWidth: 1,
                        borderColor: key === '⌫' ? colors.danger + '35' : colors.border,
                        alignItems: 'center',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 18,
                          fontWeight: key === '⌫' ? '700' : '500',
                          color: key === '⌫' ? colors.danger : colors.heading,
                        }}
                      >
                        {key}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </View>

            {/* Buttons */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={() => {
                  setDeclareInput('0')
                  submitDeclaration(0)
                }}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.label }}>
                  Declare $0
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDeclareSubmit}
                disabled={declaring}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 10,
                  backgroundColor: colors.teal,
                  alignItems: 'center',
                  opacity: declaring ? 0.6 : 1,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.onSolid }}>
                  {declaring ? 'Saving...' : `Confirm $${declareInput}`}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}
