import { useToast } from '@/contexts/ToastContext'
import { useDiscounts } from '@/hooks/useDiscounts'
import { bottomSheetTheme, colors } from '@/lib/theme'
import {
  EligibilityContext,
  getEligibleDiscounts
} from '@/services/discountEligibility'
import { getDailyUsageCounts } from '@/services/discountUsageTracker'
import { useActiveOrder } from '@/stores/selectors/orderSelectors'
import { useOrderStore } from '@/stores/useOrderStore'
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetTextInput
} from '@gorhom/bottom-sheet'
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types'
import { Check, Tag, X } from 'lucide-react-native'
import React, { forwardRef, useMemo, useState } from 'react'
import { Text, TouchableOpacity, View, useWindowDimensions } from 'react-native'

interface DiscountBottomSheetProps {
  onClose: () => void
}

const DiscountBottomSheetComponent: React.ForwardRefRenderFunction<
  BottomSheetMethods,
  DiscountBottomSheetProps
> = ({ onClose }, ref) => {
  const { width } = useWindowDimensions()
  const [activeTab, setActiveTab] = useState<'check' | 'items'>('check')
  const [customDiscountType, setCustomDiscountType] = useState<
    'percentage' | 'fixed'
  >('percentage')
  const [customDiscountValue, setCustomDiscountValue] = useState('')

  const snapPoints = useMemo(() => {
    if (width >= 1200) return ['68%', '94%']
    if (width >= 768) return ['72%', '96%']
    return ['82%', '98%']
  }, [width])

  const isNarrow = width < 480

  const activeOrderId = useOrderStore(s => s.activeOrderId)
  const applyDiscountToCheck = useOrderStore(s => s.applyDiscountToCheck)
  const applyDiscountToItem = useOrderStore(s => s.applyDiscountToItem)
  const removeDiscountFromItem = useOrderStore(s => s.removeDiscountFromItem)
  const removeCheckDiscount = useOrderStore(s => s.removeCheckDiscount)
  const activeOrder = useActiveOrder()
  const { data: discounts = [] } = useDiscounts()
  const { show } = useToast()

  const cartItems = activeOrder?.items || []
  const activeCheckDiscount = useMemo(() => {
    if (activeOrder?.checkDiscount) return activeOrder.checkDiscount

    const latestApplied = (activeOrder as any)?.applied_discounts?.[0]
    if (!latestApplied) return null

    const type =
      latestApplied.discount_type === 'percentage' ? 'percentage' : 'fixed'
    const rawValue = Number(latestApplied.discount_value ?? 0)

    return {
      id:
        latestApplied.discount_id ||
        latestApplied.order_discount_id ||
        latestApplied.local_id,
      label: latestApplied.discount_name || 'Active Discount',
      value:
        type === 'percentage'
          ? rawValue > 1
            ? rawValue / 100
            : rawValue
          : rawValue,
      type
    }
  }, [activeOrder?.checkDiscount, (activeOrder as any)?.applied_discounts])

  const itemsWithAvailableDiscounts = useMemo(
    () => cartItems.filter(item => !!item.availableDiscount),
    [cartItems]
  )

  const checkSubtotal = useMemo(() => {
    return cartItems.reduce((sum, item: any) => {
      if (item?.is_voided) return sum
      const lineSubtotal =
        typeof item?.subtotal === 'number'
          ? item.subtotal
          : (item?.price ?? 0) * (item?.quantity ?? 1)
      return sum + Math.max(0, lineSubtotal)
    }, 0)
  }, [cartItems])

  const eligibilityResults = useMemo(() => {
    if (!activeOrder) return []

    const items = cartItems.map(item => ({
      id: item.id,
      menu_item_id: item.menuItemId,
      category_id: item.category_name || undefined,
      is_alcohol: false,
      item_total: item.price * item.quantity
    }))

    const ctx: EligibilityContext = {
      orderType:
        activeOrder.order_type === 'dine_in'
          ? 'dine_in'
          : activeOrder.order_type === 'delivery'
          ? 'delivery'
          : 'takeout',
      currentDate: new Date(),
      dailyUsageCounts: getDailyUsageCounts(),
      subtotal: items.reduce((sum, i) => sum + i.item_total, 0),
      items
    }

    return getEligibleDiscounts(discounts as any, ctx)
  }, [activeOrder, cartItems, discounts])

  const calculateDiscountAmount = (discount: any): number => {
    if (!discount || checkSubtotal <= 0) return 0

    const discountType = discount.type ?? discount.discount_type
    const rawValue = discount.value ?? discount.discount_value ?? 0
    const numericValue = Number(rawValue)

    if (!Number.isFinite(numericValue) || numericValue <= 0) return 0

    if (discountType === 'percentage') {
      const normalizedPct = numericValue > 1 ? numericValue / 100 : numericValue
      return Math.max(0, checkSubtotal * normalizedPct)
    }

    return Math.max(0, numericValue)
  }

  const validateDiscountDoesNotGoNegative = (discount: any): string | null => {
    if (checkSubtotal <= 0)
      return 'Discount cannot be applied to an empty check.'

    const discountAmount = calculateDiscountAmount(discount)
    if (discountAmount <= 0) return 'Please enter a valid discount amount.'

    const discountType = discount?.type ?? discount?.discount_type

    if (
      discountType === 'percentage' &&
      discountAmount - checkSubtotal > 0.001
    ) {
      return 'Discount is too high. It cannot reduce the total below $0.00.'
    }

    return null
  }

  const handleApplyCheckDiscount = (discount: any) => {
    if (!activeOrderId) return

    const negativeTotalError = validateDiscountDoesNotGoNegative(discount)
    if (negativeTotalError) {
      show({
        title: 'Invalid discount',
        message: negativeTotalError,
        type: 'error'
      })
      return
    }

    applyDiscountToCheck(activeOrderId, discount as any)
  }

  const handleApplyCustomDiscount = () => {
    if (!activeOrderId || !customDiscountValue) return

    const numericValue = parseFloat(customDiscountValue)
    if (Number.isNaN(numericValue) || numericValue <= 0) {
      show({
        title: 'Invalid discount',
        message: 'Please enter a valid discount amount.',
        type: 'error'
      })
      return
    }

    if (customDiscountType === 'percentage' && numericValue > 100) {
      show({
        title: 'Invalid percentage',
        message: 'Percentage discount cannot exceed 100%.',
        type: 'error'
      })
      return
    }

    const customDiscount = {
      id: `custom_${Date.now()}`,
      label:
        customDiscountType === 'percentage'
          ? `Custom ${numericValue}% Off`
          : `Custom $${numericValue.toFixed(2)} Off`,
      value:
        customDiscountType === 'percentage' ? numericValue / 100 : numericValue,
      type: customDiscountType
    }

    const negativeTotalError = validateDiscountDoesNotGoNegative(customDiscount)
    if (negativeTotalError) {
      show({
        title: 'Invalid discount',
        message: negativeTotalError,
        type: 'error'
      })
      return
    }

    applyDiscountToCheck(activeOrderId, customDiscount as any)
    setCustomDiscountValue('')
  }

  const handleRemoveCheckDiscount = () => {
    if (!activeOrderId) return
    removeCheckDiscount(activeOrderId)
    onClose()
  }

  const handleToggleItemDiscount = (itemInCart: any) => {
    if (!activeOrderId) return
    if (itemInCart.appliedDiscount) {
      removeDiscountFromItem(activeOrderId, itemInCart.id)
    } else {
      applyDiscountToItem(activeOrderId, itemInCart.id)
    }
  }

  const renderBackdrop = useMemo(
    () => (props: any) =>
      (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.28}
          pressBehavior='close'
        />
      ),
    []
  )

  const isCustomValid =
    !!customDiscountValue &&
    parseFloat(customDiscountValue) > 0 &&
    !validateDiscountDoesNotGoNegative({
      type: customDiscountType,
      value:
        customDiscountType === 'percentage'
          ? parseFloat(customDiscountValue) / 100
          : parseFloat(customDiscountValue)
    })

  return (
    <BottomSheet
      ref={ref}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      onClose={onClose}
      {...bottomSheetTheme}
      style={{ zIndex: 10000, elevation: 10000 }}
      backgroundStyle={{
        backgroundColor: colors.panel,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        borderWidth: 1,
        borderColor: colors.border
      }}
      keyboardBehavior='interactive'
      keyboardBlurBehavior='restore'
      android_keyboardInputMode='adjustResize'
      enableContentPanningGesture={false}
      topInset={0}
    >
      <BottomSheetScrollView
        style={{ flex: 1, backgroundColor: colors.panel }}
        contentContainerStyle={{ paddingBottom: 20 }}
        keyboardShouldPersistTaps='always'
        keyboardDismissMode='none'
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingTop: 14,
            paddingBottom: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.border
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                backgroundColor: colors.teal + '18',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 8
              }}
            >
              <Tag size={14} color={colors.teal} />
            </View>
            <Text
              style={{ fontSize: 15, fontWeight: '700', color: colors.heading }}
            >
              Apply Discount
            </Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{
              padding: 6,
              borderRadius: 10,
              backgroundColor: colors.teal + '12',
              borderWidth: 1,
              borderColor: colors.teal + '30'
            }}
          >
            <X size={16} color={colors.teal} />
          </TouchableOpacity>
        </View>

        <View
          style={{
            width: '100%',
            alignSelf: 'center',
            paddingHorizontal: 14,
            paddingTop: 12
          }}
        >
          {activeCheckDiscount && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12,
                padding: 10,
                borderRadius: 10,
                backgroundColor: colors.teal + '10',
                borderWidth: 1,
                borderColor: colors.teal + '30'
              }}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '600',
                    color: colors.teal
                  }}
                >
                  {activeCheckDiscount.label || 'Active Discount'}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: colors.teal + 'AA',
                    marginTop: 1
                  }}
                >
                  {activeCheckDiscount.type === 'percentage'
                    ? `${Math.round(
                        (activeCheckDiscount.value || 0) * 100
                      )}% off`
                    : `$${activeCheckDiscount.value?.toFixed(2)} off`}
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleRemoveCheckDiscount}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 8,
                  backgroundColor: colors.danger + '15',
                  borderWidth: 1,
                  borderColor: colors.danger + '30'
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: colors.danger
                  }}
                >
                  Remove
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <View
            style={{
              flexDirection: 'row',
              backgroundColor: colors.screen,
              borderRadius: 10,
              padding: 3,
              borderWidth: 1,
              borderColor: colors.border,
              marginBottom: 14
            }}
          >
            {(['check', 'items'] as const).map(tab => {
              const selected = activeTab === tab
              return (
                <TouchableOpacity
                  key={tab}
                  activeOpacity={0.85}
                  onPress={() => setActiveTab(tab)}
                  style={{
                    flex: 1,
                    paddingVertical: 8,
                    borderRadius: 8,
                    alignItems: 'center',
                    backgroundColor: selected ? colors.card : 'transparent'
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '700',
                      color: selected ? colors.heading : colors.muted
                    }}
                  >
                    {tab === 'check' ? 'Whole Check' : 'Specific Items'}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

          {activeTab === 'check' && (
            <View>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '700',
                  color: colors.muted,
                  textTransform: 'uppercase',
                  letterSpacing: 0.6,
                  marginBottom: 8
                }}
              >
                Custom Discount
              </Text>

              <View
                style={{
                  backgroundColor: colors.card,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  padding: 12,
                  marginBottom: 16
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    backgroundColor: colors.screen,
                    borderRadius: 8,
                    padding: 3,
                    marginBottom: 12
                  }}
                >
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setCustomDiscountType('percentage')}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      borderRadius: 6,
                      alignItems: 'center',
                      backgroundColor:
                        customDiscountType === 'percentage'
                          ? colors.teal
                          : 'transparent'
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '700',
                        color:
                          customDiscountType === 'percentage'
                            ? colors.onSolid
                            : colors.muted
                      }}
                    >
                      % Percentage
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setCustomDiscountType('fixed')}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      borderRadius: 6,
                      alignItems: 'center',
                      backgroundColor:
                        customDiscountType === 'fixed'
                          ? colors.success
                          : 'transparent'
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '700',
                        color:
                          customDiscountType === 'fixed'
                            ? colors.onSolid
                            : colors.muted
                      }}
                    >
                      $ Fixed Amount
                    </Text>
                  </TouchableOpacity>
                </View>

                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    marginBottom: 12
                  }}
                >
                  {[5, 10, 15, 20, 25, 50].map(val => {
                    const isSelected = customDiscountValue === val.toString()
                    const accentColor =
                      customDiscountType === 'percentage'
                        ? colors.teal
                        : colors.success
                    return (
                      <TouchableOpacity
                        key={val}
                        activeOpacity={0.85}
                        onPress={() => setCustomDiscountValue(val.toString())}
                        style={{
                          paddingHorizontal: 14,
                          paddingVertical: 8,
                          borderRadius: 22,
                          marginRight: 6,
                          marginBottom: 6,
                          backgroundColor: isSelected
                            ? accentColor + '20'
                            : colors.screen,
                          borderWidth: 1,
                          borderColor: isSelected
                            ? accentColor + '60'
                            : colors.border
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: '700',
                            color: isSelected ? accentColor : colors.label
                          }}
                        >
                          {customDiscountType === 'percentage'
                            ? `${val}%`
                            : `$${val}`}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>

                <View
                  style={{
                    flexDirection: isNarrow ? 'column' : 'row',
                    alignItems: isNarrow ? 'stretch' : 'center'
                  }}
                >
                  <View
                    style={{
                      flex: isNarrow ? 0 : 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: colors.screen,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: colors.border,
                      paddingHorizontal: 10,
                      marginBottom: isNarrow ? 8 : 0,
                      marginRight: isNarrow ? 0 : 8
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        color: colors.muted,
                        marginRight: 4
                      }}
                    >
                      {customDiscountType === 'percentage' ? '%' : '$'}
                    </Text>
                    <BottomSheetTextInput
                      value={customDiscountValue}
                      onChangeText={setCustomDiscountValue}
                      placeholder={
                        customDiscountType === 'percentage' ? '0' : '0.00'
                      }
                      placeholderTextColor={colors.muted}
                      keyboardType='decimal-pad'
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        fontSize: 14,
                        color: colors.heading
                      }}
                    />
                  </View>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={handleApplyCustomDiscount}
                    disabled={!isCustomValid}
                    style={{
                      paddingHorizontal: 18,
                      paddingVertical: 10,
                      borderRadius: 8,
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: isNarrow ? undefined : 96,
                      backgroundColor: isCustomValid
                        ? customDiscountType === 'percentage'
                          ? colors.teal
                          : colors.success
                        : colors.border
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '700',
                        color: isCustomValid ? colors.onSolid : colors.muted
                      }}
                    >
                      Apply
                    </Text>
                  </TouchableOpacity>
                </View>

                {customDiscountValue.length > 0 && !isCustomValid && (
                  <Text
                    style={{ marginTop: 8, fontSize: 12, color: colors.danger }}
                  >
                    {validateDiscountDoesNotGoNegative({
                      type: customDiscountType,
                      value:
                        customDiscountType === 'percentage'
                          ? parseFloat(customDiscountValue) / 100
                          : parseFloat(customDiscountValue)
                    })}
                  </Text>
                )}
              </View>

              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '700',
                  color: colors.muted,
                  textTransform: 'uppercase',
                  letterSpacing: 0.6,
                  marginBottom: 8
                }}
              >
                Preset Discounts
              </Text>

              {eligibilityResults.length === 0 ? (
                <Text
                  style={{
                    fontSize: 13,
                    color: colors.muted,
                    paddingVertical: 8
                  }}
                >
                  No preset discounts available
                </Text>
              ) : (
                <View>
                  {eligibilityResults.map(d => (
                    <TouchableOpacity
                      key={d.discount.id}
                      activeOpacity={0.85}
                      disabled={!d.eligible}
                      onPress={() => handleApplyCheckDiscount(d.discount)}
                      style={{
                        padding: 10,
                        borderRadius: 10,
                        borderWidth: 1,
                        marginBottom: 6,
                        backgroundColor: d.eligible
                          ? colors.teal + '10'
                          : colors.screen,
                        borderColor: d.eligible
                          ? colors.teal + '40'
                          : colors.border,
                        opacity: d.eligible ? 1 : 0.6
                      }}
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}
                      >
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: '700',
                              color: colors.heading
                            }}
                          >
                            {d.discount.name}
                          </Text>
                          <Text
                            style={{
                              fontSize: 12,
                              color: colors.muted,
                              marginTop: 1
                            }}
                          >
                            {d.discount.discount_type === 'percentage'
                              ? `${d.discount.discount_value}% off`
                              : `$${d.discount.discount_value.toFixed(2)} off`}
                          </Text>
                        </View>
                        {d.eligible ? (
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: '700',
                              color: colors.success
                            }}
                          >
                            -${d.calculated_savings.toFixed(2)}
                          </Text>
                        ) : (
                          <Text
                            style={{
                              fontSize: 11,
                              color: colors.danger,
                              maxWidth: 110,
                              textAlign: 'right'
                            }}
                          >
                            {d.reason}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          {activeTab === 'items' && (
            <View>
              {itemsWithAvailableDiscounts.length > 0 ? (
                itemsWithAvailableDiscounts.map(item => {
                  const isApplied = !!item.appliedDiscount
                  return (
                    <TouchableOpacity
                      key={item.id}
                      activeOpacity={0.85}
                      onPress={() => handleToggleItemDiscount(item)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        padding: 10,
                        borderRadius: 10,
                        borderWidth: 1,
                        marginBottom: 6,
                        backgroundColor: isApplied
                          ? colors.teal + '10'
                          : colors.screen,
                        borderColor: isApplied
                          ? colors.teal + '40'
                          : colors.border
                      }}
                    >
                      <View style={{ flex: 1, marginRight: 10 }}>
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: '700',
                            color: colors.heading
                          }}
                        >
                          {item.name}
                        </Text>
                        <Text
                          style={{
                            fontSize: 11,
                            color: colors.muted,
                            marginTop: 1
                          }}
                        >
                          {item.availableDiscount?.label || 'Discountable'}
                        </Text>
                      </View>

                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: isApplied
                            ? colors.teal
                            : 'transparent',
                          borderWidth: 1,
                          borderColor: isApplied ? colors.teal : colors.border
                        }}
                      >
                        {isApplied && (
                          <Check size={12} color={colors.onSolid} />
                        )}
                      </View>
                    </TouchableOpacity>
                  )
                })
              ) : (
                <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                  <Text style={{ fontSize: 13, color: colors.muted }}>
                    No eligible items found
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      </BottomSheetScrollView>
    </BottomSheet>
  )
}

const DiscountBottomSheet = forwardRef(DiscountBottomSheetComponent)
DiscountBottomSheet.displayName = 'DiscountBottomSheet'

export default DiscountBottomSheet
