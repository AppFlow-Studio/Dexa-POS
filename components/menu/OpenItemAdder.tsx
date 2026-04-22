import { useToast } from '@/contexts/ToastContext'
import { colors } from '@/lib/theme'
import { useColorScheme } from '@/lib/useColorScheme'
import { useOrderStore } from '@/stores/useOrderStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { Delete } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native'

const createStyles = () =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.screen,
      padding: 12,
      paddingBottom: 64,
      gap: 8
    },
    topContent: {
      gap: 8
    },
    label: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.muted,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginBottom: 6
    },
    input: {
      backgroundColor: colors.panel,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 14,
      color: colors.heading,
      height: 40
    },
    priceDisplay: {
      backgroundColor: colors.panel,
      borderWidth: 1,
      borderColor: `${colors.teal}40`,
      borderRadius: 10,
      paddingVertical: 8,
      alignItems: 'center'
    },
    priceText: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.teal
    },
    numpadRow: {
      flexDirection: 'row',
      gap: 4
    },
    numpadBtn: {
      flex: 1,
      height: 40,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.panel,
      borderWidth: 1,
      borderColor: colors.border
    },
    numpadText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.heading
    },
    actionRow: {
      position: 'absolute',
      left: 12,
      right: 12,
      bottom: 12,
      flexDirection: 'row',
      gap: 8
    },
    clearBtn: {
      flex: 1,
      height: 44,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.panel,
      borderWidth: 1,
      borderColor: colors.border
    },
    addBtn: {
      flex: 1,
      height: 44,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.teal
    },
    addBtnText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.onSolid
    }
  })

interface OpenItemAdderProps {
  onCreated?: () => void
}

