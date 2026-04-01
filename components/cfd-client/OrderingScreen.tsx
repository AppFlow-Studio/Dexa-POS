import { useCFDDisplayData } from "@/contexts/CFDDisplayDataContext";
import { colors } from "@/lib/theme";
import type { CFDCartItem } from "@/types/cfd.types";
import { CreditCard, Banknote, UtensilsCrossed } from "lucide-react-native";
import React, { useEffect, useRef } from "react";
import { FlatList, Image, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  runOnJS,
  Easing,
  FadeIn,
  FadeInDown,
  LinearTransition,
  SlideInLeft,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

export function OrderingScreen() {
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
  } = useCFDDisplayData();

  const listRef = useRef<FlatList>(null);
  const prevCount = useRef(items.length);
  const { width } = useWindowDimensions();
  const showRightPanel = layout?.showOrderingRightPanel ?? true;
  const rightPanelMode = layout?.orderingRightPanelMode ?? "single";
  const isWide = width > 850 && showRightPanel;

  useEffect(() => {
    if (items.length > prevCount.current) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
    prevCount.current = items.length;
  }, [items.length]);

  // Debug log
  React.useEffect(() => {
    console.log("[CFD OrderingScreen]", { orderType, tableName, serverName });
    if (items.length > 0) {
      console.log("[CFD Items]", items.map(i => ({ name: i.name, seatNumber: i.seatNumber, courseNumber: i.courseNumber })));
    }
  }, [orderType, tableName, serverName, items]);

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen }}>
      <View
        style={{
          flex: 1,
          flexDirection: isWide ? "row" : "column",
          backgroundColor: colors.screen,
        }}
      >
        {/* LEFT PANEL (Items + Bill Summary) */}
        <View
          style={{
            flex: isWide ? undefined : 1,
            width: isWide ? "66.66%" : undefined,
            borderRightWidth: isWide ? 1 : 0,
            borderRightColor: colors.border,
            flexDirection: "column",
          }}
        >
          {/* Header with Restaurant Name & Order Info */}
          <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.panel, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            {/* Left side: Icon + Restaurant Name & Subtitle */}
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}>
                <UtensilsCrossed size={20} color={colors.teal} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: colors.heading, marginBottom: 2 }}>
                  {branding?.restaurantName ?? "Restaurant"}
                </Text>
                <Text style={{ fontSize: 11, fontWeight: "500", color: colors.label }}>
                  {orderType?.toUpperCase()}
                  {tableName ? ` · Table ${tableName}` : serverName ? ` · ${serverName}` : ""}
                </Text>
              </View>
            </View>
            {/* Right side: Order Number & Item Count */}
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.teal, marginBottom: 2 }}>
                {orderNumber || "Your Order"}
              </Text>
              <Text style={{ fontSize: 12, fontWeight: "500", color: colors.label }}>
                {customerName ? `${customerName} · ` : ""}{items.length} item{items.length !== 1 ? "s" : ""}
              </Text>
            </View>
          </View>

          {/* Items List */}
          <FlatList
            ref={listRef}
            data={items}
            keyExtractor={(_, index) => index.toString()}
            renderItem={({ item, index }) => (
              <CartItemRow item={item} index={index} />
            )}
            style={{ flex: 1 }}
            contentContainerStyle={{
              padding: 16,
              paddingBottom: 24,
            }}
            showsVerticalScrollIndicator={false}
          />

          {/* Totals Section - Below Items */}
          <View style={{ backgroundColor: colors.panel, paddingHorizontal: 16, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
            {/* Subtotal & Tax rows */}
            <View style={{ gap: 2, marginBottom: 6 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: colors.label, fontSize: 11, fontWeight: "500" }}>Subtotal</Text>
                <Text style={{ color: colors.label, fontSize: 11, fontWeight: "500" }}>
                  {formatCurrency(subtotalCard || subtotal)}
                </Text>
              </View>

              {discountAmount > 0 && (
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: colors.teal, fontSize: 11, fontWeight: "500" }}>Discount</Text>
                  <Text style={{ color: colors.teal, fontSize: 11, fontWeight: "500" }}>
                    -{formatCurrency(discountAmount)}
                  </Text>
                </View>
              )}

              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: colors.label, fontSize: 11, fontWeight: "500" }}>Tax</Text>
                <Text style={{ color: colors.label, fontSize: 11, fontWeight: "500" }}>
                  {formatCurrency(taxCard || taxAmount)}
                </Text>
              </View>

              {tipAmount > 0 && (
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: colors.label, fontSize: 11, fontWeight: "500" }}>Tip</Text>
                  <Text style={{ color: colors.label, fontSize: 11, fontWeight: "500" }}>
                    {formatCurrency(tipAmount)}
                  </Text>
                </View>
              )}
            </View>

            {/* Divider */}
            <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 6 }} />

            {/* Total (card) */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
              <Text style={{ color: colors.label, fontSize: 11, fontWeight: "500" }}>Total (card)</Text>
              <Text style={{ color: colors.heading, fontSize: 20, fontWeight: "700" }}>
                {formatCurrency(totalCard || total)}
              </Text>
            </View>

            {/* Total (cash) */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <Text style={{ color: colors.teal, fontSize: 11, fontWeight: "500" }}>Total (cash)</Text>
              <Text style={{ color: colors.teal, fontSize: 22, fontWeight: "700" }}>
                {formatCurrency(totalCash)}
              </Text>
            </View>

            {/* Cash Savings */}
            {savingsAmount > 0 && (
              <Animated.View
                entering={FadeInDown.delay(300)}
                style={{ marginBottom: 4 }}
              >
                <Text style={{ color: colors.teal, fontWeight: "600", fontSize: 11, textAlign: "center" }}>
                  Save {formatCurrency(savingsAmount)} with cash
                </Text>
              </Animated.View>
            )}

            {/* Divider before Amount Due */}
            {amountPaid > 0 && (
              <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 6 }} />
            )}

            {/* Amount Paid & Due */}
            {amountPaid > 0 && (
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: colors.label, fontSize: 13, fontWeight: "500" }}>Paid</Text>
                  <Text style={{ color: colors.label, fontSize: 13, fontWeight: "500" }}>
                    {formatCurrency(amountPaid)}
                  </Text>
                </View>
                <View style={{ backgroundColor: colors.warning + "15", borderWidth: 1, borderColor: colors.warning + "30", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ fontSize: 12, fontWeight: "600", color: colors.warning }}>
                      Amount Due
                    </Text>
                    <Text style={{ fontSize: 16, fontWeight: "700", color: colors.warning }}>
                      {formatCurrency(outstandingTotal)}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Powered by DEXA footer */}
            <View style={{ marginTop: 6, paddingTop: 4, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Text style={{ color: colors.label, fontSize: 9, fontWeight: "500", textAlign: "center" }}>
                Powered by DEXA
              </Text>
            </View>
          </View>
        </View>

        {showRightPanel && (
          <View
            style={{
              width: isWide ? "33.34%" : undefined,
              flex: isWide ? undefined : 1,
              backgroundColor: colors.panel,
              borderLeftWidth: isWide ? 1 : 0,
              borderLeftColor: colors.border,
            }}
          >
            <OrderingPanelMedia
              mode={rightPanelMode}
              primaryImages={orderingPanelImages.primary}
              secondaryImages={orderingPanelImages.secondary}
            />
          </View>
        )}
      </View>
    </View>
  );
}

