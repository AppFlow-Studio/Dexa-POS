import { CartItem, OrderProfile } from "@/lib/types";
import { SelectedLocation } from "@/stores/useStoreSettingsStore";
import { Printer, X } from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";

// ==========================================
// TYPES
// ==========================================
export interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: OrderProfile | null;
  location: SelectedLocation | null;
  onPrint?: () => void;
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================
function formatCurrency(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return "$0.00";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatReceiptDate(dateString: string | null | undefined): {
  date: string;
  time: string;
} {
  if (!dateString) {
    return { date: "--/--/----", time: "--:-- --" };
  }
  const date = new Date(dateString);
  return {
    date: date.toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    }),
    time: date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }),
  };
}

function getOrderTypeDisplay(orderType: string | undefined): string {
  if (!orderType) return "Dine In";
  const types: Record<string, string> = {
    "Dine In": "Dine In",
    dine_in: "Dine In",
    Takeaway: "Takeaway",
    takeout: "Takeaway",
    Delivery: "Delivery",
    delivery: "Delivery",
  };
  return types[orderType] || orderType.replace("_", " ");
}

function getPaymentMethodName(method: string | undefined): string {
  if (!method) return "Cash";
  const methods: Record<string, string> = {
    Cash: "Cash",
    card: "Card",
    "Credit Card": "Card",
    "Debit Card": "Card",
    gift_card: "Gift Card",
    GiftCard: "Gift Card",
    house_account: "House Account",
  };
  return methods[method] || method.replace("_", " ");
}

// ==========================================
// SUB-COMPONENTS
// ==========================================

// Torn edge SVG for top of receipt
const TornEdgeTop: React.FC = () => (
  <Svg
    width="100%"
    height={12}
    viewBox="0 0 400 12"
    preserveAspectRatio="none"
    style={{ position: "absolute", top: -10, left: 0, right: 0 }}
  >
    <Path
      d="M0,12 L0,6 Q10,8 20,6 T40,6 T60,6 T80,6 T100,6 T120,6 T140,6 T160,6 T180,6 T200,6 T220,6 T240,6 T260,6 T280,6 T300,6 T320,6 T340,6 T360,6 T380,6 T400,6 L400,12 Z"
      fill="#FAF9F6"
    />
  </Svg>
);

// Torn edge SVG for bottom of receipt
const TornEdgeBottom: React.FC = () => (
  <Svg
    width="100%"
    height={12}
    viewBox="0 0 400 12"
    preserveAspectRatio="none"
    style={{ position: "absolute", bottom: -10, left: 0, right: 0 }}
  >
    <Path
      d="M0,0 L0,6 Q10,4 20,6 T40,6 T60,6 T80,6 T100,6 T120,6 T140,6 T160,6 T180,6 T200,6 T220,6 T240,6 T260,6 T280,6 T300,6 T320,6 T340,6 T360,6 T380,6 T400,6 L400,0 Z"
      fill="#FAF9F6"
    />
  </Svg>
);

// Dotted separator line
const DottedLine: React.FC = () => (
  <View className="border-b border-dashed border-zinc-400 my-2" />
);

// Double line separator
const DoubleLine: React.FC = () => (
  <View className="my-2">
    <View className="border-b border-zinc-400" />
    <View className="border-b border-zinc-400 mt-0.5" />
  </View>
);

// Info row component
const InfoRow: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <View className="flex-row justify-between py-0.5">
    <Text
      className="text-xs text-zinc-700"
      style={{ fontFamily: "monospace" }}
    >
      {label}
    </Text>
    <Text
      className="text-xs text-zinc-800 font-medium"
      style={{ fontFamily: "monospace" }}
    >
      {value}
    </Text>
  </View>
);

