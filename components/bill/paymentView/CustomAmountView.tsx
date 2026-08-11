import { useUiScale } from '@/lib/uiScale'
import { colors } from '@/lib/theme'
import { round2 } from '@/utils/money'
import { useActiveOrderTotals } from '@/stores/selectors/orderSelectors'
import { useOrderStore } from '@/stores/useOrderStore'
import { usePaymentStore } from '@/stores/usePaymentStore'
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  Check,
  CreditCard,
  Plus,
  Trash2,
  User
} from 'lucide-react-native'
import { useMemo, useRef, useState } from 'react'
import {
  KeyboardAvoidingView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native'
import NumericPad from './NumericPad'

/**
 * US bill denominations, laid out as keypad rows. Tapping one ADDS it to the
 * focused guest's amount rather than replacing it, so handing over three
 * twenties is three taps — the same motion as counting the bills out.
 */
const CASH_BILL_ROWS = [
  [1, 5, 10],
  [20, 50, 100]
]

const CustomAmountView = () => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const [focusedSplitId, setFocusedSplitId] = useState<string | null>(null)
  const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({})
  const inputRefs = useRef<Record<string, TextInput | null>>({})
  const splits = usePaymentStore(s => s.splits)
  const updateSplitAmount = usePaymentStore(s => s.updateSplitAmount)
  const setView = usePaymentStore(s => s.setView)
  const addSplit = usePaymentStore(s => s.addSplit)
  const removeSplit = usePaymentStore(s => s.removeSplit)
  const startSplitPaymentFlow = usePaymentStore(s => s.startSplitPaymentFlow)
  const orderTotals = useActiveOrderTotals()
  const activeOrderOutstandingTotal = orderTotals?.amountDue ?? 0
  const activeOrderTotal = orderTotals?.total ?? 0
  const activeOrderOutstandingCash = orderTotals?.cashAmountDue ?? 0
  const activeOrderCashTotal = orderTotals?.cashTotal ?? 0

  // Check if order already has payments (for effectiveTotal fallback)
  const activeOrder = useOrderStore(s =>
    s.activeOrderId ? s.ordersById[s.activeOrderId] : null
  )
  const hasPayments = (activeOrder?.payments ?? []).some(p => !p.isVoided)

  // Fallback to activeOrderTotal only if no payments exist (handles async timing)
  // If payments exist and outstanding is 0, the order is fully paid — don't show full total
  const effectiveTotal =
    activeOrderOutstandingTotal > 0
      ? activeOrderOutstandingTotal
      : hasPayments
      ? 0
      : activeOrderTotal
  const effectiveCashTotal =
    activeOrderOutstandingCash > 0
      ? activeOrderOutstandingCash
      : hasPayments
      ? 0
      : activeOrderCashTotal
  const cashRatio = effectiveTotal > 0 ? effectiveCashTotal / effectiveTotal : 1

  // --- MATH LOGIC ---
  const totalAllocated = useMemo(() => {
    return splits.reduce((sum, split) => sum + (split.amount || 0), 0)
  }, [splits])

  const remaining = effectiveTotal - totalAllocated
  const totalCashAllocated = totalAllocated * cashRatio
  const remainingCash = effectiveCashTotal - totalCashAllocated

  // Logic to determine status color
  const isPerfect = Math.abs(remaining) < 0.01
  const isOver = remaining < -0.01
  // Allow proceeding with any positive allocation that doesn't exceed total
  const canProceed = totalAllocated > 0.01 && !isOver

  const handleAddGuest = () => {
    addSplit(`Guest ${splits.length + 1}`)
  }

  const handleFillRemaining = (splitId: string) => {
    if (remaining > 0) {
      const currentAmount = splits.find(s => s.id === splitId)?.amount || 0
      const nextAmount = (currentAmount + remaining).toFixed(2)
      setAmountDrafts(drafts => ({ ...drafts, [splitId]: nextAmount }))
      updateSplitAmount(splitId, parseFloat(nextAmount))
    }
  }

  const updateAmountDraft = (splitId: string, text: string) => {
    if (!/^\d*\.?\d{0,2}$/.test(text)) return
    setAmountDrafts(drafts => ({ ...drafts, [splitId]: text }))
    const amount = parseFloat(text)
    updateSplitAmount(splitId, Number.isNaN(amount) ? 0 : amount)
  }

  const handleAddCashBill = (bill: number) => {
    if (!focusedSplitId) return
    const split = splits.find(s => s.id === focusedSplitId)
    if (!split) return
    const draft = amountDrafts[focusedSplitId]
    const current = draft !== undefined ? parseFloat(draft) : split.amount
    const base = Number.isNaN(current) ? 0 : current
    updateAmountDraft(focusedSplitId, round2(base + bill).toFixed(2))
  }

  // A bill is offered only while it still fits in what's unallocated. `remaining`
  // already nets out this guest's current amount (it comes off totalAllocated),
  // so this reads as "can I still hand over one more of these?" — and it goes
  // fully dim once the bill is covered, instead of letting a tap drop the split
  // into the over-allocated state that blocks Proceed.
  const canAddCashBill = (bill: number) =>
    !!focusedSplitId && bill <= remaining + 0.01

  const handleProceed = () => {
    // START THE PAYMENT LOOP HERE
    startSplitPaymentFlow('split-custom-amount')
  }

  return (
    <KeyboardAvoidingView
      behavior='padding'
      style={{ flex: 1, backgroundColor: colors.screen }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: s(14),
          paddingVertical: s(12),
          borderBottomWidth: 1,
          borderBottomColor: colors.border
        }}
      >
        <TouchableOpacity
          onPress={() => setView('split-options')}
          style={{
            width: s(32),
            height: s(32),
            borderRadius: s(10),
            backgroundColor: `${colors.teal}10`,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: s(10)
          }}
        >
          <ArrowLeft size={s(16)} color={colors.teal} />
        </TouchableOpacity>
        <View>
          <Text
            style={{ fontSize: s(15), fontWeight: '700', color: colors.heading }}
          >
            Custom Amounts
          </Text>
          <Text style={{ fontSize: s(11), color: colors.muted }}>
            Manually assign amounts to each guest.
          </Text>
        </View>
      </View>

      <View style={{ flex: 1, flexDirection: 'row', padding: s(14), gap: s(12) }}>
        {/* LEFT: Summary */}
        <View
          style={{
            width: '33%',
            backgroundColor: colors.panel,
            borderRadius: s(12),
            borderWidth: 1,
            borderColor: colors.border,
            padding: s(14),
            justifyContent: 'space-between'
          }}
        >
          <View>
            <Text
              style={{
                color: colors.muted,
                fontSize: s(11),
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: 0.8,
                marginBottom: s(14)
              }}
            >
              Summary
            </Text>

            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginBottom: s(10)
              }}
            >
              <Text style={{ color: colors.muted, fontSize: s(13) }}>
                Total Bill
              </Text>
              <Text
                style={{
                  color: colors.heading,
                  fontWeight: '700',
                  fontSize: s(13)
                }}
              >
                ${effectiveTotal.toFixed(2)}
              </Text>
            </View>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginBottom: s(10)
              }}
            >
              <Text style={{ color: colors.muted, fontSize: s(12) }}>
                Cash Total
              </Text>
              <Text style={{ color: colors.success, fontSize: s(12) }}>
                ${effectiveCashTotal.toFixed(2)}
              </Text>
            </View>

            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginBottom: s(10),
                paddingBottom: s(10),
                borderBottomWidth: 1,
                borderBottomColor: colors.border
              }}
            >
              <Text style={{ color: colors.muted, fontSize: s(13) }}>
                Allocated
              </Text>
              <Text
                style={{ color: colors.teal, fontWeight: '700', fontSize: s(13) }}
              >
                ${totalAllocated.toFixed(2)}
              </Text>
            </View>

            <View>
              <Text
                style={{ color: colors.muted, fontSize: s(12), marginBottom: s(4) }}
              >
                Remaining
              </Text>
              <Text
                style={{
                  fontSize: s(24),
                  fontWeight: '700',
                  color: isPerfect
                    ? colors.success
                    : isOver
                    ? colors.danger
                    : colors.heading
                }}
              >
                ${Math.abs(remaining).toFixed(2)}
              </Text>
              <Text
                style={{ color: colors.success, fontSize: s(11), marginTop: s(4) }}
              >
                Cash remaining ${Math.max(0, remainingCash).toFixed(2)}
              </Text>
              {isOver && (
                <Text
                  style={{ color: colors.danger, fontSize: s(11), marginTop: s(4) }}
                >
                  Exceeds bill by ${Math.abs(remaining).toFixed(2)}
                </Text>
              )}
              {isPerfect && (
                <Text
                  style={{ color: colors.success, fontSize: s(11), marginTop: s(4) }}
                >
                  Perfectly split!
                </Text>
              )}
            </View>
          </View>

          <View style={{ gap: s(8) }}>
            {!canProceed && (
              <View
                style={{
                  backgroundColor: colors.screen,
                  padding: s(10),
                  borderRadius: s(8)
                }}
              >
                <Text
                  style={{
                    color: colors.muted,
                    fontSize: s(11),
                    textAlign: 'center'
                  }}
                >
                  Assign amounts to enable payment.
                </Text>
              </View>
            )}
            {canProceed && !isPerfect && (
              <View
                style={{
                  backgroundColor: colors.screen,
                  padding: s(10),
                  borderRadius: s(8)
                }}
              >
                <Text
                  style={{
                    color: colors.warning,
                    fontSize: s(11),
                    textAlign: 'center'
                  }}
                >
                  ${remaining.toFixed(2)} remaining will stay unpaid.
                </Text>
              </View>
            )}

            <TouchableOpacity
              onPress={handleProceed}
              disabled={!canProceed}
              style={{
                width: '100%',
                paddingVertical: s(10),
                borderRadius: s(8),
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: s(6),
                backgroundColor: canProceed ? colors.teal : colors.screen,
                borderWidth: canProceed ? 0 : 1,
                borderColor: colors.border,
                opacity: canProceed ? 1 : 0.6
              }}
            >
              {canProceed ? (
                <Check size={s(15)} color={colors.onSolid} />
              ) : (
                <ArrowRight size={s(15)} color={colors.muted} />
              )}
              <Text
                style={{
                  fontWeight: '700',
                  fontSize: s(13),
                  color: canProceed ? colors.onSolid : colors.muted
                }}
              >
                {isPerfect ? 'Finalize Split' : 'Pay Allocated Amount'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* MIDDLE: Guest List */}
        <View
          style={{
            flex: 1,
            backgroundColor: colors.panel,
            borderRadius: s(12),
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden'
          }}
        >
          <View
            style={{
              padding: s(12),
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <Text
              style={{
                color: colors.muted,
                fontSize: s(11),
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: 0.8
              }}
            >
              Guest List
            </Text>
            <TouchableOpacity
              onPress={handleAddGuest}
              style={{
                width: s(28),
                height: s(28),
                backgroundColor: colors.screen,
                borderRadius: s(7),
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Plus size={s(15)} color={colors.teal} />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={{ padding: s(12) }}
            showsVerticalScrollIndicator={false}
          >
            {splits.map(split => (
              <View
                key={split.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginBottom: s(8),
                  backgroundColor: colors.screen,
                  padding: s(10),
                  borderRadius: s(10),
                  borderWidth: 1,
                  borderColor: colors.border
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    flex: 1,
                    marginRight: s(10)
                  }}
                >
                  <View
                    style={{
                      width: s(28),
                      height: s(28),
                      backgroundColor: colors.panel,
                      borderRadius: s(12),
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: s(8)
                    }}
                  >
                    <User size={s(13)} color={colors.muted} />
                  </View>
                  <Text
                    style={{
                      fontSize: s(13),
                      fontWeight: '700',
                      color: colors.label,
                      flex: 1
                    }}
                    numberOfLines={1}
                  >
                    {split.customerName}
                  </Text>
                </View>

                <View
                  style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}
                >
                  {remaining > 0 && (
                    <TouchableOpacity
                      onPress={() => handleFillRemaining(split.id)}
                      style={{
                        backgroundColor: `${colors.teal}15`,
                        paddingHorizontal: s(8),
                        paddingVertical: s(5),
                        borderRadius: s(6),
                        borderWidth: 1,
                        borderColor: `${colors.teal}40`
                      }}
                    >
                      <Text
                        style={{
                          color: colors.teal,
                          fontSize: s(11),
                          fontWeight: '700'
                        }}
                      >
                        Fill
                      </Text>
                    </TouchableOpacity>
                  )}

                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: colors.screen,
                      borderRadius: s(8),
                      paddingHorizontal: s(10),
                      borderWidth: 1,
                      borderColor: colors.border,
                      width: s(120),
                      height: s(40)
                    }}
                  >
                    <Text
                      style={{
                        fontWeight: '700',
                        fontSize: s(14),
                        color: colors.muted,
                        marginRight: s(3)
                      }}
                    >
                      $
                    </Text>
                    <TextInput
                      ref={ref => {
                        if (ref) inputRefs.current[split.id] = ref
                      }}
                      style={{
                        flex: 1,
                        fontSize: s(14),
                        fontWeight: '700',
                        color: colors.heading,
                        textAlign: 'right',
                        height: '100%'
                      }}
                      value={
                        amountDrafts[split.id] ??
                        (split.amount > 0 ? split.amount.toString() : '')
                      }
                      onChangeText={text => updateAmountDraft(split.id, text)}
                      onFocus={() => setFocusedSplitId(split.id)}
                      onBlur={() => setFocusedSplitId(null)}
                      placeholder='0.00'
                      placeholderTextColor={colors.muted}
                      showSoftInputOnFocus={false}
                      selectTextOnFocus
                    />
                  </View>

                  {split.amount > 0 && (
                    <View style={{ width: s(78), gap: s(2) }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: s(3)
                        }}
                      >
                        <CreditCard size={s(11)} color={colors.teal} />
                        <Text style={{ color: colors.teal, fontSize: s(11) }}>
                          ${split.amount.toFixed(2)}
                        </Text>
                      </View>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: s(3)
                        }}
                      >
                        <Banknote size={s(11)} color={colors.success} />
                        <Text style={{ color: colors.success, fontSize: s(11) }}>
                          ${(split.amount * cashRatio).toFixed(2)}
                        </Text>
                      </View>
                    </View>
                  )}

                  <TouchableOpacity
                    onPress={() => removeSplit(split.id)}
                    style={{
                      padding: s(7),
                      backgroundColor: colors.screen,
                      borderRadius: s(8)
                    }}
                  >
                    <Trash2 size={s(15)} color={colors.muted} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            {splits.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: s(60) }}>
                <Text style={{ color: colors.muted }}>No guests added.</Text>
                <TouchableOpacity
                  onPress={handleAddGuest}
                  style={{
                    marginTop: s(12),
                    backgroundColor: colors.teal,
                    paddingHorizontal: s(16),
                    paddingVertical: s(8),
                    borderRadius: s(8)
                  }}
                >
                  <Text
                    style={{
                      color: colors.onSolid,
                      fontWeight: '700',
                      fontSize: s(13)
                    }}
                  >
                    Add Guest
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>

        {/* RIGHT: Numeric Pad */}
        <View
          style={{
            width: s(260),
            backgroundColor: colors.panel,
            borderRadius: s(12),
            borderWidth: 1,
            borderColor: colors.border,
            padding: s(12),
            justifyContent: 'center',
            alignItems: 'center'
          }}
        >
          <View style={{ width: '100%', alignItems: 'center', gap: s(10) }}>
            {/* Cash bill presets — quick way to key common tenders without
                typing each digit. */}
            <View style={{ width: '100%' }}>
              <Text
                style={{
                  color: colors.muted,
                  fontSize: s(11),
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  letterSpacing: 0.8,
                  marginBottom: s(8)
                }}
              >
                Cash Bills
              </Text>
              <View style={{ gap: s(8) }}>
                {CASH_BILL_ROWS.map((row, rowIdx) => (
                  <View key={rowIdx} style={{ flexDirection: 'row', gap: s(8) }}>
                    {row.map(bill => {
                      const enabled = canAddCashBill(bill)
                      return (
                        <TouchableOpacity
                          key={bill}
                          onPress={() => handleAddCashBill(bill)}
                          disabled={!enabled}
                          style={{
                            flex: 1,
                            paddingVertical: s(10),
                            backgroundColor: enabled
                              ? `${colors.success}15`
                              : colors.screen,
                            borderWidth: 1,
                            borderColor: enabled
                              ? `${colors.success}40`
                              : colors.border,
                            borderRadius: s(8),
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: enabled ? 1 : 0.4
                          }}
                        >
                          <Text
                            style={{
                              fontSize: s(14),
                              fontWeight: '700',
                              color: enabled ? colors.success : colors.muted
                            }}
                          >
                            ${bill}
                          </Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                ))}
              </View>
            </View>

            <NumericPad
              enabled={!!focusedSplitId}
              onInput={value => {
                if (focusedSplitId) {
                  const split = splits.find(s => s.id === focusedSplitId)
                  if (split) {
                    const currentValue =
                      amountDrafts[focusedSplitId] ??
                      (split.amount > 0 ? split.amount.toString() : '')
                    updateAmountDraft(focusedSplitId, currentValue + value)
                  }
                }
              }}
              onBackspace={() => {
                if (focusedSplitId) {
                  const split = splits.find(s => s.id === focusedSplitId)
                  if (split) {
                    const currentValue =
                      amountDrafts[focusedSplitId] ??
                      (split.amount > 0 ? split.amount.toString() : '')
                    const newValue = currentValue.slice(0, -1)
                    updateAmountDraft(focusedSplitId, newValue)
                  }
                }
              }}
            />
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

export default CustomAmountView