function OrderingPanelMedia({
  mode,
  primaryImages,
  secondaryImages,
}: {
  mode: "single" | "stacked";
  primaryImages: string[];
  secondaryImages: string[];
}) {
  if (mode === "stacked") {
    return (
      <View style={styles.rightPanelStack}>
        <RotatingImagePanel images={primaryImages} style={styles.rightPanelStackItem} />
        <RotatingImagePanel images={secondaryImages} style={styles.rightPanelStackItem} />
      </View>
    );
  }

  return <RotatingImagePanel images={primaryImages} style={styles.rightPanelSingle} />;
}

function RotatingImagePanel({
  images,
  style,
}: {
  images: string[];
  style?: any;
}) {
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [nextIndex, setNextIndex] = React.useState(0);
  const fadeOpacity = useSharedValue(0);

  useEffect(() => {
    setCurrentIndex(0);
    setNextIndex(0);
    fadeOpacity.value = 0;
  }, [images, fadeOpacity]);

  useEffect(() => {
    if (!images || images.length <= 1) return;

    const interval = setInterval(() => {
      const next = (currentIndex + 1) % images.length;
      setNextIndex(next);
      fadeOpacity.value = withTiming(1, { duration: 900 }, (finished) => {
        if (finished) {
          runOnJS(setCurrentIndex)(next);
          fadeOpacity.value = 0;
        }
      });
    }, 8000);

    return () => clearInterval(interval);
  }, [currentIndex, images, fadeOpacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: fadeOpacity.value,
  }));

  if (!images || images.length === 0) {
    return (
      <View style={[styles.mediaFallback, style]}>
        <Text style={styles.mediaFallbackText}>No image</Text>
      </View>
    );
  }

  const currentImage = images[currentIndex] ?? images[0];
  const nextImage = images[nextIndex] ?? images[0];

  return (
    <View style={[styles.mediaFrame, style]}>
      <Image source={{ uri: currentImage }} style={styles.mediaImage} resizeMode="cover" />
      {images.length > 1 && (
        <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
          <Image source={{ uri: nextImage }} style={styles.mediaImage} resizeMode="cover" />
        </Animated.View>
      )}
    </View>
  );
}

