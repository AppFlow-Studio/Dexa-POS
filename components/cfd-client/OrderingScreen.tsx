import { useCFDDisplayData } from "@/contexts/CFDDisplayDataContext";
import type { CFDCartItem } from "@/types/cfd.types";
import React, { useEffect, useRef } from "react";
import { FlatList, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  LinearTransition,
  SlideInLeft,
} from "react-native-reanimated";

export function OrderingScreen() {
  const {
    serverName,
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
    <View className="flex-1 bg-black">
      <View
        className={`flex-1 ${isWide ? "flex-row" : "flex-col"} bg-zinc-950`}
      >
        {/* LEFT PANEL (Items List) */}
        <View
          className={`${isWide ? "w-[65%] border-r border-white/10" : "flex-1"} flex-col`}
        >
          {!isWide && (
            <View className="p-4 border-b border-white/10 bg-zinc-900/50">
              <Text className="text-xl font-bold text-white text-center">
                {branding?.restaurantName ?? "Restaurant"}
              </Text>
              {serverName && (
                <Text className="text-zinc-400 text-center text-sm mt-1">
                  Server: {serverName}
                </Text>
              )}
              <View className="flex-row justify-center gap-4 mt-1">
                {orderNumber && (
                  <Text className="text-emerald-400 font-medium">
                    {orderNumber}
                  </Text>
                )}
                {guestCount && (
                  <Text className="text-zinc-500 font-medium">
                    {guestCount} Guests
                  </Text>
                )}
              </View>
            </View>
          )}

          {isWide && (
            <View className="flex-row px-8 py-4 border-b border-white/10 bg-zinc-900/40 items-center">
              <Text className="text-zinc-500 font-medium w-12 text-center">
                QTY
              </Text>
              <Text className="text-zinc-500 font-medium flex-1 pl-4">
                ITEM
              </Text>
              <View className="flex-row w-48 justify-end gap-6">
                <Text className="text-zinc-500 font-medium w-20 text-right">
                  CARD
                </Text>
                <Text className="text-emerald-600 font-medium w-20 text-right">
                  CASH
                </Text>
              </View>
            </View>
          )}

          <FlatList
            ref={listRef}
            data={items}
            keyExtractor={(_, index) => index.toString()}
            renderItem={({ item, index }) => (
              <CartItemRow item={item} index={index} isWide={isWide} />
            )}
            style={{ flex: 1 }}
            contentContainerStyle={{
              padding: isWide ? 32 : 16,
              paddingBottom: 100,
            }}
            showsVerticalScrollIndicator={false}
          />
        </View>

        {/* RIGHT PANEL (Summary Sidebar) */}
        <View
          className={`${
            isWide
              ? "w-[35%] h-full bg-zinc-900"
              : "border-t border-white/10 bg-zinc-900"
          } p-6 justify-between`}
        >
          {isWide && (
            <View className="mb-6 pb-6 border-b border-white/10">
              <Text className="text-3xl font-bold text-white">
                {branding?.restaurantName ?? "Restaurant"}
              </Text>
              {serverName && (
                <Text className="text-zinc-400 text-lg mt-1 font-medium">
                  Your server: <Text className="text-white">{serverName}</Text>
                </Text>
              )}
              <View className="flex-row items-center justify-between mt-4">
                <View className="bg-emerald-500/10 px-3 py-1 rounded-md border border-emerald-500/20">
                  <Text className="text-emerald-400 font-bold text-lg">
                    {orderNumber || "New Order"}
                  </Text>
                </View>
                {guestCount && (
                  <Text className="text-zinc-400 text-lg">
                    {guestCount} Guest{guestCount > 1 ? "s" : ""}
                  </Text>
                )}
              </View>
              {orderType && (
                <Text className="text-zinc-500 mt-2 font-medium uppercase tracking-wider text-xs">
                  {orderType}
                </Text>
              )}
            </View>
          )}

          {isWide && <View className="flex-1" />}

          <View className="space-y-3">
            <TotalRow
              label="Subtotal"
              value={subtotalCard || subtotal}
              secondaryValue={subtotalCash}
            />
            {discountAmount > 0 && (
              <TotalRow label="Discount" value={-discountAmount} isDiscount />
            )}
            <TotalRow
              label="Tax"
              value={taxCard || taxAmount}
              secondaryValue={taxCash}
            />
            {tipAmount > 0 && <TotalRow label="Tip" value={tipAmount} />}

            <View className="h-[1px] bg-white/10 my-4" />

            <TotalRow
              label="Total"
              value={totalCard || total}
              secondaryValue={totalCash}
              isTotal
            />

            {savingsAmount > 0 && (
              <Animated.View
                entering={FadeIn.delay(500)}
                className="mt-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 flex-row items-center justify-center gap-2"
              >
                <Text className="text-emerald-400 font-bold text-lg">
                  Save {formatCurrency(savingsAmount)} with Cash!
                </Text>
              </Animated.View>
            )}

            {amountPaid > 0 && (
              <View className="mt-4 pt-4 border-t border-dashed border-white/10 space-y-2">
                <TotalRow label="Paid" value={amountPaid} />
                <View className="flex-row justify-between items-center bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
                  <Text className="text-amber-500 font-bold text-lg">
                    Amount Due
                  </Text>
                  <Text className="text-amber-500 font-bold text-2xl">
                    {formatCurrency(outstandingTotal)}
                  </Text>
                </View>
              </View>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

function CartItemRow({
  item,
  index,
  isWide,
}: {
  item: CFDCartItem;
  index: number;
  isWide: boolean;
}) {
  const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <Animated.View
      entering={SlideInLeft.duration(500).easing(Easing.out(Easing.cubic))}
      layout={LinearTransition.duration(400)}
      className="mb-3 pb-3 border-b border-white/5 bg-white/5 px-2 py-3 rounded-lg"
    >
      <View className="flex-row items-center">
        <View className="bg-zinc-800 rounded-md h-8 w-10 items-center justify-center mr-4 shadow-sm">
          <Text className="text-zinc-300 font-bold text-lg">
            {item.quantity}
          </Text>
        </View>

        <View className="flex-1 justify-center">
          <Text
            className={`text-white font-semibold ${isWide ? "text-xl" : "text-lg"} leading-tight`}
            numberOfLines={2}
          >
            {item.name}
          </Text>

          {item.modifiers?.length > 0 && (
            <View className="mt-1 space-y-0.5">
              {item.modifiers.map((mod, idx) => (
                <Text key={idx} className="text-zinc-500 text-sm">
                  + {mod.name}
                </Text>
              ))}
            </View>
          )}

          {item.notes && (
            <Text className="text-amber-500/90 text-xs italic mt-1">
              {item.notes}
            </Text>
          )}

          {!isWide && (
            <View className="flex-row items-center mt-2 gap-3">
              <Text className="text-zinc-400 text-base">
                Card:{" "}
                {formatCurrency(item.lineTotalCard || item.lineTotal || 0)}
              </Text>
              <Text className="text-emerald-400 font-bold text-base">
                Cash:{" "}
                {formatCurrency(item.lineTotalCash || item.lineTotal || 0)}
              </Text>
            </View>
          )}
        </View>

        {isWide && (
          <View className="flex-row w-48 justify-end gap-6 h-full items-start pt-1">
            <Text className="text-zinc-400 font-medium text-lg w-20 text-right">
              {formatCurrency(item.lineTotalCard || item.lineTotal || 0)}
            </Text>
            <Text className="text-emerald-400 font-bold text-xl w-20 text-right">
              {formatCurrency(item.lineTotalCash || item.lineTotal || 0)}
            </Text>
          </View>
        )}
      </View>
    </Animated.View>
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

  const labelStyle = isTotal
    ? "text-white font-bold text-2xl"
    : "text-zinc-400 text-base";
  const cardStyle = isDiscount
    ? "text-emerald-400"
    : isTotal
      ? "text-zinc-300 font-semibold text-xl"
      : "text-zinc-400 text-base";
  const cashStyle = isTotal
    ? "text-emerald-400 font-bold text-3xl"
    : isDiscount
      ? "text-emerald-400"
      : "text-zinc-200 font-medium text-lg";

  return (
    <View
      className={`flex-row justify-between items-center ${isTotal ? "mt-2" : "py-1"}`}
    >
      <Text className={labelStyle}>{label}</Text>
      {secondaryValue !== undefined ? (
        <View className="flex-row gap-6 w-48 justify-end items-center">
          <Text className={`${cardStyle} w-20 text-right`}>
            {isDiscount ? "-" : ""}
            {formatCurrency(value)}
          </Text>
          <Text className={`${cashStyle} w-20 text-right`}>
            {isDiscount ? "-" : ""}
            {formatCurrency(secondaryValue)}
          </Text>
        </View>
      ) : (
        <Text className={cashStyle}>
          {isDiscount ? "-" : ""}
          {formatCurrency(value)}
        </Text>
      )}
    </View>
  );
}
