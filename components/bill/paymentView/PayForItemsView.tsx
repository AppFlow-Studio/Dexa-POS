import { useRefreshActiveOrder } from "@/hooks/pos/useRefreshActiveOrder";
import { CartItem } from "@/lib/types";
import { colors } from "@/lib/theme";
import {
    calculateItemEffectiveCashPrice,
    useOrderStore,
} from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import {
    ArrowLeft,
    Banknote,
    CheckCircle,
    CreditCard,
    FileText,
    Minus,
    Plus,
    RotateCcw,
    Trash2,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

// ============================================================================
// HELPER: Get discounted values using HYBRID approach
// - If quantityToPay equals item.quantity, use pre-calculated DB values
// - If quantityToPay differs (partial), calculate proportionally
// ============================================================================
function getSelectedItemDiscountedValues(
    item: CartItem,
    quantityToPay: number,
    isCash: boolean = false
): { subtotal: number; discountAmount: number } {
    // console.log("item", item);
    const originalQuantity = item.quantity;

    // Calculate unit price: for cash, use effective cash price (includes modifiers)
    const unitPrice = isCash ? calculateItemEffectiveCashPrice(item) : item.price;
    // console.log("unitPrice", unitPrice);

    // Get order-level discount (from backend sync) - NOT the card/cash price difference
    // Only use actual discount_amount/discount_cash_amount from order-level discounts
    const originalDiscount = isCash
        ? (item.discount_cash_amount ?? 0)
        : (item.discount_amount ?? 0);

    // If paying for full quantity and we have a pre-calculated DB subtotal with discount, use it
    // Only use cashSubtotal/subtotal if they are valid numbers (not undefined/NaN)
    if (quantityToPay === originalQuantity && originalDiscount > 0) {
        const preCalculatedSubtotal = isCash ? item.cashSubtotal : item.subtotal;
        if (preCalculatedSubtotal !== undefined && !isNaN(preCalculatedSubtotal)) {
            return {
                subtotal: preCalculatedSubtotal,
                discountAmount: originalDiscount,
            };
        }
    }

    // Calculate subtotal dynamically
    const grossSubtotal = unitPrice * quantityToPay;

    // Apply proportional discount if there's an order-level discount
    if (originalQuantity > 0 && originalDiscount > 0) {
        const perUnitDiscount = originalDiscount / originalQuantity;
        const itemDiscountAmount = Math.round(perUnitDiscount * quantityToPay * 100) / 100;
        return {
            subtotal: Math.round((grossSubtotal - itemDiscountAmount) * 100) / 100,
            discountAmount: itemDiscountAmount,
        };
    }

    // No order-level discount - just return gross subtotal
    return {
        subtotal: Math.round(grossSubtotal * 100) / 100,
        discountAmount: 0,
    };
}

// ============================================================================
// HELPER: Calculate tax for selected items using card pricing (HYBRID approach)
// ============================================================================
function calculateSelectedTax(
    items: { item: CartItem; quantityToPay: number }[],
    taxRatesMap: Record<string, number>
): { subtotal: number; tax: number; total: number } {
    let subtotal = 0;
    let tax = 0;

    for (const { item, quantityToPay } of items) {
        const { subtotal: itemSubtotal } = getSelectedItemDiscountedValues(item, quantityToPay, false);
        subtotal += itemSubtotal;

        // Skip tax-exempt items
        if (item.is_tax_exempt) continue;

        // Get the tax rate for this item's category
        const taxCategory = item.tax_category || "standard";
        const taxRatePercent = taxRatesMap[taxCategory] ?? 0;
        const taxRateDecimal = taxRatePercent / 100;

        // Calculate tax on discounted subtotal
        tax += itemSubtotal * taxRateDecimal;
    }

    subtotal = Math.round(subtotal * 100) / 100;
    tax = Math.round(tax * 100) / 100;
    const total = Math.round((subtotal + tax) * 100) / 100;

    return { subtotal, tax, total };
}

// ============================================================================
// HELPER: Calculate tax for selected items using cash pricing (HYBRID approach)
// ============================================================================
function calculateSelectedCashTax(
    items: { item: CartItem; quantityToPay: number }[],
    taxRatesMap: Record<string, number>
): { subtotal: number; tax: number; total: number } {
    let subtotal = 0;
    let tax = 0;

    for (const { item, quantityToPay } of items) {
        const { subtotal: itemSubtotal } = getSelectedItemDiscountedValues(item, quantityToPay, true);
        subtotal += itemSubtotal;

        // Skip tax-exempt items
        if (item.is_tax_exempt) continue;

        // Get the tax rate for this item's category
        const taxCategory = item.tax_category || "standard";
        const taxRatePercent = taxRatesMap[taxCategory] ?? 0;
        const taxRateDecimal = taxRatePercent / 100;

        // Calculate tax on discounted subtotal
        tax += itemSubtotal * taxRateDecimal;
    }

    subtotal = Math.round(subtotal * 100) / 100;
    tax = Math.round(tax * 100) / 100;
    const total = Math.round((subtotal + tax) * 100) / 100;

    return { subtotal, tax, total };
}

// ============================================================================
// PAYMENT ROW COMPONENT
// ============================================================================
interface PaymentRowProps {
    payment: {
        id?: string;
        amount: number;
        method: string;
        tip_amount?: number;
        cardBrand?: string;
        last4?: string;
        timestamp?: string;
        itemsCovered?: {
            itemId: string;
            quantity: number;
        }[];
    };
    index: number;
    onVoid: () => void;
    onPrint?: () => void;
    isVoiding?: boolean;
}

const PaymentRow: React.FC<PaymentRowProps> = React.memo(({
    payment,
    index,
    onVoid,
    onPrint,
    isVoiding,
}) => {
    const methodDisplay =
        payment.method === "Cash"
            ? "Cash"
            : payment.cardBrand && payment.last4
                ? `${payment.cardBrand} ****${payment.last4}`
                : payment.method;

    return (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, paddingHorizontal: 12, backgroundColor: colors.panel, borderRadius: 10, marginBottom: 8, borderWidth: 1, borderColor: colors.border }}>
            <View style={{ flexDirection: "row", alignItems: "center", flex: 1, gap: 8 }}>
                <View style={{ backgroundColor: colors.success + "20", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: colors.success + "40" }}>
                    <Text style={{ color: colors.success, fontSize: 10, fontWeight: "700" }}>Paid</Text>
                </View>
                <View>
                    <Text style={{ color: colors.heading, fontWeight: "700", fontSize: 12 }}>{methodDisplay}</Text>
                    {payment.timestamp && (
                        <Text style={{ color: colors.muted, fontSize: 10 }}>
                            {new Date(payment.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                        </Text>
                    )}
                </View>
            </View>

            <View style={{ alignItems: "flex-end", marginHorizontal: 8 }}>
                <Text style={{ color: colors.heading, fontWeight: "700", fontSize: 13 }}>${payment.amount.toFixed(2)}</Text>
                {payment.tip_amount && payment.tip_amount > 0 && (
                    <Text style={{ color: colors.success, fontSize: 10 }}>+${payment.tip_amount.toFixed(2)}</Text>
                )}
            </View>

            <View style={{ flexDirection: "row", gap: 6 }}>
                {onPrint && (
                    <TouchableOpacity onPress={onPrint} style={{ paddingHorizontal: 8, paddingVertical: 7, backgroundColor: colors.teal + "15", borderRadius: 7 }}>
                        <FileText size={13} color={colors.teal} />
                    </TouchableOpacity>
                )}
                <TouchableOpacity onPress={onVoid} disabled={isVoiding} style={{ paddingHorizontal: 8, paddingVertical: 7, backgroundColor: colors.danger + "15", borderRadius: 7 }}>
                    {isVoiding
                        ? <ActivityIndicator size="small" color={colors.danger} />
                        : <RotateCcw size={13} color={colors.danger} />
                    }
                </TouchableOpacity>
            </View>
        </View>
    );
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================
const PayForItemsView: React.FC = () => {
    // Refresh order data on mount and realtime reconnection
    useRefreshActiveOrder();

    // --- STORE STATE ---
    const activeOrderId = useOrderStore((state) => state.activeOrderId);
    const ordersById = useOrderStore((state) => state.ordersById);
    const activeOrderTotal = useOrderStore((state) => state.activeOrderTotal);
    const activeOrderOutstandingCash = useOrderStore((state) => state.activeOrderOutstandingCash);
    const voidPayment = useOrderStore((state) => state.voidPayment);
    const taxRatesMap = useStoreSettingsStore((state) => state.taxRatesMap);

    const setView = usePaymentStore((s) => s.setView);
    const close = usePaymentStore((s) => s.close);
    const addSplit = usePaymentStore((s) => s.addSplit);
    const resetSplits = usePaymentStore((s) => s.resetSplits);

    // --- LOCAL STATE ---
    const [selectedItems, setSelectedItems] = useState<
        Map<string, { item: CartItem; quantityToPay: number }>
    >(new Map());
    const [paymentMethod, setPaymentMethod] = useState<"card" | "cash">("card");
    const [isProcessing, setIsProcessing] = useState(false);
    const [voidingPaymentIndex, setVoidingPaymentIndex] = useState<number | null>(null);

    // --- DERIVED VALUES ---
    const activeOrder = useMemo(
        () => (activeOrderId ? ordersById[activeOrderId] : null),
        [activeOrderId, ordersById]
    );
    // console.log('[activeOrder | SplitByItemView] activeOrder', activeOrder?.items[0]);

    const payments = activeOrder?.payments || [];

    // Calculate collected amount and remaining
    // Priority: Use backend's amount_due (authoritative) > calculate from payments
    const collectedAmount = payments.reduce((sum, p) => sum + p.amount + (p.tip_amount || 0), 0);
    
    // Card remaining (default pricing)
    const remainingAmount = activeOrder?.amount_due !== undefined && activeOrder.amount_due >= 0
        ? activeOrder.amount_due  // Use backend's authoritative amount_due (card price)
        : Math.max(0, (activeOrder?.total_amount || activeOrderTotal) - collectedAmount);
    
    // Cash remaining (for showing cash discount option)
    // Priority: order.cash_amount_due (synced) > activeOrderOutstandingCash (local calc) > card remaining
    const remainingCashAmount = 
        activeOrder?.cash_amount_due !== undefined && activeOrder.cash_amount_due >= 0
            ? activeOrder.cash_amount_due                    // 1st: Backend authoritative value
            : activeOrderOutstandingCash > 0
                ? activeOrderOutstandingCash                 // 2nd: Local calculation from items
                : remainingAmount;                           // 3rd: Fall back to card remaining
    
    // Calculate cash savings for remaining
    const remainingCashSavings = Math.max(0, remainingAmount - remainingCashAmount);
    
    const collectedPercent = activeOrderTotal > 0
        ? Math.round(((activeOrderTotal - remainingAmount) / activeOrderTotal) * 100)
        : 0;

    // Get unpaid items (quantity > paidQuantity)
    const unpaidItems = useMemo(() => {
        if (!activeOrder) return [];
        return activeOrder.items.filter(
            (item) =>
                !item.is_voided &&
                item.quantity > (item.paidQuantity || 0)
        );
    }, [activeOrder]);

    // Calculate selected totals using HYBRID approach:
    // - Items have discount_amount synced from DB
    // - Uses per-item discount (full qty uses DB value, partial qty calculates proportionally)
    const selectedArray = useMemo(
        () => Array.from(selectedItems.values()),
        [selectedItems]
    );

    const selectedCardTotals = useMemo(
        () => calculateSelectedTax(selectedArray, taxRatesMap),
        [selectedArray, taxRatesMap]
    );

    const selectedCashTotals = useMemo(
        () => calculateSelectedCashTax(selectedArray, taxRatesMap),
        [selectedArray, taxRatesMap]
    );

    const cashSavings = Math.max(0, selectedCardTotals.total - selectedCashTotals.total);

    // --- HANDLERS ---
    const handleAddItem = useCallback(
        (item: CartItem) => {
            const unpaidQty = item.quantity - (item.paidQuantity || 0);
            const current = selectedItems.get(item.id);
            const currentQty = current?.quantityToPay || 0;

            if (currentQty < unpaidQty) {
                setSelectedItems((prev) => {
                    const newMap = new Map(prev);
                    newMap.set(item.id, { item, quantityToPay: currentQty + 1 });
                    return newMap;
                });
            }
        },
        [selectedItems]
    );

    const handleRemoveItem = useCallback(
        (itemId: string) => {
            const current = selectedItems.get(itemId);
            if (!current) return;

            if (current.quantityToPay > 1) {
                setSelectedItems((prev) => {
                    const newMap = new Map(prev);
                    newMap.set(itemId, { ...current, quantityToPay: current.quantityToPay - 1 });
                    return newMap;
                });
            } else {
                setSelectedItems((prev) => {
                    const newMap = new Map(prev);
                    newMap.delete(itemId);
                    return newMap;
                });
            }
        },
        [selectedItems]
    );

    const handleSelectAll = useCallback(() => {
        const newMap = new Map<string, { item: CartItem; quantityToPay: number }>();
        for (const item of unpaidItems) {
            const unpaidQty = item.quantity - (item.paidQuantity || 0);
            newMap.set(item.id, { item, quantityToPay: unpaidQty });
        }
        setSelectedItems(newMap);
    }, [unpaidItems]);

    const handleClearSelection = useCallback(() => {
        setSelectedItems(new Map());
    }, []);

    const handleVoidPayment = useCallback(
        async (paymentIndex: number) => {
            if (!activeOrderId) return;

            setVoidingPaymentIndex(paymentIndex);
            try {
                const success = await voidPayment(activeOrderId, paymentIndex);
                if (!success) {
                    Alert.alert("Void Failed", "Could not void this payment. Please try again.");
                }
            } finally {
                setVoidingPaymentIndex(null);
            }
        },
        [activeOrderId, voidPayment]
    );

    const handleVoidAllPayments = useCallback(async () => {
        if (!activeOrderId || !payments.length) return;

        Alert.alert(
            "Void All Payments",
            "Are you sure you want to void all payments? Items will be returned to unpaid status.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Void All",
                    style: "destructive",
                    onPress: async () => {
                        // Void payments in reverse order to avoid index shifting
                        for (let i = payments.length - 1; i >= 0; i--) {
                            setVoidingPaymentIndex(i);
                            await voidPayment(activeOrderId, i);
                        }
                        setVoidingPaymentIndex(null);
                    },
                },
            ]
        );
    }, [activeOrderId, payments, voidPayment]);

    const handleContinueCharging = useCallback(() => {
        if (selectedItems.size === 0) return;

        // Navigate to payment method selection
        // First, set up a single split with the selected items
        resetSplits();

        // Create a "split" with the selected items for the payment flow
        // IMPORTANT: Preserve db_order_item_id for backend tracking
        const selectedItemsArray = Array.from(selectedItems.values()).map(({ item, quantityToPay }) => ({
            ...item, // Spreads all item properties including db_order_item_id
            quantity: quantityToPay, // Override quantity with amount being paid
        }));

        // Store selected items in the first split
        addSplit("Selected Items");

        // Now use the payment store's mechanism for single split
        // Set both card (amount) and cash (cashAmount) pricing for dual-price support
        // The actual payment method determines which price is used at checkout time
        usePaymentStore.setState((state) => ({
            splits: [
                {
                    ...state.splits[0],
                    items: selectedItemsArray,
                    amount: selectedCardTotals.total, // Card/default pricing
                    cashAmount: selectedCashTotals.total, // Cash pricing
                },
            ],
            activeSplitId: state.splits[0]?.id,
            splitSourceView: "pay-for-items", // This prevents splitCount/splitPortionIndex from being passed
        }));

        setView("payment-method-selection");
    }, [
        selectedItems,
        selectedCardTotals,
        selectedCashTotals,
        resetSplits,
        addSplit,
        setView,
    ]);

    const handleGoBack = useCallback(() => {
        resetSplits();
        setView("payment-method-selection");
    }, [resetSplits, setView]);

    const handleBackToOrder = useCallback(() => {
        close();
    }, [close]);

    // --- RENDER ---
    if (!activeOrder) {
        return (
            <View style={{ flex: 1, backgroundColor: colors.screen, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: colors.muted }}>No active order</Text>
            </View>
        );
    }

    console.log("selectedItems", selectedCashTotals);
    return (
        <View style={{ flex: 1, backgroundColor: colors.screen }}>
            {/* Header */}
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <TouchableOpacity
                    onPress={handleGoBack}
                    style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", marginRight: 10 }}
                >
                    <ArrowLeft size={16} color={colors.label} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: colors.heading }}>Pay for Items</Text>
                    <Text style={{ fontSize: 11, color: colors.muted }}>Select items to pay or manage payments</Text>
                </View>
                {payments.length > 0 && (
                    <TouchableOpacity
                        onPress={handleVoidAllPayments}
                        style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: `${colors.danger}15`, borderRadius: 7, flexDirection: "row", alignItems: "center", gap: 5 }}
                    >
                        <Trash2 size={13} color={colors.danger} />
                        <Text style={{ color: colors.danger, fontWeight: "700", fontSize: 11 }}>VOID ALL</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* Two-Panel Layout */}
            <View style={{ flex: 1, flexDirection: "row" }}>
                {/* LEFT PANEL */}
                <View style={{ width: "45%", borderRightWidth: 1, borderRightColor: colors.border, backgroundColor: colors.screen }}>
                    <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <Text style={{ color: colors.muted, fontWeight: "700", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8 }}>Remaining Items</Text>
                        <View style={{ flexDirection: "row", gap: 6 }}>
                            <TouchableOpacity onPress={handleSelectAll} style={{ paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.teal + "15", borderRadius: 6, borderWidth: 1, borderColor: colors.teal + "40" }}>
                                <Text style={{ color: colors.teal, fontSize: 11, fontWeight: "700" }}>All</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleClearSelection} style={{ paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.screen, borderRadius: 6, borderWidth: 1, borderColor: colors.border }}>
                                <Text style={{ color: colors.label, fontSize: 11, fontWeight: "700" }}>Clear</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <ScrollView contentContainerStyle={{ paddingTop: 8, paddingBottom: 100 }}>
                        {unpaidItems.length === 0 ? (
                            <View style={{ padding: 20, alignItems: "center" }}>
                                <CheckCircle size={40} color={colors.success} />
                                <Text style={{ color: colors.success, fontWeight: "700", marginTop: 8, fontSize: 13 }}>All Items Paid!</Text>
                            </View>
                        ) : (
                            unpaidItems.map((item) => {
                                const unpaidQty = item.quantity - (item.paidQuantity || 0);
                                const selected = selectedItems.get(item.id);
                                const selectedQty = selected?.quantityToPay || 0;
                                const isSelected = selectedQty > 0;
                                return (
                                    <View
                                        key={item.id}
                                        style={{
                                            flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, marginHorizontal: 10, marginBottom: 8, borderRadius: 10, borderWidth: 1,
                                            backgroundColor: isSelected ? colors.teal + "10" : colors.panel,
                                            borderColor: isSelected ? colors.teal + "40" : colors.border,
                                        }}
                                    >
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ fontWeight: "700", fontSize: 13, color: isSelected ? colors.teal : colors.heading }}>{item.name}</Text>
                                            <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>${item.price.toFixed(2)} × {unpaidQty} unpaid</Text>
                                        </View>
                                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                            <TouchableOpacity
                                                onPress={() => handleRemoveItem(item.id)}
                                                disabled={selectedQty === 0}
                                                style={{ width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: selectedQty > 0 ? colors.danger : colors.card, opacity: selectedQty > 0 ? 1 : 0.4 }}
                                            >
                                                <Minus size={11} color={colors.onSolid} />
                                            </TouchableOpacity>
                                            <View style={{ minWidth: 30, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, alignItems: "center", backgroundColor: isSelected ? colors.teal : colors.card }}>
                                                <Text style={{ fontWeight: "700", fontSize: 10, color: isSelected ? colors.onSolid : colors.label }}>{selectedQty}</Text>
                                            </View>
                                            <TouchableOpacity
                                                onPress={() => handleAddItem(item)}
                                                disabled={selectedQty >= unpaidQty}
                                                style={{ width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.teal, opacity: selectedQty < unpaidQty ? 1 : 0.4 }}
                                            >
                                                <Plus size={11} color={colors.onSolid} />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                );
                            })
                        )}
                    </ScrollView>
                </View>

                {/* RIGHT PANEL */}
                <View style={{ width: "55%", backgroundColor: colors.screen }}>
                    {/* Totals Header */}
                    <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.panel }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                            <View style={{ alignItems: "center", flex: 1 }}>
                                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.heading }}>${activeOrderTotal.toFixed(2)}</Text>
                                <Text style={{ color: colors.muted, fontSize: 10, marginTop: 2 }}>Order Total</Text>
                            </View>
                            <View style={{ alignItems: "center", flex: 1 }}>
                                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
                                    <Text style={{ fontSize: 14, fontWeight: "700", color: colors.warning }}>${remainingAmount.toFixed(2)}</Text>
                                    {remainingCashSavings > 0.01 && (
                                        <Text style={{ fontSize: 10, fontWeight: "500", color: colors.success }}>(${remainingCashAmount.toFixed(2)})</Text>
                                    )}
                                </View>
                                <Text style={{ color: colors.muted, fontSize: 10, marginTop: 2 }}>
                                    Remaining
                                </Text>
                            </View>
                            <View style={{ alignItems: "center", flex: 1 }}>
                                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.success }}>${collectedAmount.toFixed(2)}</Text>
                                <Text style={{ color: colors.muted, fontSize: 10, marginTop: 2 }}>Collected</Text>
                            </View>
                        </View>
                    </View>

                    {/* Payments */}
                    <View style={{ flex: 1, padding: 16 }}>
                        <Text style={{ color: colors.muted, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 }}>
                            Payments ({payments.length})
                        </Text>
                        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                            {payments.length === 0 ? (
                                <View style={{ alignItems: "center", paddingVertical: 24 }}>
                                    <Text style={{ color: colors.muted, fontSize: 12 }}>No payments yet</Text>
                                </View>
                            ) : (
                                payments.map((payment, index) => (
                                    <PaymentRow
                                        key={payment.id || index}
                                        payment={payment}
                                        index={index}
                                        onVoid={() => handleVoidPayment(index)}
                                        isVoiding={voidingPaymentIndex === index}
                                    />
                                ))
                            )}
                        </ScrollView>

                        {selectedItems.size > 0 && (
                            <View style={{ marginTop: 14, marginHorizontal: 16, padding: 12, backgroundColor: colors.panel, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}>
                                <Text style={{ color: colors.muted, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Selected for Payment</Text>
                                <View style={{ flexDirection: "row", gap: 10 }}>
                                    <TouchableOpacity
                                        onPress={() => setPaymentMethod("card")}
                                        style={{ flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, backgroundColor: paymentMethod === "card" ? colors.teal + "15" : colors.screen, borderColor: paymentMethod === "card" ? colors.teal + "40" : colors.border }}
                                    >
                                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                                            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                                                <CreditCard size={14} color={colors.teal} />
                                                <Text style={{ color: colors.muted, fontSize: 11 }}>Card</Text>
                                            </View>
                                            <Text style={{ color: colors.teal, fontWeight: "700", fontSize: 13 }}>${selectedCardTotals.total.toFixed(2)}</Text>
                                        </View>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={() => setPaymentMethod("cash")}
                                        style={{ flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, backgroundColor: paymentMethod === "cash" ? colors.teal + "15" : colors.screen, borderColor: paymentMethod === "cash" ? colors.teal + "40" : colors.border }}
                                    >
                                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                                            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                                                <Banknote size={14} color={colors.teal} />
                                                <Text style={{ color: colors.muted, fontSize: 11 }}>Cash</Text>
                                                {cashSavings > 0.01 && (
                                                    <View style={{ paddingHorizontal: 4, paddingVertical: 1, backgroundColor: colors.teal + "20", borderRadius: 6 }}>
                                                        <Text style={{ color: colors.teal, fontSize: 9, fontWeight: "700" }}>-${cashSavings.toFixed(2)}</Text>
                                                    </View>
                                                )}
                                            </View>
                                            <Text style={{ color: colors.teal, fontWeight: "700", fontSize: 13 }}>${selectedCashTotals.total.toFixed(2)}</Text>
                                        </View>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}
                    </View>

                    {/* Footer */}
                    <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.panel }}>
                        <View style={{ flexDirection: "row", gap: 10 }}>
                            <TouchableOpacity
                                onPress={handleBackToOrder}
                                style={{ flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: "center", backgroundColor: colors.screen }}
                            >
                                <Text style={{ color: colors.label, fontWeight: "700", fontSize: 12 }}>Back to Order</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={handleContinueCharging}
                                disabled={selectedItems.size === 0 || isProcessing}
                                style={{ flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center", backgroundColor: selectedItems.size > 0 ? colors.teal : colors.screen, borderWidth: selectedItems.size > 0 ? 0 : 1, borderColor: colors.border, opacity: selectedItems.size === 0 ? 0.6 : 1 }}
                            >
                                {isProcessing
                                    ? <ActivityIndicator color={colors.onSolid} />
                                    : <Text style={{ fontWeight: "700", fontSize: 12, color: selectedItems.size > 0 ? colors.onSolid : colors.muted }}>
                                        {selectedItems.size > 0
                                            ? `Pay $${paymentMethod === "cash" ? selectedCashTotals.total.toFixed(2) : selectedCardTotals.total.toFixed(2)}`
                                            : "Select Items"}
                                    </Text>
                                }
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </View>
        </View>
    );
};

export default PayForItemsView;