// Item row component
const ItemRow: React.FC<{
  item: CartItem;
}> = ({ item }) => {
  const itemName = item.is_open_item
    ? item.open_item_name || item.name
    : item.name;
  const itemSubtotal = item.subtotal || item.price * item.quantity;
  const itemCashSubtotal = item.cashSubtotal || (item.cashPrice || item.price) * item.quantity;
  const hasDifferentCashPrice = itemCashSubtotal !== itemSubtotal;

  return (
    <View className="mb-2">
      {/* Main item line */}
      <View className="flex-row justify-between">
        <Text
          className="text-xs text-zinc-800 flex-1 pr-2"
          style={{ fontFamily: "monospace" }}
        >
          {item.quantity > 1 && `${item.quantity}x `}
          {itemName}
          {item.is_voided && (
            <Text className="text-red-500"> (VOID)</Text>
          )}
        </Text>
        <View className="items-end">
          <Text
            className="text-xs text-zinc-800"
            style={{ fontFamily: "monospace" }}
          >
            {formatCurrency(itemSubtotal)}
          </Text>
          {hasDifferentCashPrice && (
            <Text
              className="text-[10px] text-green-700"
              style={{ fontFamily: "monospace" }}
            >
              Cash: {formatCurrency(itemCashSubtotal)}
            </Text>
          )}
        </View>
      </View>

      {/* Size modifier */}
      {item.customizations?.size && (
        <View className="pl-3">
          <Text
            className="text-[10px] text-zinc-500"
            style={{ fontFamily: "monospace" }}
          >
            Size: {item.customizations.size.name}
          </Text>
        </View>
      )}

      {/* Modifiers */}
      {item.customizations?.modifiers?.map((modGroup, idx) =>
        modGroup.options.map((opt, optIdx) => (
          <View
            key={`${idx}-${optIdx}`}
            className="flex-row justify-between pl-3"
          >
            <Text
              className="text-[10px] text-zinc-500"
              style={{ fontFamily: "monospace" }}
            >
              + {opt.name}
            </Text>
            {opt.price > 0 && (
              <Text
                className="text-[10px] text-zinc-500"
                style={{ fontFamily: "monospace" }}
              >
                {formatCurrency(opt.price)}
              </Text>
            )}
          </View>
        ))
      )}

      {/* Add-ons */}
      {item.customizations?.addOns?.map((addon, idx) => (
        <View key={idx} className="flex-row justify-between pl-3">
          <Text
            className="text-[10px] text-zinc-500"
            style={{ fontFamily: "monospace" }}
          >
            + {addon.name}
          </Text>
          {addon.price > 0 && (
            <Text
              className="text-[10px] text-zinc-500"
              style={{ fontFamily: "monospace" }}
            >
              {formatCurrency(addon.price)}
            </Text>
          )}
        </View>
      ))}

      {/* Special instructions / notes */}
      {item.customizations?.notes && (
        <View className="pl-3">
          <Text
            className="text-[10px] text-zinc-500 italic"
            style={{ fontFamily: "monospace" }}
          >
            Note: {item.customizations.notes}
          </Text>
        </View>
      )}

      {/* Open item indicator */}
      {item.is_open_item && (
        <View className="pl-3">
          <Text
            className="text-[10px] text-zinc-500 italic"
            style={{ fontFamily: "monospace" }}
          >
            Note: Open Item
          </Text>
        </View>
      )}
    </View>
  );
};

// Totals row component
const TotalsRow: React.FC<{
  label: string;
  value: string;
  bold?: boolean;
  isDiscount?: boolean;
}> = ({ label, value, bold = false, isDiscount = false }) => (
  <View className="flex-row justify-between py-0.5">
    <Text
      className={`text-xs ${bold ? "font-bold text-sm" : ""} ${
        isDiscount ? "text-green-600" : "text-zinc-700"
      }`}
      style={{ fontFamily: "monospace" }}
    >
      {label}
    </Text>
    <Text
      className={`text-xs ${bold ? "font-bold text-sm" : ""} ${
        isDiscount ? "text-green-600" : "text-zinc-800"
      }`}
      style={{ fontFamily: "monospace" }}
    >
      {value}
    </Text>
  </View>
);

// ==========================================
// ANIMATION CONSTANTS
// ==========================================
const ANIMATION_DURATION = 280;
const SWIPE_THRESHOLD = 100;