const OpenItemAdder = ({ onCreated }: OpenItemAdderProps) => {
  const { colorScheme } = useColorScheme()
  const styles = useMemo(() => createStyles(), [colorScheme])

  const activeOrderId = useOrderStore(s => s.activeOrderId)
  const addItemToActiveOrder = useOrderStore(s => s.addItemToActiveOrder)
  const { show } = useToast()

  const pricingStrategy = useStoreSettingsStore(
    s => s.selectedStore?.pricing_strategy
  )
  const dualPricingPct = useStoreSettingsStore(
    s => s.selectedStore?.dual_pricing_percentage
  )
  const isDualPricing =
    pricingStrategy === 'dual' &&
    typeof dualPricingPct === 'number' &&
    dualPricingPct > 0

  const [openItemName, setOpenItemName] = useState('')
  const [openItemPrice, setOpenItemPrice] = useState('')
  const [priceDisplay, setPriceDisplay] = useState('0.00')

  const handlePriceInput = (value: string) => {
    if (value === 'clear') {
      setPriceDisplay('0.00')
      setOpenItemPrice('0.00')
      return
    }
    if (value === 'backspace') {
      let current = priceDisplay
      if (current === '0.00') return
      if (current.length <= 1) {
        setPriceDisplay('0.00')
        setOpenItemPrice('0.00')
        return
      }
      const newDisplay = current.slice(0, -1)
      if (newDisplay === '' || newDisplay === '0' || newDisplay === '-') {
        setPriceDisplay('0.00')
        setOpenItemPrice('0.00')
      } else {
        setPriceDisplay(newDisplay)
        setOpenItemPrice(newDisplay)
      }
      return
    }
    if (value === '.') {
      if (!priceDisplay.includes('.')) {
        const base = priceDisplay === '0.00' ? '0' : priceDisplay
        const newDisplay = base + '.'
        setPriceDisplay(newDisplay)
        setOpenItemPrice(newDisplay)
      }
      return
    }
    const isDigit = /^[0-9]$/.test(value)
    if (!isDigit) return
    if (priceDisplay === '0.00' || priceDisplay === '0') {
      const newDisplay = value === '0' ? '0' : value
      setPriceDisplay(newDisplay)
      setOpenItemPrice(newDisplay)
      return
    }
    if (priceDisplay.includes('.')) {
      const [, decimals = ''] = priceDisplay.split('.')
      if (decimals.length >= 2) return
    }
    const newDisplay = priceDisplay + value
    setPriceDisplay(newDisplay)
    setOpenItemPrice(newDisplay)
  }

  const handleAddOpenItem = () => {
    const itemName = openItemName.trim() || 'Custom'
    const price = parseFloat(openItemPrice)

    if (isNaN(price) || price <= 0) {
      show({
        title: 'Invalid Price',
        message: 'Please enter a valid price greater than zero.',
        type: 'error'
      })
      return
    }

    const activeOrder = useOrderStore.getState().ordersById[activeOrderId ?? '']
    if (activeOrder?.order_status === 'completed') {
      show({
        title: 'Order Closed',
        message: 'This order is closed. Please reopen the check to add items.',
        type: 'error'
      })
      return
    }

    // User enters the cash/base price; card price is increased by the dual pricing percentage
    let cardPrice: number
    let cashPrice: number
    if (isDualPricing) {
      cardPrice = Math.round(price * (1 + dualPricingPct! / 100) * 100) / 100
      cashPrice = price
    } else {
      cardPrice = price
      cashPrice = price
    }

    addItemToActiveOrder({
      id: `open_item_${Date.now()}`,
      menuItemId: `open_item_${Date.now()}`,
      name: itemName,
      quantity: 1,
      originalPrice: cashPrice,
      baseCashPrice: cashPrice,
      price: cardPrice,
      unitPrice: cardPrice,
      baseCardPrice: cardPrice,
      cashPrice,
      customizations: { notes: 'Open Item' },
      availableDiscount: undefined,
      appliedDiscount: null,
      is_open_item: true,
      open_item_name: itemName,
      open_item_price: cardPrice,
      category_name: 'Open Items',
      is_tax_exempt: false,
      paidQuantity: 0,
      subtotal: cardPrice,
      cashSubtotal: cashPrice,
      taxRate: 0,
      taxAmount: 0,
      cashTaxAmount: 0,
      discount_amount: 0,
      discount_cash_amount: 0
    })

    setOpenItemName('')
    setOpenItemPrice('')
    setPriceDisplay('0.00')
    onCreated?.()
  }

  const numpadRows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['.', '0', 'backspace']
  ]

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.container}>
        <View style={styles.topContent}>
          {/* Header */}
          <View style={{ marginBottom: 4 }}>
            <Text
              style={{ fontSize: 16, fontWeight: '700', color: colors.heading }}
            >
              Custom Item
            </Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
              Enter a name and price to add a custom item to the order
            </Text>
          </View>

          {/* Name */}
          <View>
            <Text style={styles.label}>Item Name</Text>
            <TextInput
              style={styles.input}
              value={openItemName}
              onChangeText={setOpenItemName}
              placeholder='Custom item name...'
              placeholderTextColor={colors.muted}
            />
          </View>

          {/* Price display */}
          <View>
            <Text style={styles.label}>Price</Text>
            <View style={styles.priceDisplay}>
              <Text style={styles.priceText}>${priceDisplay}</Text>
            </View>
            {isDualPricing && (
              <Text
                style={{
                  fontSize: 11,
                  color: colors.muted,
                  textAlign: 'center',
                  marginTop: 4
                }}
              >
                Item Price Increase is enabled, the price will be adjusted by{' '}
                {dualPricingPct}%
              </Text>
            )}
          </View>

          {/* Numpad */}
          <View style={{ gap: 4 }}>
            {numpadRows.map((row, i) => (
              <View key={i} style={styles.numpadRow}>
                {row.map(btn => (
                  <TouchableOpacity
                    key={btn}
                    style={styles.numpadBtn}
                    onPress={() =>
                      handlePriceInput(btn === 'backspace' ? 'backspace' : btn)
                    }
                  >
                    {btn === 'backspace' ? (
                      <Delete size={18} color={colors.muted} />
                    ) : (
                      <Text style={styles.numpadText}>{btn}</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={() => handlePriceInput('clear')}
          >
            <Text
              style={{ fontSize: 13, fontWeight: '600', color: colors.muted }}
            >
              Clear
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.addBtn} onPress={handleAddOpenItem}>
            <Text style={styles.addBtnText}>Create Item</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

export default OpenItemAdder
