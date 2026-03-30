import { useCFDDisplayData } from "@/contexts/CFDDisplayDataContext";
import { colors } from "@/lib/theme";
import type { CFDCartItem } from "@/types/cfd.types";
import { CreditCard, Banknote, UtensilsCrossed } from "lucide-react-native";
import React, { useEffect, useRef } from "react";
import { FlatList, ScrollView, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  LinearTransition,
  SlideInLeft,
} from "react-native-reanimated";

export function OrderingScreen() {
  const {
    serverName,
    customerName,
    orderNumber,
    orderType,
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
  } = useCFDDisplayData();

  const listRef = useRef<FlatList>(null);
  const prevCount = useRef(items.length);
  const { width } = useWindowDimensions();
  const isWide = width > 850;

  useEffect(() => {
    if (items.length > prevCount.current) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
    prevCount.current = items.length;
  }, [items.length]);

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
                  {orderType && serverName ? `${orderType?.toUpperCase()} · ${serverName}` : (orderType?.toUpperCase() || serverName || "Order")}
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

        {/* RIGHT PANEL (Empty for now) */}
        <View
          style={{
            width: isWide ? "33.34%" : undefined,
            flex: isWide ? undefined : 1,
            backgroundColor: colors.panel,
            borderLeftWidth: isWide ? 1 : 0,
            borderLeftColor: colors.border,
          }}
        />
      </View>
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
