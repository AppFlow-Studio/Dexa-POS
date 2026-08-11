import { useCFDDisplayData } from '@/contexts/CFDDisplayDataContext.base'
import { iosOnly } from '@/lib/safeAnimations'
import { colors } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import type { CFDCartItem } from '@/types/cfd.types'
import { Banknote, CreditCard, UtensilsCrossed } from 'lucide-react-native'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from 'react-native'
import Animated, {
  cancelAnimation,
  LinearTransition,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated'

export function OrderingScreen () {
  const {
    serverName,
    customerName,
    orderNumber,
    orderType,
    tableName,
    guestCount,
    items,
    subtotal,
    subtotalCash,
    subtotalCard,
    discountAmount,
    serviceCharge,
    serviceChargeName,
    taxAmount,
    taxCash,
    taxCard,
    tipAmount,
    total,
    totalCash,
    totalCard,
    savingsAmount,
    outstandingTotal,
    amountPaid,
    branding,
    layout,
    orderingPanelImages,
    pricingDisplayMode
  } = useCFDDisplayData()
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)

  const showCard = pricingDisplayMode !== 'cash_only'
  const showCash = pricingDisplayMode !== 'card_only'
  const showDual = pricingDisplayMode === 'dual'

  const listRef = useRef<FlatList>(null)
  const prevCount = useRef(items.length)
  const { width } = useWindowDimensions()
  const showRightPanel = layout?.showOrderingRightPanel ?? true
  const rightPanelMode = layout?.orderingRightPanelMode ?? 'single'
  // Keep the panel on the right in landscape; the old fixed breakpoint was
  // too large for some CFD tablets and caused the panel to stack underneath.
  const isWide = showRightPanel && width >= 700

  // Keep displayed totals stable while the POS recalculates in-flight item updates.
  const [displaySubtotalCard, setDisplaySubtotalCard] = useState(
    Math.max(0, subtotalCard || subtotal)
  )
  const [displayTaxCard, setDisplayTaxCard] = useState(
    Math.max(0, taxCard || taxAmount)
  )
  const [displayTotalCash, setDisplayTotalCash] = useState(
    Math.max(0, totalCash)
  )
  const [displayTotalCard, setDisplayTotalCard] = useState(
    Math.max(0, totalCard || total)
  )
  const [displaySavingsAmount, setDisplaySavingsAmount] = useState(
    Math.max(0, savingsAmount)
  )

  useEffect(() => {
    if (items.length > prevCount.current) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100)
    }
    prevCount.current = items.length
  }, [items.length])

  // Ignore transient zero snapshots during add-item recomputation.
  useEffect(() => {
    const nextSubtotalCard = Math.max(0, subtotalCard || subtotal)
    const nextTaxCard = Math.max(0, taxCard || taxAmount)
    const nextTotalCash = Math.max(0, totalCash)
    const nextTotalCard = Math.max(0, totalCard || total)
    const nextSavings = Math.max(0, savingsAmount)

    if (items.length === 0) {
      setDisplaySubtotalCard(nextSubtotalCard)
      setDisplayTaxCard(nextTaxCard)
      setDisplayTotalCash(nextTotalCash)
      setDisplayTotalCard(nextTotalCard)
      setDisplaySavingsAmount(nextSavings)
      return
    }

    const totalsTemporarilyZero = nextTotalCash === 0 && nextTotalCard === 0
    if (totalsTemporarilyZero) {
      // Keep previous values visible until non-zero recompute lands.
      return
    }

    setDisplaySubtotalCard(nextSubtotalCard)
    setDisplayTaxCard(nextTaxCard)
    setDisplayTotalCash(nextTotalCash)
    setDisplayTotalCard(nextTotalCard)
    // Don't flash 0 savings during transient recompute — keep previous value
    // until a non-zero savings or a full-zero reset lands.
    setDisplaySavingsAmount(prev =>
      nextSavings === 0 && prev > 0 ? prev : nextSavings
    )
  }, [
    items.length,
    subtotal,
    subtotalCard,
    taxAmount,
    taxCard,
    total,
    totalCash,
    totalCard,
    savingsAmount
  ])

  // Debug log

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen }}>
      <View
        style={{
          flex: 1,
          flexDirection: isWide ? 'row' : 'column',
          backgroundColor: colors.screen
        }}
      >
        {/* LEFT PANEL (Items + Bill Summary) */}
        <View
          style={{
            flex: isWide ? undefined : 1,
            width: isWide ? '66.66%' : undefined,
            borderRightWidth: isWide ? 1 : 0,
            borderRightColor: colors.border,
            flexDirection: 'column'
          }}
        >
          {/* Header with Restaurant Name & Order Info */}
          <View
            style={{
              paddingHorizontal: s(16),
              paddingVertical: s(12),
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
              backgroundColor: colors.panel,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            {/* Left side: Icon + Restaurant Name & Subtitle */}
            <View
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: s(12)
              }}
            >
              <View
                style={{
                  width: s(40),
                  height: s(40),
                  borderRadius: s(10),
                  backgroundColor: colors.card,
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <UtensilsCrossed size={s(20)} color={colors.teal} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: s(16),
                    fontWeight: '700',
                    color: colors.heading,
                    marginBottom: s(2)
                  }}
                >
                  {branding?.restaurantName ?? 'Restaurant'}
                </Text>
                <Text
                  style={{
                    fontSize: s(11),
                    fontWeight: '500',
                    color: colors.label
                  }}
                >
                  {orderType}
                  {tableName
                    ? ` · Table ${tableName}`
                    : serverName
                    ? ` · ${serverName}`
                    : ''}
                </Text>
              </View>
            </View>
            {/* Right side: Order Number & Item Count */}
            <View style={{ alignItems: 'flex-end' }}>
              <Text
                style={{
                  fontSize: s(14),
                  fontWeight: '600',
                  color: colors.teal,
                  marginBottom: s(2)
                }}
              >
                {orderNumber || 'Your Order'}
              </Text>
              <Text
                style={{ fontSize: s(12), fontWeight: '500', color: colors.label }}
              >
                {customerName ? `${customerName} · ` : ''}
                {items.length} item{items.length !== 1 ? 's' : ''}
              </Text>
            </View>
          </View>

          {/* Items List */}
          <FlatList
            ref={listRef}
            data={items}
            keyExtractor={(_, index) => index.toString()}
            renderItem={({ item, index }) => (
              <CartItemRow
                item={item}
                index={index}
                isLast={index === items.length - 1}
              />
            )}
            style={{ flex: 1 }}
            contentContainerStyle={{
              padding: s(16),
              paddingBottom: s(24)
            }}
            showsVerticalScrollIndicator={false}
          />

          {/* Totals Section - Below Items */}
          <View
            style={{
              backgroundColor: colors.panel,
              paddingHorizontal: s(16),
              paddingVertical: s(6),
              borderTopWidth: 1,
              borderTopColor: colors.border
            }}
          >
            {/* Subtotal & Tax rows */}
            <View style={{ gap: s(2), marginBottom: s(6) }}>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <Text
                  style={{
                    color: colors.label,
                    fontSize: s(11),
                    fontWeight: '500'
                  }}
                >
                  Subtotal
                </Text>
                <Text
                  style={{
                    color: colors.label,
                    fontSize: s(11),
                    fontWeight: '500'
                  }}
                >
                  {formatCurrency(displaySubtotalCard)}
                </Text>
              </View>

              {serviceCharge > 0 && (
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <Text
                    style={{
                      color: colors.label,
                      fontSize: s(11),
                      fontWeight: '500'
                    }}
                  >
                    {serviceChargeName ?? 'Service Charge'}
                  </Text>
                  <Text
                    style={{
                      color: colors.label,
                      fontSize: s(11),
                      fontWeight: '500'
                    }}
                  >
                    {formatCurrency(serviceCharge)}
                  </Text>
                </View>
              )}

              {discountAmount > 0 && (
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <Text
                    style={{
                      color: colors.teal,
                      fontSize: s(11),
                      fontWeight: '500'
                    }}
                  >
                    Discount
                  </Text>
                  <Text
                    style={{
                      color: colors.teal,
                      fontSize: s(11),
                      fontWeight: '500'
                    }}
                  >
                    -{formatCurrency(discountAmount)}
                  </Text>
                </View>
              )}

              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <Text
                  style={{
                    color: colors.label,
                    fontSize: s(11),
                    fontWeight: '500'
                  }}
                >
                  Tax
                </Text>
                <Text
                  style={{
                    color: colors.label,
                    fontSize: s(11),
                    fontWeight: '500'
                  }}
                >
                  {formatCurrency(displayTaxCard)}
                </Text>
              </View>

              {tipAmount > 0 && (
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <Text
                    style={{
                      color: colors.label,
                      fontSize: s(11),
                      fontWeight: '500'
                    }}
                  >
                    Tip
                  </Text>
                  <Text
                    style={{
                      color: colors.label,
                      fontSize: s(11),
                      fontWeight: '500'
                    }}
                  >
                    {formatCurrency(tipAmount)}
                  </Text>
                </View>
              )}
            </View>

            {/* Divider */}
            <View
              style={{
                height: 1,
                backgroundColor: colors.border,
                marginBottom: s(6)
              }}
            />

            {/* Total (card) */}
            {showCard && (
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: s(2)
                }}
              >
                <Text
                  style={{ color: colors.teal, fontSize: s(14), fontWeight: '600' }}
                >
                  {showDual ? 'Total (card)' : 'Total'}
                </Text>
                <Text
                  style={{ color: colors.teal, fontSize: s(22), fontWeight: '700' }}
                >
                  {formatCurrency(displayTotalCard)}
                </Text>
              </View>
            )}

            {/* Total (cash) */}
            {showCash && (
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: s(4)
                }}
              >
                <Text
                  style={{ color: showDual ? colors.label : colors.teal, fontSize: s(14), fontWeight: '600' }}
                >
                  {showDual ? 'Total (cash)' : 'Total'}
                </Text>
                <Text
                  style={{
                    color: showDual ? colors.heading : colors.teal,
                    fontSize: showDual ? s(20) : s(22),
                    fontWeight: '700'
                  }}
                >
                  {formatCurrency(displayTotalCash)}
                </Text>
              </View>
            )}

            {/* Cash Savings - only shown in dual mode */}
            {showDual && (
              <View style={{ marginBottom: s(4) }}>
                <Text
                  style={{
                    color: displaySavingsAmount > 0 ? colors.teal : colors.label,
                    fontWeight: '600',
                    fontSize: s(11),
                    textAlign: 'center'
                  }}
                >
                  Save {formatCurrency(displaySavingsAmount)} with cash
                </Text>
              </View>
            )}

            {/* Divider before Amount Due */}
            {amountPaid > 0 && (
              <View
                style={{
                  height: 1,
                  backgroundColor: colors.border,
                  marginBottom: s(6)
                }}
              />
            )}

            {/* Amount Paid & Due */}
            {amountPaid > 0 && (
              <View style={{ gap: s(8) }}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <Text
                    style={{
                      color: colors.label,
                      fontSize: s(13),
                      fontWeight: '500'
                    }}
                  >
                    Paid
                  </Text>
                  <Text
                    style={{
                      color: colors.label,
                      fontSize: s(13),
                      fontWeight: '500'
                    }}
                  >
                    {formatCurrency(amountPaid)}
                  </Text>
                </View>
                <View
                  style={{
                    backgroundColor: colors.warning + '15',
                    borderWidth: 1,
                    borderColor: colors.warning + '30',
                    borderRadius: s(8),
                    paddingHorizontal: s(12),
                    paddingVertical: s(8)
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <Text
                      style={{
                        fontSize: s(12),
                        fontWeight: '600',
                        color: colors.warning
                      }}
                    >
                      Amount Due
                    </Text>
                    <Text
                      style={{
                        fontSize: s(16),
                        fontWeight: '700',
                        color: colors.warning
                      }}
                    >
                      {formatCurrency(outstandingTotal)}
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        </View>

        {showRightPanel && (
          <View
            style={{
              width: isWide ? '33.34%' : undefined,
              flex: isWide ? undefined : 1,
              backgroundColor: colors.panel,
              borderLeftWidth: isWide ? 1 : 0,
              borderLeftColor: colors.border
            }}
          >
            <OrderingPanelMedia
              mode={rightPanelMode}
              primaryImages={orderingPanelImages.primary}
              secondaryImages={orderingPanelImages.secondary}
              uiScale={uiScale}
            />
          </View>
        )}
      </View>
    </View>
  )
}

function OrderingPanelMedia ({
  mode,
  primaryImages,
  secondaryImages,
  uiScale
}: {
  mode: 'single' | 'stacked'
  primaryImages: string[]
  secondaryImages: string[]
  uiScale: number
}) {
  const styles = getStylesForScale(uiScale)

  if (mode === 'stacked') {
    return (
      <View style={styles.rightPanelStack}>
        <RotatingImagePanel
          images={primaryImages}
          style={styles.rightPanelStackItem}
          styles={styles}
        />
        <RotatingImagePanel
          images={secondaryImages}
          style={styles.rightPanelStackItem}
          styles={styles}
        />
      </View>
    )
  }

  return (
    <RotatingImagePanel
      images={primaryImages}
      style={styles.rightPanelSingle}
      styles={styles}
    />
  )
}

function RotatingImagePanel ({
  images,
  style,
  styles
}: {
  images: string[]
  style?: any
  styles: ReturnType<typeof createStyles>
}) {
  const currentIndexRef = React.useRef(0)
  const [displayUri, setDisplayUri] = React.useState<string | null>(null)
  const [overlayUri, setOverlayUri] = React.useState<string | null>(null)
  const [pendingIndex, setPendingIndex] = React.useState<number | null>(null)
  const isTransitioningRef = React.useRef(false)
  const fadeOpacity = useSharedValue(0)

  // Use content-based key so the reset only fires when the actual URLs change,
  // not when the parent re-renders with a new array reference (e.g. every WS
  // payload update on the external CFD path).
  const imagesKey = images.join('\0')
  useEffect(() => {
    if (!images || images.length === 0) {
      currentIndexRef.current = 0
      setDisplayUri(null)
      setOverlayUri(null)
      setPendingIndex(null)
      isTransitioningRef.current = false
      cancelAnimation(fadeOpacity)
      fadeOpacity.value = 0
      return
    }
    currentIndexRef.current = 0
    setDisplayUri(images[0] ?? null)
    setOverlayUri(null)
    setPendingIndex(null)
    isTransitioningRef.current = false
    cancelAnimation(fadeOpacity)
    fadeOpacity.value = 0
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imagesKey, fadeOpacity])

  // Promote overlay → base after fade completes
  const completeTransition = (nextIndex: number, nextUri: string) => {
    currentIndexRef.current = nextIndex
    setDisplayUri(nextUri)
    // Brief delay lets the base image commit before removing the overlay
    setTimeout(() => {
      setOverlayUri(null)
      setPendingIndex(null)
      fadeOpacity.value = 0
      isTransitioningRef.current = false
    }, 50)
  }

  // Only start fading once the overlay image has actually loaded
  const handleOverlayLoad = () => {
    if (overlayUri === null || pendingIndex === null) return
    fadeOpacity.value = withTiming(1, { duration: 700 }, finished => {
      if (finished) {
        runOnJS(completeTransition)(pendingIndex, overlayUri)
      }
    })
  }

  useEffect(() => {
    if (!images || images.length <= 1) return

    const interval = setInterval(() => {
      if (isTransitioningRef.current) return
      const next = (currentIndexRef.current + 1) % images.length
      const nextUri = images[next]
      if (!nextUri) return
      isTransitioningRef.current = true
      fadeOpacity.value = 0
      setPendingIndex(next)
      setOverlayUri(nextUri)
    }, 8000)

    return () => {
      clearInterval(interval)
      cancelAnimation(fadeOpacity)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imagesKey, fadeOpacity])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: fadeOpacity.value
  }))

  if (!images || images.length === 0) {
    return (
      <View style={[styles.mediaFallback, style]}>
        <Text style={styles.mediaFallbackText}>No image</Text>
      </View>
    )
  }

  return (
    <View style={[styles.mediaFrame, style]}>
      {displayUri ? (
        <Image
          source={{ uri: displayUri }}
          style={styles.mediaImage}
          resizeMode='cover'
          onError={() =>
            console.warn('[RotatingImagePanel] Image failed:', displayUri)
          }
        />
      ) : null}
      {overlayUri ? (
        <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
          <Image
            source={{ uri: overlayUri }}
            style={styles.mediaImage}
            resizeMode='cover'
            onLoad={handleOverlayLoad}
            onError={() => {
              console.warn(
                '[RotatingImagePanel] Next image failed:',
                overlayUri
              )
              setOverlayUri(null)
              setPendingIndex(null)
              isTransitioningRef.current = false
              fadeOpacity.value = 0
            }}
          />
        </Animated.View>
      ) : null}
    </View>
  )
}

