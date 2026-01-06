import { CartItem } from "@/lib/types";
import {
    calculateItemEffectiveCashPrice,
    useOrderStore,
} from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
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
    const originalQuantity = item.quantity;

    // Calculate unit price: for cash, use effective cash price (includes modifiers)
    const unitPrice = isCash ? calculateItemEffectiveCashPrice(item) : item.price;

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
        itemsCovered?: string[];
    };
    index: number;
    onVoid: () => void;
    onPrint?: () => void;
    isVoiding?: boolean;
}

const PaymentRow: React.FC<PaymentRowProps> = ({
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
        <View className="flex-row items-center justify-between py-3 px-2 bg-[#2a2a2a] rounded-lg mb-2">
            {/* Payment Badge + Method */}
            <View className="flex-row items-center flex-1">
                <View className="bg-green-600 px-2 py-1 rounded mr-3">
                    <Text className="text-white text-xs font-bold">Paid</Text>
                </View>
                <View>
                    <Text className="text-white font-medium">{methodDisplay}</Text>
                    {payment.timestamp && (
                        <Text className="text-gray-500 text-xs">
                            {new Date(payment.timestamp).toLocaleTimeString("en-US", {
                                hour: "2-digit",
                                minute: "2-digit",
                            })}
                        </Text>
                    )}
                </View>
            </View>

            {/* Amount */}
            <View className="items-end mr-4">
                <Text className="text-white font-bold text-lg">
                    ${payment.amount.toFixed(2)}
                </Text>
                {payment.tip_amount && payment.tip_amount > 0 && (
                    <Text className="text-green-400 text-xs">
                        +${payment.tip_amount.toFixed(2)} tip
                    </Text>
                )}
            </View>

            {/* Actions */}
            <View className="flex-row gap-2">
                {onPrint && (
                    <TouchableOpacity
                        onPress={onPrint}
                        className="px-3 py-2 bg-blue-600/20 rounded-lg"
                    >
                        <FileText size={16} color="#60A5FA" />
                    </TouchableOpacity>
                )}
                <TouchableOpacity
                    onPress={onVoid}
                    disabled={isVoiding}
                    className="px-3 py-2 bg-red-600/20 rounded-lg"
                >
                    {isVoiding ? (
                        <ActivityIndicator size="small" color="#EF4444" />
                    ) : (
                        <RotateCcw size={16} color="#EF4444" />
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================
const PayForItemsView: React.FC = () => {
    // --- STORE STATE ---
    const activeOrderId = useOrderStore((state) => state.activeOrderId);
    const ordersById = useOrderStore((state) => state.ordersById);
    const activeOrderTotal = useOrderStore((state) => state.activeOrderTotal);
    const activeOrderTotalCash = useOrderStore((state) => state.activeOrderTotalCash);
    const voidPayment = useOrderStore((state) => state.voidPayment);
    const taxRatesMap = useStoreSettingsStore((state) => state.taxRatesMap);

    const { setView, close, addSplit, resetSplits } =
        usePaymentStore();

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
    const remainingCashAmount = activeOrder?.cash_amount_due !== undefined && activeOrder.cash_amount_due >= 0
        ? activeOrder.cash_amount_due  // Use backend's cash_amount_due
        : Math.max(0, (activeOrderTotalCash || activeOrderTotal) - collectedAmount);
    
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
            <View className="flex-1 bg-[#212121] items-center justify-center">
                <Text className="text-gray-400">No active order</Text>
            </View>
        );
    }

    return (
        <View className="flex-1 bg-[#212121]">
            {/* Header */}
            <View className="flex-row items-center p-4 border-b border-[#333] h-[70px]">
                <TouchableOpacity
                    onPress={handleGoBack}
                    className="p-2 bg-[#333] rounded-lg mr-4"
                >
                    <ArrowLeft size={20} color="white" />
                </TouchableOpacity>
                <View className="flex-1">
                    <Text className="text-xl font-bold text-white">Split Review</Text>
                    <Text className="text-gray-400 text-xs">
                        Select items to pay or manage payments
                    </Text>
                </View>

                {/* Void All Payments */}
                {payments.length > 0 && (
                    <TouchableOpacity
                        onPress={handleVoidAllPayments}
                        className="px-3 py-2 bg-red-600/20 rounded-lg flex-row items-center"
                    >
                        <Trash2 size={16} color="#EF4444" />
                        <Text className="text-red-400 font-bold ml-2 text-sm">VOID ALL</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* Two-Panel Layout */}
            <View className="flex-1 flex-row">
                {/* LEFT PANEL - Remaining Items */}
                <View className="w-[45%] border-r border-gray-700 bg-[#1a1a1a]">
                    {/* Left Panel Header */}
                    <View className="p-3 border-b border-[#333] flex-row justify-between items-center">
                        <Text className="text-orange-500 font-bold text-sm uppercase tracking-wider">
                            Remaining Items
                        </Text>
                        <View className="flex-row gap-2">
                            <TouchableOpacity
                                onPress={handleSelectAll}
                                className="px-2 py-1 bg-blue-600/20 rounded"
                            >
                                <Text className="text-blue-400 text-xs font-bold">ALL</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={handleClearSelection}
                                className="px-2 py-1 bg-gray-600/20 rounded"
                            >
                                <Text className="text-gray-400 text-xs font-bold">CLEAR</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Items List */}
                    <BottomSheetScrollView contentContainerStyle={{ paddingBottom: 100 }}>
                        {unpaidItems.length === 0 ? (
                            <View className="p-4 items-center">
                                <CheckCircle size={40} color="#10B981" />
                                <Text className="text-green-400 font-bold mt-2">
                                    All Items Paid!
                                </Text>
                            </View>
                        ) : (
                            unpaidItems.map((item) => {
                                const unpaidQty = item.quantity - (item.paidQuantity || 0);
                                const selected = selectedItems.get(item.id);
                                const selectedQty = selected?.quantityToPay || 0;
                                const isSelected = selectedQty > 0;
                                // console.log('[item | PayForItemsView] item', item);
                                return (
                                    <View
                                        key={item.id}
                                        className={`flex-row items-center p-3 border-b border-[#333] ${isSelected ? "bg-blue-900/30" : "bg-transparent"
                                            }`}
                                    >
                                        {/* Item Info */}
                                        <View className="flex-1">
                                            <Text
                                                className={`font-semibold ${isSelected ? "text-white" : "text-gray-300"
                                                    }`}
                                            >
                                                {item.name}
                                            </Text>
                                            <Text className="text-gray-500 text-sm">
                                                ${item.price.toFixed(2)} × {unpaidQty} unpaid
                                            </Text>
                                        </View>

                                        {/* Quantity Controls */}
                                        <View className="flex-row items-center gap-2">
                                            <TouchableOpacity
                                                onPress={() => handleRemoveItem(item.id)}
                                                disabled={selectedQty === 0}
                                                className={`w-8 h-8 rounded-full items-center justify-center ${selectedQty > 0
                                                    ? "bg-red-600"
                                                    : "bg-[#333] opacity-30"
                                                    }`}
                                            >
                                                <Minus size={14} color="white" />
                                            </TouchableOpacity>

                                            <View
                                                className={`min-w-[36px] px-2 py-1 rounded-md items-center ${isSelected ? "bg-blue-600" : "bg-[#333]"
                                                    }`}
                                            >
                                                <Text
                                                    className={`font-bold ${isSelected ? "text-white" : "text-gray-500"
                                                        }`}
                                                >
                                                    {selectedQty}
                                                </Text>
                                            </View>

                                            <TouchableOpacity
                                                onPress={() => handleAddItem(item)}
                                                disabled={selectedQty >= unpaidQty}
                                                className={`w-8 h-8 rounded-full items-center justify-center ${selectedQty < unpaidQty
                                                    ? "bg-green-600"
                                                    : "bg-[#333] opacity-30"
                                                    }`}
                                            >
                                                <Plus size={14} color="white" />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                );
                            })
                        )}
                    </BottomSheetScrollView>
                </View>

                {/* RIGHT PANEL - Split Review */}
                <View className="w-[55%] bg-[#212121]">
                    {/* Totals Header */}
                    <View className="p-4 border-b border-[#333]">
                        <View className="flex-row justify-between">
                            {/* Order Total */}
                            <View className="items-center">
                                <Text className="text-2xl font-bold text-white">
                                    ${activeOrderTotal.toFixed(2)}
                                </Text>
                                <Text className="text-gray-500 text-xs uppercase">
                                    Order Total
                                </Text>
                            </View>

                            {/* Remaining - Show both card and cash */}
                            <View className="items-center">
                                <View className="flex-row items-baseline gap-2">
                                    <Text className="text-2xl font-bold text-orange-500">
                                        ${remainingAmount.toFixed(2)}
                                    </Text>
                                    {remainingCashSavings > 0.01 && (
                                        <Text className="text-sm font-medium text-green-400">
                                            (${remainingCashAmount.toFixed(2)} cash)
                                        </Text>
                                    )}
                                </View>
                                <Text className="text-gray-500 text-xs uppercase">
                                    Remaining{remainingCashSavings > 0.01 ? ' (Card / Cash)' : ''}
                                </Text>
                            </View>

                            {/* Collected */}
                            <View className="items-center">
                                <Text className="text-2xl font-bold text-green-400">
                                    ${collectedAmount.toFixed(2)}
                                </Text>
                                <Text className="text-gray-500 text-xs uppercase">
                                    Collected • {collectedPercent}%
                                </Text>
                            </View>
                        </View>
                    </View>

                    {/* Payments Section */}
                    <View className="flex-1 p-4">
                        <Text className="text-gray-500 text-xs uppercase tracking-wider mb-3">
                            Payments ({payments.length})
                        </Text>

                        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
                            {payments.length === 0 ? (
                                <View className="items-center py-6">
                                    <Text className="text-gray-500">No payments yet</Text>
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

                        {/* Selected Items Summary */}
                        {selectedItems.size > 0 && (
                            <View className="mt-4 p-3 bg-[#2a2a2a] rounded-xl border border-[#444]">
                                <Text className="text-gray-400 text-xs uppercase mb-2">
                                    Selected for Payment
                                </Text>

                                {/* Dual Pricing */}
                                <View className="flex-row gap-2 mb-3">
                                    {/* Card */}
                                    <TouchableOpacity
                                        onPress={() => setPaymentMethod("card")}
                                        className={`flex-1 p-3 rounded-lg border ${paymentMethod === "card"
                                            ? "bg-blue-600/20 border-blue-500"
                                            : "bg-[#333] border-[#444]"
                                            }`}
                                    >
                                        <View className="flex-row items-center justify-between">
                                            <View className="flex-row items-center">
                                                <CreditCard size={16} color="#60A5FA" />
                                                <Text className="text-gray-400 text-xs ml-2">Card</Text>
                                            </View>
                                            <Text className="text-blue-400 font-bold">
                                                ${selectedCardTotals.total.toFixed(2)}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>

                                    {/* Cash */}
                                    <TouchableOpacity
                                        onPress={() => setPaymentMethod("cash")}
                                        className={`flex-1 p-3 rounded-lg border ${paymentMethod === "cash"
                                            ? "bg-green-600/20 border-green-500"
                                            : "bg-[#333] border-[#444]"
                                            }`}
                                    >
                                        <View className="flex-row items-center justify-between">
                                            <View className="flex-row items-center">
                                                <Banknote size={16} color="#10B981" />
                                                <Text className="text-gray-400 text-xs ml-2">Cash</Text>
                                                {cashSavings > 0.01 && (
                                                    <View className="ml-1 px-1.5 py-0.5 bg-green-900/30 rounded-full">
                                                        <Text className="text-green-400 text-[10px] font-bold">
                                                            -${cashSavings.toFixed(2)}
                                                        </Text>
                                                    </View>
                                                )}
                                            </View>
                                            <Text className="text-green-400 font-bold">
                                                ${selectedCashTotals.total.toFixed(2)}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}
                    </View>

                    {/* Footer Actions */}
                    <View className="p-4 border-t border-[#333]">
                        <View className="flex-row gap-3">
                            <TouchableOpacity
                                onPress={handleBackToOrder}
                                className="flex-1 py-3 rounded-xl border border-[#444] items-center"
                            >
                                <Text className="text-white font-bold">BACK TO ORDER</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={handleContinueCharging}
                                disabled={selectedItems.size === 0 || isProcessing}
                                className={`flex-1 py-3 rounded-xl items-center ${selectedItems.size > 0
                                    ? "bg-green-600"
                                    : "bg-[#333] opacity-50"
                                    }`}
                            >
                                {isProcessing ? (
                                    <ActivityIndicator color="white" />
                                ) : (
                                    <Text className="text-white font-bold">
                                        {selectedItems.size > 0
                                            ? `PAY $${paymentMethod === "cash"
                                                ? selectedCashTotals.total.toFixed(2)
                                                : selectedCardTotals.total.toFixed(2)
                                            }`
                                            : "SELECT ITEMS"}
                                    </Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </View>
        </View>
    );
};

export default PayForItemsView;