function CartItemRow({
  item,
  index,
}: {
  item: CFDCartItem;
  index: number;
}) {
  const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  // Check if there are any modifiers to display
  const hasModifiers = item.modifiers && item.modifiers.length > 0;

  return (
    <Animated.View
      entering={FadeInDown.duration(300).delay(index * 50)}
      layout={LinearTransition.duration(200)}
      style={{
        backgroundColor: colors.card,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginBottom: 8,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        {/* Quantity Badge */}
        <View style={{ backgroundColor: colors.panel, borderRadius: 8, height: 28, width: 32, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.label, fontWeight: "700", fontSize: 13 }}>
            {item.quantity}
          </Text>
        </View>

        {/* Item Details */}
        <View style={{ flex: 1 }}>
          {(item.seatNumber || item.courseNumber) && (
            <View style={{ flexDirection: "row", gap: 12, marginBottom: 2 }}>
              {item.seatNumber && (
                <Text style={{ color: colors.teal, fontSize: 10, fontWeight: "600" }}>
                  Seat {item.seatNumber}
                </Text>
              )}
              {item.courseNumber && (
                <Text style={{ color: colors.teal, fontSize: 10, fontWeight: "600" }}>
                  Course {item.courseNumber}
                </Text>
              )}
            </View>
          )}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
            <Text
              style={{
                color: colors.heading,
                fontWeight: "600",
                fontSize: 14,
                lineHeight: 18,
                flex: 1,
              }}
              numberOfLines={2}
            >
              {item.name}
            </Text>
            <Text style={{ color: colors.label, fontSize: 13, fontWeight: "600", marginLeft: 8 }}>
              {formatCurrency(item.lineTotalCard || item.lineTotal || 0)}
            </Text>
          </View>

          {/* Modifiers */}
          {hasModifiers && (
            <View style={{ marginTop: 4, gap: 2 }}>
              {item.modifiers.map((mod, idx) => {
                const isNegativeModifier = mod.isNo === true;

                return (
                  <Text key={idx} style={{ color: isNegativeModifier ? colors.danger : colors.heading, fontSize: 11, fontWeight: isNegativeModifier ? '600' : '400' }}>
                    {isNegativeModifier ? 'NO ' : ''}{mod.name}
                  </Text>
                );
              })}
            </View>
          )}

          {/* Notes */}
          {item.notes && (
            <Text style={{ color: colors.warning, fontSize: 10, fontStyle: "italic", marginTop: hasModifiers ? 3 : 4 }}>
              {item.notes}
            </Text>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  rightPanelSingle: {
    flex: 1,
    margin: 12,
    borderRadius: 14,
  },
  rightPanelStack: {
    flex: 1,
    padding: 12,
    gap: 12,
  },
  rightPanelStackItem: {
    flex: 1,
    borderRadius: 14,
  },
  mediaFrame: {
    overflow: "hidden",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mediaImage: {
    width: "100%",
    height: "100%",
  },
  mediaFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mediaFallbackText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
});
  
function TotalRowTwoColumn({
  label,
  cardValue,
  cashValue,
  isDiscount,
  isTotal,
}: {
  label: string;
  cardValue: number;
  cashValue: number;
  isDiscount?: boolean;
  isTotal?: boolean;
}) {
  const formatCurrency = (cents: number) =>
    `$${(Math.abs(cents) / 100).toFixed(2)}`;

  if (isTotal) {
    return (
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 2 }}>
        <Text style={{ color: colors.heading, fontSize: 12, fontWeight: "700" }}>{label}</Text>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          <Text style={{ color: colors.heading, fontSize: 12, fontWeight: "600", width: 50, textAlign: "right" }}>
            {isDiscount ? "-" : ""}
            {formatCurrency(cardValue)}
          </Text>
          <Text style={{ color: colors.teal, fontSize: 14, fontWeight: "700", width: 50, textAlign: "right" }}>
            {isDiscount ? "-" : ""}
            {formatCurrency(cashValue)}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 2 }}>
      <Text style={{ color: isDiscount ? colors.teal : colors.label, fontSize: 10, fontWeight: "500" }}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <Text style={{ color: colors.label, fontSize: 10, fontWeight: "500", width: 50, textAlign: "right" }}>
          {isDiscount ? "-" : ""}
          {formatCurrency(cardValue)}
        </Text>
        <Text style={{ color: colors.teal, fontSize: 10, fontWeight: "600", width: 50, textAlign: "right" }}>
          {isDiscount ? "-" : ""}
          {formatCurrency(cashValue)}
        </Text>
      </View>
    </View>
  );
}

function TotalRow({
  label,
  value,
  secondaryValue,
  isDiscount,
  isTotal,
}: {
  label: string;
  value: number;
  secondaryValue?: number;
  isDiscount?: boolean;
  isTotal?: boolean;
}) {
  const formatCurrency = (cents: number) =>
    `$${(Math.abs(cents) / 100).toFixed(2)}`;

  if (isTotal) {
    return (
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 }}>
        <Text style={{ color: colors.heading, fontSize: 14, fontWeight: "700" }}>{label}</Text>
        {secondaryValue !== undefined ? (
          <View style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <CreditCard size={12} color={colors.heading} />
              <Text style={{ color: colors.heading, fontSize: 13, fontWeight: "600" }}>
                {formatCurrency(value)}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Banknote size={12} color={colors.teal} />
              <Text style={{ color: colors.teal, fontSize: 16, fontWeight: "700" }}>
                {formatCurrency(secondaryValue)}
              </Text>
            </View>
          </View>
        ) : (
          <Text style={{ color: colors.heading, fontSize: 14, fontWeight: "700" }}>
            {formatCurrency(value)}
          </Text>
        )}
      </View>
    );
  }

  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 3 }}>
      <Text style={{ color: isDiscount ? colors.teal : colors.label, fontSize: 11, fontWeight: "500" }}>
        {label}
      </Text>
      {secondaryValue !== undefined ? (
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
            <CreditCard size={10} color={colors.label} />
            <Text style={{ color: colors.label, fontSize: 11, fontWeight: "500" }}>
              {isDiscount ? "-" : ""}
              {formatCurrency(value)}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
            <Banknote size={10} color={colors.teal} />
            <Text style={{ color: colors.teal, fontSize: 11, fontWeight: "600" }}>
              {isDiscount ? "-" : ""}
              {formatCurrency(secondaryValue)}
            </Text>
          </View>
        </View>
      ) : (
        <Text style={{ color: isDiscount ? colors.teal : colors.heading, fontSize: 11, fontWeight: isDiscount ? "600" : "500" }}>
          {isDiscount ? "-" : ""}
          {formatCurrency(value)}
        </Text>
      )}
    </View>
  );
}
