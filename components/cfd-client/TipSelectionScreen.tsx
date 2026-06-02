import { useCFDDisplayField } from '@/contexts/CFDDisplayDataContext.base'
import { iosOnly } from '@/lib/safeAnimations'
import { colors } from '@/lib/theme'
import { Delete } from 'lucide-react-native'
import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native'
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated'


interface Props {
  onTipSelected: (tipAmount: number, tipPercentage: number | null) => void
}

export function TipSelectionScreen({ onTipSelected }: Props) {
  const tipConfig = useCFDDisplayField('tipConfig')
  const externalTipAmount = useCFDDisplayField('tipAmount')
  const externalTipPercentage = useCFDDisplayField('tipPercentage')
  const themeMode = useCFDDisplayField('themeMode')

  const [selectedPercentage, setSelectedPercentage] = useState<number | null>(
    null
  )
  const [customAmount, setCustomAmount] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [hasMadeSelection, setHasMadeSelection] = useState(false)

  type ConfirmStatus = 'idle' | 'confirming' | 'failed'
  const [confirmStatus, setConfirmStatus] = useState<ConfirmStatus>('idle')
  const isConfirming = confirmStatus !== 'idle'

  useEffect(() => {
    if (confirmStatus === 'confirming') {
      const t = setTimeout(() => setConfirmStatus('failed'), 4000)
      return () => clearTimeout(t)
    }
    if (confirmStatus === 'failed') {
      const t = setTimeout(() => setConfirmStatus('idle'), 1500)
      return () => clearTimeout(t)
    }
    return undefined
  }, [confirmStatus])

  useEffect(() => {
    setSelectedPercentage(externalTipPercentage)
    if (externalTipPercentage === null && externalTipAmount > 0) {
      setCustomAmount((externalTipAmount / 100).toFixed(2))
      setShowCustom(true)
      setHasMadeSelection(true)
    } else if (externalTipAmount === 0) {
      setCustomAmount('')
      setShowCustom(false)
      setHasMadeSelection(false)
    }
  }, [externalTipPercentage, externalTipAmount])

  const subtotal = tipConfig?.subtotalForTip ?? 0
  const presets = tipConfig?.presetPercentages ?? [15, 20, 25]
  const maxTipPct = tipConfig?.maxTipPercentage ?? 100
  const maxTipCents =
    subtotal > 0 ? Math.round(subtotal * (maxTipPct / 100)) : Infinity
  const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`
  const customAmountCents = Math.round((parseFloat(customAmount) || 0) * 100)
  const selectedTipAmount = showCustom
    ? customAmountCents
    : selectedPercentage != null
    ? Math.round(subtotal * (selectedPercentage / 100))
    : 0
  const hasSelection =
    hasMadeSelection && (!showCustom || customAmount.trim().length > 0)
  const isModalConfirmDisabled = !hasSelection

  const handlePresetSelect = (percentage: number) => {
    if (isConfirming) return
    const tipAmount = Math.round(subtotal * (percentage / 100))
    setSelectedPercentage(percentage)
    setShowCustom(false)
    setHasMadeSelection(true)
    setConfirmStatus('confirming')
    onTipSelected(tipAmount, percentage)
  }

  const handleNoTip = () => {
    if (isConfirming) return
    setSelectedPercentage(null)
    setCustomAmount('')
    setShowCustom(false)
    setHasMadeSelection(false)
    setConfirmStatus('confirming')
    onTipSelected(0, 0)
  }

  const handleConfirmTip = () => {
    if (isConfirming) return
    if (showCustom) {
      const capped = Math.min(selectedTipAmount, maxTipCents)
      setConfirmStatus('confirming')
      onTipSelected(capped, null)
      setShowModal(false)
      return
    }
    if (selectedPercentage !== null) {
      setConfirmStatus('confirming')
      onTipSelected(selectedTipAmount, selectedPercentage)
      return
    }
    setConfirmStatus('confirming')
    onTipSelected(0, 0)
  }

  const handleNumpadPress = (key: string) => {
    setShowCustom(true)
    setSelectedPercentage(null)
    setHasMadeSelection(true)
    setCustomAmount(prev => {
      if (key === '⌫') return prev.slice(0, -1)
      if (key === '.' && prev.includes('.')) return prev
      if (prev.includes('.') && prev.split('.')[1]?.length >= 2) return prev
      return prev + key
    })
  }

  const styles = useMemo(
    () =>
      StyleSheet.create({
        outer: {
          flex: 1,
          backgroundColor: colors.screen
        },
        body: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 24,
          paddingVertical: 24,
          gap: 20
        },
        titleSection: {
          alignItems: 'center',
          gap: 4
        },
        title: {
          fontSize: 24,
          fontWeight: '800',
          color: colors.heading
        },
        subtitle: {
          fontSize: 13,
          fontWeight: '400',
          color: colors.label
        },
        presetGrid: {
          flexDirection: 'row',
          gap: 12,
          width: '100%',
          maxWidth: 680
        },
        presetCardWrapper: {
          flex: 1
        },
        presetCard: {
          width: '100%',
          paddingVertical: 24,
          paddingHorizontal: 12,
          borderRadius: 14,
          backgroundColor: colors.card,
          borderWidth: 2,
          borderColor: colors.border,
          alignItems: 'center',
          gap: 6
        },
        presetCardSelected: {
          borderColor: colors.teal,
          backgroundColor: colors.tealMuted
        },
        presetPct: {
          fontSize: 26,
          fontWeight: '800',
          color: colors.heading
        },
        presetPctSelected: {
          color: colors.heading
        },
        presetAmt: {
          fontSize: 14,
          fontWeight: '600',
          color: colors.teal
        },
        presetAmtSelected: {
          color: colors.teal
        },
        // Actions row: Custom Amount + No Tip side by side
        actionsRow: {
          flexDirection: 'row',
          width: '100%',
          maxWidth: 680,
          gap: 12
        },
        actionBtn: {
          flex: 1,
          paddingVertical: 16,
          borderRadius: 12,
          borderWidth: 1.5,
          borderColor: colors.border,
          backgroundColor: colors.card,
          alignItems: 'center',
          justifyContent: 'center'
        },
        actionBtnActive: {
          borderColor: colors.teal,
          backgroundColor: `${colors.teal}1a`
        },
        actionBtnText: {
          fontSize: 14,
          fontWeight: '600',
          color: colors.heading
        },
        actionBtnTextActive: {
          color: colors.teal
        },
        // Modal
        modalOverlay: {
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.55)',
          alignItems: 'center',
          justifyContent: 'center'
        },
        modalCard: {
          width: 340,
          backgroundColor: colors.panel,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 20,
          gap: 12,
          alignItems: 'center'
        },
        modalTitle: {
          fontSize: 18,
          fontWeight: '700',
          color: colors.heading
        },
        modalAmountBox: {
          width: '100%',
          paddingVertical: 14,
          backgroundColor: colors.screen,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center'
        },
        modalAmountText: {
          fontSize: 28,
          fontWeight: '700',
          color: colors.teal
        },
        numpad: {
          width: '100%',
          gap: 10
        },
        numpadRow: {
          flexDirection: 'row',
          gap: 8
        },
        numKey: {
          flex: 1,
          height: 48,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center'
        },
        numKeyAction: {
          backgroundColor: colors.screen
        },
        numKeyText: {
          fontSize: 18,
          fontWeight: '700',
          color: colors.heading
        },
        confirmBtn: {
          width: '100%',
          paddingVertical: 15,
          borderRadius: 14,
          backgroundColor: colors.teal,
          borderWidth: 1,
          borderColor: colors.teal,
          alignItems: 'center'
        },
        confirmBtnDisabled: {
          backgroundColor: colors.screen,
          borderColor: colors.border,
          opacity: 0.6
        },
        confirmBtnText: {
          fontSize: 15,
          fontWeight: '700',
          color: colors.onSolid
        },
        confirmBtnTextDisabled: {
          color: colors.label
        },
        cancelBtn: {
          paddingVertical: 8
        },
        cancelBtnText: {
          fontSize: 14,
          color: colors.label,
          fontWeight: '500'
        },
        confirmingOverlay: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: 'rgba(0,0,0,0.45)',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 24
        },
        confirmingCard: {
          width: '100%',
          maxWidth: 360,
          backgroundColor: colors.panel,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: 16,
          paddingVertical: 28,
          paddingHorizontal: 24,
          alignItems: 'center',
          gap: 14,
          shadowColor: '#000',
          shadowOpacity: 0.25,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 6 },
          elevation: 6
        },
        confirmingText: {
          fontSize: 18,
          fontWeight: '700',
          color: colors.heading,
          letterSpacing: 0.2,
          textAlign: 'center'
        },
        confirmingSubtext: {
          fontSize: 13,
          fontWeight: '500',
          color: colors.label,
          textAlign: 'center'
        }
      }),
    [themeMode]
  )

  return (
    <View style={styles.outer}>
      <View style={styles.body}>
        <Animated.View
          entering={iosOnly(FadeIn.duration(250))}
          style={styles.titleSection}
        >
          <Text style={styles.title}>Add a tip</Text>
          <Text style={styles.subtitle}>
            Order total: {formatCurrency(subtotal)}
          </Text>
        </Animated.View>

        {/* Preset tip cards */}
        <View style={styles.presetGrid}>
          {presets.map((pct, index) => {
            const tipAmt = Math.round(subtotal * (pct / 100))
            const isSelected = selectedPercentage === pct && !showCustom
            return (
              <Animated.View
                key={pct}
                entering={iosOnly(
                  FadeInDown.duration(300).delay(80 + index * 60)
                )}
                style={styles.presetCardWrapper}
              >
                <Pressable
                  onPress={() => handlePresetSelect(pct)}
                  style={[
                    styles.presetCard,
                    isSelected && styles.presetCardSelected
                  ]}
                >
                  <Text
                    style={[
                      styles.presetPct,
                      isSelected && styles.presetPctSelected
                    ]}
                  >
                    {pct}%
                  </Text>
                  <Text
                    style={[
                      styles.presetAmt,
                      isSelected && styles.presetAmtSelected
                    ]}
                  >
                    {formatCurrency(tipAmt)}
                  </Text>
                </Pressable>
              </Animated.View>
            )
          })}
        </View>

        {/* Custom Amount + No Tip row */}
        <Animated.View
          entering={iosOnly(FadeInDown.duration(300).delay(300))}
          style={styles.actionsRow}
        >
          {tipConfig?.allowCustom !== false && (
            <Pressable
              onPress={() => {
                setShowCustom(true)
                setSelectedPercentage(null)
                setHasMadeSelection(true)
                setShowModal(true)
              }}
              style={[styles.actionBtn, styles.actionBtnActive]}
            >
              <Text
                style={[styles.actionBtnText, styles.actionBtnTextActive]}
              >
                {showCustom && customAmount
                  ? `Custom: $${customAmount}`
                  : 'Custom Amount'}
              </Text>
            </Pressable>
          )}

          <Pressable
            onPress={handleNoTip}
            style={styles.actionBtn}
          >
            <Text style={styles.actionBtnText}
            >
              No Tip
            </Text>
          </Pressable>
        </Animated.View>
      </View>

      {/* Optimistic-UI handoff overlay */}
      {isConfirming && (
        <View pointerEvents="auto" style={styles.confirmingOverlay}>
          <View style={styles.confirmingCard}>
            {confirmStatus === 'confirming' ? (
              <>
                <ActivityIndicator size="large" color={colors.teal} />
                <Text style={styles.confirmingText}>Confirming your tip…</Text>
                <Text style={styles.confirmingSubtext}>
                  Please don&apos;t tap your card.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.confirmingText}>Tip failed, skipping…</Text>
                <Text style={styles.confirmingSubtext}>
                  Continuing without a tip adjustment.
                </Text>
              </>
            )}
          </View>
        </View>
      )}

      {/* Custom Amount Modal */}
      <Modal visible={showModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Custom Tip</Text>

            <View style={styles.modalAmountBox}>
              <Text style={styles.modalAmountText}>
                {customAmount ? `$${customAmount}` : '$0'}
              </Text>
            </View>

            <View style={styles.numpad}>
              {[
                ['1', '2', '3'],
                ['4', '5', '6'],
                ['7', '8', '9'],
                ['.', '0', '⌫']
              ].map((row, i) => (
                <View key={i} style={styles.numpadRow}>
                  {row.map(key => (
                    <TouchableOpacity
                      key={key}
                      activeOpacity={0.7}
                      onPress={() => handleNumpadPress(key)}
                      style={[
                        styles.numKey,
                        key === '⌫' && styles.numKeyAction
                      ]}
                    >
                      {key === '⌫' ? (
                        <Delete size={18} color={colors.label} />
                      ) : (
                        <Text style={styles.numKeyText}>{key}</Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </View>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleConfirmTip}
              disabled={isModalConfirmDisabled}
              style={[
                styles.confirmBtn,
                isModalConfirmDisabled && styles.confirmBtnDisabled
              ]}
            >
              <Text
                style={[
                  styles.confirmBtnText,
                  isModalConfirmDisabled && styles.confirmBtnTextDisabled
                ]}
              >
                {customAmountCents > 0
                  ? `Confirm ${formatCurrency(customAmountCents)} Tip`
                  : 'Confirm Tip'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowModal(false)}
              style={styles.cancelBtn}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}
