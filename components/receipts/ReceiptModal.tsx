import { calculateOrderTotals } from "@/lib/order-calculator";
import { CartItem, OrderProfile } from "@/lib/types";
import { PrinterService } from "@/services/printing/PrinterService";
import { SelectedLocation, useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useReceiptTemplateStore } from "@/stores/useReceiptTemplateStore";
import { colors } from "@/lib/theme";
import { Barcode, Printer, QrCode, X } from "lucide-react-native";
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

// Item row component
const ItemRow: React.FC<{
  item: CartItem;
  showModifiers?: boolean;
}> = ({ item, showModifiers = true }) => {
  const itemName = item.is_open_item
    ? item.open_item_name || item.name
    : item.name;
  const itemSubtotal = item.subtotal;
  const itemCashSubtotal = item.cashSubtotal;
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

      {showModifiers && (
        <>
          {/* Size modifier */}
          {item.customizations?.size && (
            <View className="pl-3">
              <Text className="text-[10px] text-zinc-500" style={{ fontFamily: "monospace" }}>
                Size: {item.customizations.size.name}
              </Text>
            </View>
          )}

          {/* Modifiers */}
          {item.customizations?.modifiers?.map((modGroup, idx) =>
            modGroup.options.map((opt, optIdx) => (
              <View key={`${idx}-${optIdx}`} className="flex-row justify-between pl-3">
                <Text className="text-[10px] text-zinc-500" style={{ fontFamily: "monospace" }}>+ {opt.name}</Text>
                {opt.price > 0 && (
                  <Text className="text-[10px] text-zinc-500" style={{ fontFamily: "monospace" }}>{formatCurrency(opt.price)}</Text>
                )}
              </View>
            ))
          )}

          {/* Add-ons */}
          {item.customizations?.addOns?.map((addon, idx) => (
            <View key={idx} className="flex-row justify-between pl-3">
              <Text className="text-[10px] text-zinc-500" style={{ fontFamily: "monospace" }}>+ {addon.name}</Text>
              {addon.price > 0 && (
                <Text className="text-[10px] text-zinc-500" style={{ fontFamily: "monospace" }}>{formatCurrency(addon.price)}</Text>
              )}
            </View>
          ))}

          {/* Special instructions / notes */}
          {item.customizations?.notes && (
            <View className="pl-3">
              <Text className="text-[10px] text-zinc-500 italic" style={{ fontFamily: "monospace" }}>
                Note: {item.customizations.notes}
              </Text>
            </View>
          )}
        </>
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

    // Use the single source of truth for order totals — same as the app's order summary.
    const taxRatesMap = useStoreSettingsStore.getState().taxRatesMap;
    const orderTotals = calculateOrderTotals({
      items: order.items,
      checkDiscount: order.checkDiscount ?? null,
      taxRatesMap,
      payments: order.payments ?? [],
    });

    const subtotal = orderTotals.subtotal;
    const cashSubtotal = orderTotals.cash_subtotal;
    const tax = orderTotals.tax_amount;
    const cashTax = orderTotals.cash_tax_amount;
    const discount = orderTotals.discount_amount;
    const tip =
      order.payments?.reduce((sum, p) => sum + (p.tip_amount || 0), 0) || 0;
    const total = order.total_amount || (orderTotals.total_amount + tip);
    const cashTotal = orderTotals.cash_total_amount + tip;

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

  // Receipt template
  const getReceiptTemplate = useReceiptTemplateStore(s => s.getReceiptTemplate);
  const template = location ? getReceiptTemplate(location.id) : null;

  // Handle print action
  const handlePrint = () => {
    if (onPrint) {
      onPrint();
    } else if (order && location) {
      PrinterService.printReceipt(order, location).then((success) => {
        if (!success) {
          console.warn("[ReceiptModal] No receipt printer configured");
        }
      });
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
          style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            backgroundColor: colors.card,
            borderTopLeftRadius: 16, borderTopRightRadius: 16,
            borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1,
            borderColor: colors.border,
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
            style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 2 }}
            {...panResponder.panHandlers}
          >
            <View style={{ width: 32, height: 3, backgroundColor: colors.border, borderRadius: 2 }} />
          </Animated.View>

          {/* Header */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: colors.teal + '18', alignItems: 'center', justifyContent: 'center' }}>
                <Printer size={14} color={colors.teal} />
              </View>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.heading }}>Receipt Preview</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={{ padding: 6, borderRadius: 8, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border }}
            >
              <X color={colors.label} size={14} />
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
                className="bg-[#FAF9F6] py-6 rounded-sm"
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

                {/* logo */}
                {template?.showLogo && (
                  <View style={{ alignItems: "center", marginBottom: 6, paddingHorizontal: 20 }}>
                    <View style={{ width: 36, height: 36, backgroundColor: "#e5e7eb", borderRadius: 6, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 8, color: "#9ca3af", fontWeight: "700", fontFamily: "monospace" }}>LOGO</Text>
                    </View>
                  </View>
                )}

                {/* storeInfo */}
                <View style={{ alignItems: "center", paddingHorizontal: 20, marginBottom: 4 }}>
                  {template?.headerText ? (
                    <Text style={{ fontSize: 9, color: "#374151", textAlign: "center", marginBottom: 2, fontFamily: "monospace" }}>
                      {template.headerText}
                    </Text>
                  ) : null}
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#111827", textAlign: "center", fontFamily: "monospace" }}>
                    {location?.name || "Restaurant Name"}
                  </Text>
                  {locationAddress ? (
                    <Text style={{ fontSize: 9, color: "#6b7280", textAlign: "center", marginTop: 1, fontFamily: "monospace" }}>
                      {locationAddress}
                    </Text>
                  ) : null}
                  {location?.phone ? (
                    <Text style={{ fontSize: 9, color: "#6b7280", fontFamily: "monospace" }}>
                      {location.phone}
                    </Text>
                  ) : null}
                  <DoubleLine />
                </View>

                {/* orderInfo */}
                <View style={{ paddingHorizontal: 20, marginBottom: 4 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ fontSize: 9, color: "#111827", fontFamily: "monospace" }}>
                      Order #{order.display_number || order.order_number || order.id.slice(-4)}
                    </Text>
                    <Text style={{ fontSize: 9, color: "#111827", fontFamily: "monospace" }}>{date}</Text>
                  </View>
                  <Text style={{ fontSize: 9, color: "#6b7280", marginTop: 1, fontFamily: "monospace" }}>{time}</Text>
                  {template?.showOrderType !== false && (
                    <Text style={{ fontSize: 9, color: "#6b7280", marginTop: 1, fontFamily: "monospace" }}>
                      {getOrderTypeDisplay(order.order_type)}{order.service_location_name ? ` - ${order.service_location_name}` : ""}
                    </Text>
                  )}
                  {template?.showServerName !== false && order.server_name ? (
                    <Text style={{ fontSize: 9, color: "#6b7280", fontFamily: "monospace" }}>Server: {order.server_name}</Text>
                  ) : null}
                  {order.customer_name ? (
                    <Text style={{ fontSize: 9, color: "#6b7280", fontFamily: "monospace" }}>Customer: {order.customer_name}</Text>
                  ) : null}
                  <DottedLine />
                </View>

                {/* items */}
                <View style={{ paddingHorizontal: 20, marginBottom: 4, gap: 3 }}>
                  {order.items.filter(i => !i.is_voided).map((item) => (
                    <ItemRow key={item.id} item={item} showModifiers={template?.showItemModifiers !== false} />
                  ))}
                  <DottedLine />
                </View>

                {/* totals */}
                <View style={{ paddingHorizontal: 20, marginBottom: 4 }}>
                  <TotalsRow label="Subtotal" value={formatCurrency(totals.subtotal)} />
                  {template?.showTaxBreakdown !== false && totals.tax > 0 && (
                    <TotalsRow label="Tax" value={formatCurrency(totals.tax)} />
                  )}
                  {totals.discount > 0 && (
                    <TotalsRow label="Discount" value={`-${formatCurrency(totals.discount)}`} isDiscount />
                  )}
                  <DoubleLine />
                  <TotalsRow label="TOTAL" value={formatCurrency(totals.total)} bold />
                  {totals.cashTotal !== totals.total && (
                    <TotalsRow label="TOTAL (Cash)" value={formatCurrency(totals.cashTotal)} bold />
                  )}
                </View>

                {/* tipLine */}
                {template?.showTipLine && (
                  <View style={{ paddingHorizontal: 20, marginBottom: 4 }}>
                    <DottedLine />
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ fontSize: 9, color: "#111827", fontFamily: "monospace" }}>Tip:</Text>
                      <Text style={{ fontSize: 9, color: "#111827", fontFamily: "monospace" }}>________</Text>
                    </View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 3 }}>
                      <Text style={{ fontSize: 9, fontWeight: "700", color: "#111827", fontFamily: "monospace" }}>Total w/ Tip:</Text>
                      <Text style={{ fontSize: 9, fontWeight: "700", color: "#111827", fontFamily: "monospace" }}>________</Text>
                    </View>
                  </View>
                )}

                {/* payment */}
                {completedPayments.length > 0 && (
                  <View style={{ paddingHorizontal: 20, marginBottom: 4 }}>
                    <DottedLine />
                    {completedPayments.map((payment, idx) => (
                      <View key={idx} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <Text style={{ fontSize: 9, color: "#374151", fontFamily: "monospace" }}>
                          {getPaymentMethodName(payment.method)}{payment.last4 ? ` ****${payment.last4}` : ""}
                        </Text>
                        <Text style={{ fontSize: 9, color: "#374151", fontFamily: "monospace" }}>
                          {formatCurrency(payment.amount)}
                        </Text>
                      </View>
                    ))}
                    {order.amount_due !== undefined && order.amount_due > 0 && (
                      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 2 }}>
                        <Text style={{ fontSize: 9, color: "#d97706", fontFamily: "monospace" }}>Amount Due</Text>
                        <Text style={{ fontSize: 9, color: "#d97706", fontFamily: "monospace" }}>{formatCurrency(order.amount_due)}</Text>
                      </View>
                    )}
                  </View>
                )}

                {/* footer */}
                <View style={{ alignItems: "center", paddingHorizontal: 20, marginBottom: 4 }}>
                  {template?.footerText ? (
                    <>
                      <DottedLine />
                      <Text style={{ fontSize: 9, color: "#374151", textAlign: "center", fontFamily: "monospace" }}>
                        {template.footerText}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={{ fontSize: 10, fontWeight: "600", color: "#111827", fontFamily: "monospace" }}>Thank You!</Text>
                      <Text style={{ fontSize: 9, color: "#6b7280", fontFamily: "monospace" }}>We appreciate your business</Text>
                    </>
                  )}
                </View>

                {/* barcode */}
                {(template?.showBarcode || template?.showQrCode) && (
                  <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 8, paddingHorizontal: 20 }}>
                    {template.showBarcode && <Barcode size={28} color="#9ca3af" strokeWidth={1.5} />}
                    {template.showQrCode && <QrCode size={28} color="#9ca3af" strokeWidth={1.5} />}
                  </View>
                )}
              </View>
            </View>
          </ScrollView>

          {/* Footer with Buttons */}
          <View style={{ flexDirection: 'row', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 16, gap: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
            <TouchableOpacity
              style={{ flex: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center', backgroundColor: colors.panel }}
              onPress={onClose}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.label }}>Close</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ flex: 2, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 9, backgroundColor: colors.teal, borderRadius: 8 }}
              onPress={handlePrint}
            >
              <Printer color={colors.onSolid} size={14} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.onSolid }}>Print Receipt</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

export default ReceiptModal;