const CartItemRow = React.memo(function CartItemRow ({
  item,
  index,
  isLast
}: {
  item: CFDCartItem
  index: number
  isLast: boolean
}) {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`

  // Check if there are any modifiers to display
  const hasModifiers = item.modifiers && item.modifiers.length > 0

  return (
    <Animated.View
      layout={iosOnly(LinearTransition.duration(200))}
      style={{
        backgroundColor: colors.screen,
        paddingHorizontal: s(8),
        paddingVertical: s(8),
        marginBottom: 0
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: s(10) }}>
        {/* Quantity badge (bill style) */}
        <View style={{ alignItems: 'center', width: s(40) }}>
          <View
            style={{
              minWidth: s(22),
              height: s(22),
              borderRadius: s(6),
              backgroundColor: colors.teal + '18',
              borderWidth: 1,
              borderColor: colors.teal + '40',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Text
              style={{
                color: colors.teal,
                fontWeight: '700',
                fontSize: s(11)
              }}
            >
              {item.quantity}
            </Text>
          </View>

          {(item.seatNumber || item.courseNumber) && (
            <View style={{ marginTop: s(3), alignItems: 'center', gap: s(1) }}>
              {item.seatNumber && (
                <Text
                  style={{
                    color: colors.teal,
                    fontSize: s(9),
                    fontWeight: '600'
                  }}
                  numberOfLines={1}
                >
                  S{item.seatNumber}
                </Text>
              )}
              {item.courseNumber && (
                <Text
                  style={{
                    color: colors.teal,
                    fontSize: s(9),
                    fontWeight: '600'
                  }}
                  numberOfLines={1}
                >
                  C{item.courseNumber}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Item Details */}
        <View style={{ flex: 1, paddingTop: s(1) }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginBottom: s(4)
            }}
          >
            <View style={{ flex: 1, minWidth: 0, paddingRight: s(8) }}>
              <Text
                style={{
                  color: colors.heading,
                  fontWeight: '600',
                  fontSize: s(14),
                  lineHeight: Math.round(s(14) * (16 / 14)),
                  includeFontPadding: false
                }}
                numberOfLines={1}
              >
                {item.name}
              </Text>
            </View>
            <Text
              numberOfLines={1}
              style={{
                color: colors.teal,
                fontSize: s(14),
                lineHeight: Math.round(s(14) * (16 / 14)),
                includeFontPadding: false,
                fontWeight: '600',
                marginLeft: s(8),
                flexShrink: 0,
                textAlign: 'right'
              }}
            >
              {formatCurrency(item.lineTotalCard || item.lineTotal || 0)}
            </Text>
          </View>

          {/* Modifiers */}
          {hasModifiers && (
            <View style={{ marginTop: s(4), gap: s(2), marginLeft: s(1) }}>
              {item.modifiers.map((mod, idx) => {
                const isNegativeModifier = mod.isNo === true
                const modifierPrice = mod.priceCard || mod.price || 0

                return (
                  <View
                    key={idx}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: s(4),
                      paddingLeft: s(4),
                      borderLeftColor: colors.border,
                      borderLeftWidth: 1,
                      paddingVertical: s(1)
                    }}
                  >
                    <Text
                      style={{
                        color: isNegativeModifier
                          ? colors.danger
                          : colors.label,
                        fontSize: s(10),
                        fontWeight: isNegativeModifier ? '600' : '400',
                        flexShrink: 1
                      }}
                    >
                      {isNegativeModifier ? 'NO ' : ''}
                      {mod.name}
                    </Text>
                    {!isNegativeModifier && modifierPrice > 0 && (
                      <Text
                        style={{
                          color: colors.teal,
                          fontSize: s(10),
                          fontWeight: '600'
                        }}
                      >
                        +{formatCurrency(modifierPrice)}
                      </Text>
                    )}
                  </View>
                )
              })}
            </View>
          )}

          {/* Notes */}
          {item.notes && (
            <Text
              style={{
                color: colors.warning,
                fontSize: s(10),
                fontStyle: 'italic',
                marginTop: hasModifiers ? s(3) : s(4),
                marginLeft: hasModifiers ? s(6) : 0
              }}
            >
              {item.notes}
            </Text>
          )}
        </View>
      </View>
      {!isLast && (
        <View
          style={{
            height: StyleSheet.hairlineWidth,
            backgroundColor: colors.border + '55',
            marginTop: s(8),
            marginLeft: s(40)
          }}
        />
      )}
    </Animated.View>
  )
})

const createStyles = (scale: number) => {
  const s = (n: number) => Math.round(n * scale)
  return StyleSheet.create({
    rightPanelSingle: {
      flex: 1,
      margin: s(12),
      borderRadius: s(14)
    },
    rightPanelStack: {
      flex: 1,
      padding: s(12),
      gap: s(12)
    },
    rightPanelStackItem: {
      flex: 1,
      borderRadius: s(14)
    },
    mediaFrame: {
      overflow: 'hidden',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border
    },
    mediaImage: {
      width: '100%',
      height: '100%'
    },
    mediaFallback: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border
    },
    mediaFallbackText: {
      color: colors.muted,
      fontSize: s(12),
      fontWeight: '600'
    }
  })
}

const stylesByScale = new Map<number, ReturnType<typeof createStyles>>()
const getStylesForScale = (scale: number) => {
  const cached = stylesByScale.get(scale)
  if (cached) return cached
  const next = createStyles(scale)
  stylesByScale.set(scale, next)
  return next
}

function TotalRowTwoColumn ({
  label,
  cardValue,
  cashValue,
  isDiscount,
  isTotal
}: {
  label: string
  cardValue: number
  cashValue: number
  isDiscount?: boolean
  isTotal?: boolean
}) {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const formatCurrency = (cents: number) =>
    `$${(Math.abs(cents) / 100).toFixed(2)}`

  if (isTotal) {
    return (
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingVertical: s(2)
        }}
      >
        <Text
          style={{ color: colors.heading, fontSize: s(12), fontWeight: '700' }}
        >
          {label}
        </Text>
        <View style={{ flexDirection: 'row', gap: s(12), alignItems: 'center' }}>
          <Text
            style={{
              color: colors.heading,
              fontSize: s(12),
              fontWeight: '600',
              width: s(50),
              textAlign: 'right'
            }}
          >
            {isDiscount ? '-' : ''}
            {formatCurrency(cardValue)}
          </Text>
          <Text
            style={{
              color: colors.teal,
              fontSize: s(14),
              fontWeight: '700',
              width: s(50),
              textAlign: 'right'
            }}
          >
            {isDiscount ? '-' : ''}
            {formatCurrency(cashValue)}
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: s(2)
      }}
    >
      <Text
        style={{
          color: isDiscount ? colors.teal : colors.label,
          fontSize: s(10),
          fontWeight: '500'
        }}
      >
        {label}
      </Text>
      <View style={{ flexDirection: 'row', gap: s(12), alignItems: 'center' }}>
        <Text
          style={{
            color: colors.label,
            fontSize: s(10),
            fontWeight: '500',
            width: s(50),
            textAlign: 'right'
          }}
        >
          {isDiscount ? '-' : ''}
          {formatCurrency(cardValue)}
        </Text>
        <Text
          style={{
            color: colors.teal,
            fontSize: s(10),
            fontWeight: '600',
            width: s(50),
            textAlign: 'right'
          }}
        >
          {isDiscount ? '-' : ''}
          {formatCurrency(cashValue)}
        </Text>
      </View>
    </View>
  )
}

function TotalRow ({
  label,
  value,
  secondaryValue,
  isDiscount,
  isTotal
}: {
  label: string
  value: number
  secondaryValue?: number
  isDiscount?: boolean
  isTotal?: boolean
}) {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const formatCurrency = (cents: number) =>
    `$${(Math.abs(cents) / 100).toFixed(2)}`

  if (isTotal) {
    return (
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingVertical: s(4)
        }}
      >
        <Text
          style={{ color: colors.heading, fontSize: s(14), fontWeight: '700' }}
        >
          {label}
        </Text>
        {secondaryValue !== undefined ? (
          <View style={{ flexDirection: 'row', gap: s(16), alignItems: 'center' }}>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: s(4) }}
            >
              <CreditCard size={s(12)} color={colors.heading} />
              <Text
                style={{
                  color: colors.heading,
                  fontSize: s(13),
                  fontWeight: '600'
                }}
              >
                {formatCurrency(value)}
              </Text>
            </View>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: s(4) }}
            >
              <Banknote size={s(12)} color={colors.teal} />
              <Text
                style={{ color: colors.teal, fontSize: s(16), fontWeight: '700' }}
              >
                {formatCurrency(secondaryValue)}
              </Text>
            </View>
          </View>
        ) : (
          <Text
            style={{ color: colors.heading, fontSize: s(14), fontWeight: '700' }}
          >
            {formatCurrency(value)}
          </Text>
        )}
      </View>
    )
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: s(3)
      }}
    >
      <Text
        style={{
          color: isDiscount ? colors.teal : colors.label,
          fontSize: s(11),
          fontWeight: '500'
        }}
      >
        {label}
      </Text>
      {secondaryValue !== undefined ? (
        <View style={{ flexDirection: 'row', gap: s(12), alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(3) }}>
            <CreditCard size={s(10)} color={colors.label} />
            <Text
              style={{ color: colors.label, fontSize: s(11), fontWeight: '500' }}
            >
              {isDiscount ? '-' : ''}
              {formatCurrency(value)}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(3) }}>
            <Banknote size={s(10)} color={colors.teal} />
            <Text
              style={{ color: colors.teal, fontSize: s(11), fontWeight: '600' }}
            >
              {isDiscount ? '-' : ''}
              {formatCurrency(secondaryValue)}
            </Text>
          </View>
        </View>
      ) : (
        <Text
          style={{
            color: isDiscount ? colors.teal : colors.heading,
            fontSize: s(11),
            fontWeight: isDiscount ? '600' : '500'
          }}
        >
          {isDiscount ? '-' : ''}
          {formatCurrency(value)}
        </Text>
      )}
    </View>
  )
}
