import { useCFDDisplayData } from '@/contexts/CFDDisplayDataContext'
import { colors } from '@/lib/theme'
import { Delete } from 'lucide-react-native'
import { useEffect, useState } from 'react'
import {
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

export function TipSelectionScreen ({ onTipSelected }: Props) {
  const {
    tipConfig,
    tipAmount: externalTipAmount,
    tipPercentage: externalTipPercentage
  } = useCFDDisplayData()

  const [selectedPercentage, setSelectedPercentage] = useState<number | null>(
    null
  )
  const [customAmount, setCustomAmount] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [hasMadeSelection, setHasMadeSelection] = useState(false)

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
    const tipAmount = Math.round(subtotal * (percentage / 100))
    setSelectedPercentage(percentage)
    setShowCustom(false)
    setHasMadeSelection(true)
    onTipSelected(tipAmount, percentage)
  }

  const handleNoTip = () => {
    setSelectedPercentage(null)
    setCustomAmount('')
    setShowCustom(false)
    setHasMadeSelection(false)
    onTipSelected(0, 0)
  }

  const handleConfirmTip = () => {
    if (showCustom) {
      onTipSelected(selectedTipAmount, null)
      setShowModal(false)
      return
    }
    if (selectedPercentage !== null) {
      onTipSelected(selectedTipAmount, selectedPercentage)
      return
    }
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

  return (
    <View style={styles.outer}>
      <View style={styles.body}>
        <Animated.View
          entering={FadeIn.duration(250)}
          style={styles.titleSection}
        >
          <Text style={styles.title}>Add a tip</Text>
          <Text style={styles.subtitle}>
            Order total: {formatCurrency(subtotal)}
          </Text>
        </Animated.View>

        <View style={styles.presetGrid}>
          {presets.map((pct, index) => {
            const tipAmt = Math.round(subtotal * (pct / 100))
            const isSelected = selectedPercentage === pct && !showCustom
            return (
              <Animated.View
                key={pct}
                entering={FadeInDown.duration(300).delay(80 + index * 60)}
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

        <Animated.View
          entering={FadeInDown.duration(300).delay(300)}
          style={styles.actionsSection}
        >
          {tipConfig?.allowCustom !== false && (
            <Pressable
              onPress={() => {
                setShowCustom(true)
                setSelectedPercentage(null)
                setHasMadeSelection(true)
                setShowModal(true)
              }}
              style={[styles.customBtn, showCustom && styles.customBtnActive]}
            >
              <Text style={styles.customBtnText}>
                {showCustom && customAmount
                  ? `Custom Tip: $${customAmount}`
                  : 'Custom Amount'}
              </Text>
            </Pressable>
          )}

          <Pressable onPress={handleNoTip} style={styles.noTipBtn}>
            <Text style={styles.noTipText}>No Tip</Text>
          </Pressable>
        </Animated.View>
      </View>

      {/* Custom Amount Modal */}
      <Modal visible={showModal} transparent animationType='fade'>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Custom Tip</Text>

            {/* Amount display */}
            <View style={styles.modalAmountBox}>
              <Text style={styles.modalAmountText}>
                {customAmount ? `$${customAmount}` : '$0'}
              </Text>
            </View>

            {/* Numpad */}
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

            {/* Confirm */}
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

            {/* Cancel */}
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

const styles = StyleSheet.create({
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
    backgroundColor: colors.panel,
    alignItems: 'center',
    gap: 6
  },
  presetCardSelected: {
    borderWidth: 2,
    borderColor: colors.teal,
    backgroundColor: `${colors.teal}15`
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
  actionsSection: {
    width: '100%',
    maxWidth: 680,
    gap: 14,
    alignItems: 'center'
  },
  customBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.teal,
    backgroundColor: `${colors.teal}08`,
    alignItems: 'center'
  },
  customBtnActive: {
    backgroundColor: `${colors.teal}18`
  },
  customBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.teal
  },
  noTipBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12
  },
  noTipText: {
    fontSize: 13,
    color: colors.label,
    fontWeight: '500'
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
    color: '#000'
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
  }
})