// ==========================================
// MAIN COMPONENT
// ==========================================
const ReceiptModal: React.FC<ReceiptModalProps> = ({
  isOpen,
  onClose,
  order,
  location,
  onPrint,
}) => {
  const slideAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(0.98)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const [isVisible, setIsVisible] = useState(false);

  // Pan responder for drag gesture
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          dragY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > SWIPE_THRESHOLD) {
          onClose();
        } else {
          Animated.spring(dragY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 100,
            friction: 10,
          }).start();
        }
      },
    })
  ).current;

  // Animation effect
  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      dragY.setValue(0);
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: ANIMATION_DURATION,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: ANIMATION_DURATION,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: ANIMATION_DURATION,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 1,
          duration: ANIMATION_DURATION,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.98,
          duration: ANIMATION_DURATION,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: ANIMATION_DURATION,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setIsVisible(false);
      });
    }
  }, [isOpen, slideAnim, scaleAnim, fadeAnim, dragY]);

  // Calculate totals from order data
  const totals = useMemo(() => {
    if (!order) {
      return {
        subtotal: 0,
        cashSubtotal: 0,
        tax: 0,
        cashTax: 0,
        discount: 0,
        tip: 0,
        total: 0,
        cashTotal: 0,
      };
    }

    const items = order.items.filter((item) => !item.is_voided);

    // Card prices (default)
    const subtotal = items.reduce((sum, item) => {
      return sum + (item.subtotal || item.price * item.quantity);
    }, 0);

    const tax = items.reduce((sum, item) => {
      return sum + (item.taxAmount || 0);
    }, 0);

    // Cash prices
    const cashSubtotal = items.reduce((sum, item) => {
      return sum + (item.cashSubtotal || (item.cashPrice || item.price) * item.quantity);
    }, 0);

    const cashTax = items.reduce((sum, item) => {
      return sum + (item.cashTaxAmount || item.taxAmount || 0);
    }, 0);

    const discount = order.total_discount || 0;

    const tip =
      order.payments?.reduce((sum, p) => sum + (p.tip_amount || 0), 0) || 0;

    const total = order.total_amount || subtotal + tax - discount + tip;
    const cashTotal = cashSubtotal + cashTax - discount + tip;

    return { subtotal, cashSubtotal, tax, cashTax, discount, tip, total, cashTotal };
  }, [order]);

  // Build location address
  const locationAddress = useMemo(() => {
    if (!location) return "";
    return [
      location.address_line1,
      location.address_line2,
      `${location.city}, ${location.state} ${location.postal_code}`,
    ]
      .filter(Boolean)
      .join("\n");
  }, [location]);

  // Get completed payments
  const completedPayments = useMemo(() => {
    if (!order?.payments) return [];
    return order.payments.filter((p) => !p.isVoided);
  }, [order]);

  // Format date/time
  const { date, time } = formatReceiptDate(order?.opened_at);

  // Get table name from service_location_id
  const tableName = order?.service_location_id ? "Table" : null;

  // Handle print action
  const handlePrint = () => {
    if (onPrint) {
      onPrint();
    } else {
      // Default print behavior - could integrate with expo-print or a thermal printer SDK
      console.log("Print receipt for order:", order?.id);
    }
  };

  if (!isVisible || !order) return null;

  return (
    <Modal transparent visible={isVisible} animationType="none">
      <View className="flex-1">
        {/* Semi-transparent backdrop */}
        <Animated.View
          className="absolute inset-0 bg-black/50"
          style={{ opacity: fadeAnim }}
        >
          <Pressable className="flex-1" onPress={onClose} />
        </Animated.View>

        {/* Bottom sheet */}
        <Animated.View
          className="absolute bottom-0 left-0 right-0 bg-[#1a1a1a] rounded-t-3xl"
          style={{
            maxHeight: "90%",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.3,
            shadowRadius: 12,
            elevation: 20,
            transform: [
              {
                translateY: Animated.add(
                  slideAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 700],
                  }),
                  dragY
                ),
              },
              { scale: scaleAnim },
            ],
          }}
        >
          {/* Drag Handle */}
          <Animated.View
            className="items-center pt-3 pb-2"
            {...panResponder.panHandlers}
          >
            <View className="w-10 h-1 bg-gray-600 rounded-full" />
          </Animated.View>

          {/* Header */}
          <View className="flex-row justify-between items-center px-5 pb-4">
            <Text className="text-xl font-bold text-white">Receipt Preview</Text>
            <TouchableOpacity
              onPress={onClose}
              className="p-2 rounded-full bg-gray-800"
            >
              <X color="#9CA3AF" size={20} />
            </TouchableOpacity>
          </View>

          {/* Receipt Content */}
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Receipt Paper */}
            <View className="relative mt-3 mb-3 items-center">
              {/* Paper Container - Fixed width for receipt-like appearance */}
              <View
                className="bg-[#FAF9F6] px-5 py-6 rounded-sm"
                style={{
                  width: 320, // Receipt paper width (80mm thermal receipt)
                  maxWidth: '100%',
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.15,
                  shadowRadius: 8,
                  elevation: 5,
                }}
              >
                <TornEdgeTop />
                <TornEdgeBottom />

                {/* Business Header */}
                <View className="items-center mb-4">
                  <Text
                    className="text-base font-semibold text-zinc-900 tracking-tight"
                    style={{ fontFamily: "monospace" }}
                  >
                    {location?.name || "Restaurant Name"}
                  </Text>
                  {locationAddress ? (
                    <Text
                      className="text-[10px] text-zinc-500 text-center mt-1"
                      style={{ fontFamily: "monospace" }}
                    >
                      {locationAddress}
                    </Text>
                  ) : null}
                  {location?.phone && (
                    <Text
                      className="text-[10px] text-zinc-500"
                      style={{ fontFamily: "monospace" }}
                    >
                      {location.phone}
                    </Text>
                  )}
                </View>

                <DottedLine />

                {/* Order Info */}
                <View className="mb-1">
                  <InfoRow
                    label="Order #:"
                    value={order.display_number || order.order_number || `#${order.id.slice(-4)}`}
                  />
                  <InfoRow label="Date:" value={date} />
                  <InfoRow label="Time:" value={time} />
                  <InfoRow
                    label="Type:"
                    value={getOrderTypeDisplay(order.order_type)}
                  />
                  {tableName && order.service_location_id && (
                    <InfoRow label="Table:" value={tableName} />
                  )}
                  {order.customer_name && (
                    <InfoRow label="Customer:" value={order.customer_name} />
                  )}
                  {order.server_name && (
                    <InfoRow label="Server:" value={order.server_name} />
                  )}
                </View>

                <DoubleLine />

                {/* Items */}
                <View className="mb-1">
                  {order.items
                    .filter((item) => !item.is_voided)
                    .map((item) => (
                      <ItemRow key={item.id} item={item} />
                    ))}
                </View>

                <DottedLine />

                {/* Totals */}
                <View className="mb-1">
                  {/* Card Prices Section */}
                  <Text
                    className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1"
                    style={{ fontFamily: "monospace" }}
                  >
                    Card Price
                  </Text>
                  <TotalsRow
                    label="Subtotal"
                    value={formatCurrency(totals.subtotal)}
                  />
                  {totals.tax > 0 && (
                    <TotalsRow label="Tax" value={formatCurrency(totals.tax)} />
                  )}
                  {totals.discount > 0 && (
                    <TotalsRow
                      label="Discount"
                      value={`-${formatCurrency(totals.discount)}`}
                      isDiscount
                    />
                  )}
                  {totals.tip > 0 && (
                    <TotalsRow label="Tip" value={formatCurrency(totals.tip)} />
                  )}
                  <View className="border-t border-zinc-300 mt-2 pt-2">
                    <TotalsRow
                      label="TOTAL (Card)"
                      value={formatCurrency(totals.total)}
                      bold
                    />
                  </View>

                  {/* Cash Prices Section - Only show if different from card */}
                  {totals.cashTotal !== totals.total && (
                    <View className="mt-3 pt-2 border-t border-dashed border-zinc-300">
                      <Text
                        className="text-[10px] text-green-700 uppercase tracking-wider mb-1"
                        style={{ fontFamily: "monospace" }}
                      >
                        Cash Price
                      </Text>
                      <TotalsRow
                        label="Subtotal"
                        value={formatCurrency(totals.cashSubtotal)}
                      />
                      {totals.cashTax > 0 && (
                        <TotalsRow label="Tax" value={formatCurrency(totals.cashTax)} />
                      )}
                      {totals.discount > 0 && (
                        <TotalsRow
                          label="Discount"
                          value={`-${formatCurrency(totals.discount)}`}
                          isDiscount
                        />
                      )}
                      {totals.tip > 0 && (
                        <TotalsRow label="Tip" value={formatCurrency(totals.tip)} />
                      )}
                      <View className="border-t border-zinc-300 mt-2 pt-2">
                        <View className="flex-row justify-between py-0.5">
                          <Text
                            className="text-sm font-bold text-green-700"
                            style={{ fontFamily: "monospace" }}
                          >
                            TOTAL (Cash)
                          </Text>
                          <Text
                            className="text-sm font-bold text-green-700"
                            style={{ fontFamily: "monospace" }}
                          >
                            {formatCurrency(totals.cashTotal)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  )}
                </View>

                {/* Payments */}
                {completedPayments.length > 0 && (
                  <>
                    <DottedLine />
                    <View className="mb-1">
                      <Text
                        className="text-[10px] text-zinc-500 text-center uppercase tracking-wider mb-2"
                        style={{ fontFamily: "monospace" }}
                      >
                        Payment
                      </Text>
                      {completedPayments.map((payment, idx) => (
                        <View key={idx} className="flex-row justify-between">
                          <Text
                            className="text-xs text-zinc-700"
                            style={{ fontFamily: "monospace" }}
                          >
                            {getPaymentMethodName(payment.method)}
                            {payment.last4 && ` ****${payment.last4}`}
                          </Text>
                          <Text
                            className="text-xs text-zinc-800"
                            style={{ fontFamily: "monospace" }}
                          >
                            {formatCurrency(payment.amount)}
                          </Text>
                        </View>
                      ))}
                      {order.amount_paid !== undefined && order.amount_paid > 0 && (
                        <View className="flex-row justify-between mt-1 pt-1 border-t border-dashed border-zinc-300">
                          <Text
                            className="text-xs text-zinc-700"
                            style={{ fontFamily: "monospace" }}
                          >
                            Amount Paid
                          </Text>
                          <Text
                            className="text-xs text-zinc-800"
                            style={{ fontFamily: "monospace" }}
                          >
                            {formatCurrency(order.amount_paid)}
                          </Text>
                        </View>
                      )}
                      {order.amount_due !== undefined && order.amount_due > 0 && (
                        <View className="flex-row justify-between">
                          <Text
                            className="text-xs text-amber-600"
                            style={{ fontFamily: "monospace" }}
                          >
                            Amount Due
                          </Text>
                          <Text
                            className="text-xs text-amber-600"
                            style={{ fontFamily: "monospace" }}
                          >
                            {formatCurrency(order.amount_due)}
                          </Text>
                        </View>
                      )}
                    </View>
                  </>
                )}

                <DoubleLine />

                {/* Footer */}
                <View className="items-center">
                  <Text
                    className="text-xs font-medium text-zinc-800"
                    style={{ fontFamily: "monospace" }}
                  >
                    Thank You!
                  </Text>
                  <Text
                    className="text-[10px] text-zinc-500"
                    style={{ fontFamily: "monospace" }}
                  >
                    We appreciate your business
                  </Text>
                  <Text
                    className="text-[10px] text-zinc-500 mt-2"
                    style={{ fontFamily: "monospace" }}
                  >
                    {new Date().toLocaleDateString("en-US", {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>

          {/* Footer with Buttons */}
          <View className="flex-row px-5 py-4 pb-8 gap-3 border-t border-gray-800">
            <TouchableOpacity
              className="flex-1 py-3.5 border border-gray-600 rounded-xl items-center bg-gray-800"
              onPress={onClose}
            >
              <Text className="text-base font-semibold text-gray-300">Close</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 flex-row justify-center items-center gap-2 py-3.5 bg-blue-600 rounded-xl"
              onPress={handlePrint}
            >
              <Printer color="#FFFFFF" size={18} />
              <Text className="text-base font-bold text-white">Print</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

export default ReceiptModal;
