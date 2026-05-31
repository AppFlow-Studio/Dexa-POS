import { colors } from '@/lib/theme'
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

const CustomAmountView = () => {
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
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border
        }}
      >
        <TouchableOpacity
          onPress={() => setView('split-options')}
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            backgroundColor: `${colors.teal}10`,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 10
          }}
        >
          <ArrowLeft size={16} color={colors.teal} />
        </TouchableOpacity>
        <View>
          <Text
            style={{ fontSize: 15, fontWeight: '700', color: colors.heading }}
          >
            Custom Amounts
          </Text>
          <Text style={{ fontSize: 11, color: colors.muted }}>
            Manually assign amounts to each guest.
          </Text>
        </View>
      </View>

      <View style={{ flex: 1, flexDirection: 'row', padding: 14, gap: 12 }}>
        {/* LEFT: Summary */}
        <View
          style={{
            width: '33%',
            backgroundColor: colors.panel,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 14,
            justifyContent: 'space-between'
          }}
        >
          <View>
            <Text
              style={{
                color: colors.muted,
                fontSize: 11,
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: 0.8,
                marginBottom: 14
              }}
            >
              Summary
            </Text>

            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginBottom: 10
              }}
            >
              <Text style={{ color: colors.muted, fontSize: 13 }}>
                Total Bill
              </Text>
              <Text
                style={{
                  color: colors.heading,
                  fontWeight: '700',
                  fontSize: 13
                }}
              >
                ${effectiveTotal.toFixed(2)}
              </Text>
            </View>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginBottom: 10
              }}
            >
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                Cash Total
              </Text>
              <Text style={{ color: colors.success, fontSize: 12 }}>
                ${effectiveCashTotal.toFixed(2)}
              </Text>
            </View>

            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginBottom: 10,
                paddingBottom: 10,
                borderBottomWidth: 1,
                borderBottomColor: colors.border
              }}
            >
              <Text style={{ color: colors.muted, fontSize: 13 }}>
                Allocated
              </Text>
              <Text
                style={{ color: colors.teal, fontWeight: '700', fontSize: 13 }}
              >
                ${totalAllocated.toFixed(2)}
              </Text>
            </View>

            <View>
              <Text
                style={{ color: colors.muted, fontSize: 12, marginBottom: 4 }}
              >
                Remaining
              </Text>
              <Text
                style={{
                  fontSize: 24,
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
                style={{ color: colors.success, fontSize: 11, marginTop: 4 }}
              >
                Cash remaining ${Math.max(0, remainingCash).toFixed(2)}
              </Text>
              {isOver && (
                <Text
                  style={{ color: colors.danger, fontSize: 11, marginTop: 4 }}
                >
                  Exceeds bill by ${Math.abs(remaining).toFixed(2)}
                </Text>
              )}
              {isPerfect && (
                <Text
                  style={{ color: colors.success, fontSize: 11, marginTop: 4 }}
                >
                  Perfectly split!
                </Text>
              )}
            </View>
          </View>

          <View style={{ gap: 8 }}>
            {!canProceed && (
              <View
                style={{
                  backgroundColor: colors.screen,
                  padding: 10,
                  borderRadius: 8
                }}
              >
                <Text
                  style={{
                    color: colors.muted,
                    fontSize: 11,
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
                  padding: 10,
                  borderRadius: 8
                }}
              >
                <Text
                  style={{
                    color: colors.warning,
                    fontSize: 11,
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
                paddingVertical: 10,
                borderRadius: 8,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                backgroundColor: canProceed ? colors.teal : colors.screen,
                borderWidth: canProceed ? 0 : 1,
                borderColor: colors.border,
                opacity: canProceed ? 1 : 0.6
              }}
            >
              {canProceed ? (
                <Check size={15} color={colors.onSolid} />
              ) : (
                <ArrowRight size={15} color={colors.muted} />
              )}
              <Text
                style={{
                  fontWeight: '700',
                  fontSize: 13,
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
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden'
          }}
        >
          <View
            style={{
              padding: 12,
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
                fontSize: 11,
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
                width: 28,
                height: 28,
                backgroundColor: colors.screen,
                borderRadius: 7,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Plus size={15} color={colors.teal} />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={{ padding: 12 }}
            showsVerticalScrollIndicator={false}
          >
            {splits.map(split => (
              <View
                key={split.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginBottom: 8,
                  backgroundColor: colors.screen,
                  padding: 10,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.border
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    flex: 1,
                    marginRight: 10
                  }}
                >
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      backgroundColor: colors.panel,
                      borderRadius: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 8
                    }}
                  >
                    <User size={13} color={colors.muted} />
                  </View>
                  <Text
                    style={{
                      fontSize: 13,
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
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                >
                  {remaining > 0 && (
                    <TouchableOpacity
                      onPress={() => handleFillRemaining(split.id)}
                      style={{
                        backgroundColor: `${colors.teal}15`,
                        paddingHorizontal: 8,
                        paddingVertical: 5,
                        borderRadius: 6,
                        borderWidth: 1,
                        borderColor: `${colors.teal}40`
                      }}
                    >
                      <Text
                        style={{
                          color: colors.teal,
                          fontSize: 11,
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
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      borderWidth: 1,
                      borderColor: colors.border,
                      width: 120,
                      height: 40
                    }}
                  >
                    <Text
                      style={{
                        fontWeight: '700',
                        fontSize: 14,
                        color: colors.muted,
                        marginRight: 3
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
                        fontSize: 14,
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
                    <View style={{ width: 78, gap: 2 }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 3
                        }}
                      >
                        <CreditCard size={11} color={colors.teal} />
                        <Text style={{ color: colors.teal, fontSize: 11 }}>
                          ${split.amount.toFixed(2)}
                        </Text>
                      </View>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 3
                        }}
                      >
                        <Banknote size={11} color={colors.success} />
                        <Text style={{ color: colors.success, fontSize: 11 }}>
                          ${(split.amount * cashRatio).toFixed(2)}
                        </Text>
                      </View>
                    </View>
                  )}

                  <TouchableOpacity
                    onPress={() => removeSplit(split.id)}
                    style={{
                      padding: 7,
                      backgroundColor: colors.screen,
                      borderRadius: 8
                    }}
                  >
                    <Trash2 size={15} color={colors.muted} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            {splits.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 60 }}>
                <Text style={{ color: colors.muted }}>No guests added.</Text>
                <TouchableOpacity
                  onPress={handleAddGuest}
                  style={{
                    marginTop: 12,
                    backgroundColor: colors.teal,
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    borderRadius: 8
                  }}
                >
                  <Text
                    style={{
                      color: colors.onSolid,
                      fontWeight: '700',
                      fontSize: 13
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
            width: 260,
            backgroundColor: colors.panel,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 12,
            justifyContent: 'center',
            alignItems: 'center'
          }}
        >
          <View style={{ width: '100%', alignItems: 'center' }}>
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
