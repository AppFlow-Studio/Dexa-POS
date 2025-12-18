import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/contexts/ToastContext";
import { usePosSync } from "@/hooks/pos/usePosSync";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { useMenuStore } from "@/stores/useMenuStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import type {
    AddOrderItemParams,
    CreateOrderParams,
    OrderItem,
    OrderItemModifier,
    OrderStatus,
    OrderType,
    PaymentMethod,
    ProcessPaymentParams,
    TerminalType,
} from "@/types/db-order-management-types";
import type { MenuItemDetails, MenuWithCategories } from "@/types/menu";
import { useRouter } from "expo-router";
import {
    ChevronDown,
    ChevronUp,
    Copy,
    Minus,
    Plus,
    RotateCcw,
    Trash2,
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
    Alert,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

interface TestLog {
    id: string;
    timestamp: string;
    operation: string;
    request?: any;
    response?: any;
    error?: string;
    success: boolean;
}

const OrderTest = () => {
    const { show } = useToast();
    const supabase = useSupabaseClient();
    const router = useRouter();
    const selectedStore = useStoreSettingsStore((state) => state.selectedStore);

    // Fetch menu data
    const { data: posSyncData, isLoading: isLoadingMenu } = usePosSync(
        selectedStore?.id || null
    );
    const { getAllMenuItems } = useMenuStore();

    // Get all menu items from store
    const allMenuItems = useMemo(() => {
        return getAllMenuItems();
    }, [getAllMenuItems]);

    // Flatten menu items from sync data with category information
    interface MenuItemWithCategory {
        menu_item: MenuItemDetails;
        category_name: string;
    }

    const menuItemsFromSync = useMemo(() => {
        if (!posSyncData?.menus) return [];
        const items: MenuItemWithCategory[] = [];
        posSyncData.menus.forEach((menu: MenuWithCategories) => {
            menu.categories.forEach((category) => {
                category.items.forEach((item) => {
                    items.push({
                        menu_item: item.menu_item,
                        category_name: category.category?.name || "Uncategorized",
                    });
                });
            });
        });
        return items;
    }, [posSyncData]);

    // Get first available menu item as default
    const defaultMenuItem = useMemo(() => {
        return menuItemsFromSync.length > 0 ? menuItemsFromSync[0].menu_item : null;
    }, [menuItemsFromSync]);

    const defaultCategoryName = useMemo(() => {
        return menuItemsFromSync.length > 0
            ? menuItemsFromSync[0].category_name
            : "";
    }, [menuItemsFromSync]);

    // Order Configuration State
    const [orderType, setOrderType] = useState<OrderType>("dine_in");
    const [tableNumber, setTableNumber] = useState("");
    const [customerName, setCustomerName] = useState("");
    const [customerPhone, setCustomerPhone] = useState("");
    const [orderSpecialInstructions, setOrderSpecialInstructions] = useState("");

    // Item Configuration State
    const [selectedMenuItem, setSelectedMenuItem] =
        useState<MenuItemDetails | null>(null);
    const [selectedCategoryName, setSelectedCategoryName] = useState<string>("");
    const [useCashPrice, setUseCashPrice] = useState<boolean>(true);
    const [menuItemId, setMenuItemId] = useState("");
    const [locationExclusiveItemId, setLocationExclusiveItemId] = useState("");
    const [quantity, setQuantity] = useState("1");
    const [selectedSizeId, setSelectedSizeId] = useState("");
    const [selectedSizeName, setSelectedSizeName] = useState<string>("");
    const [sizePriceModifier, setSizePriceModifier] = useState<number>(0);
    const [itemSpecialInstructions, setItemSpecialInstructions] = useState("");

    // Modifier Selection State: { [groupId]: { [itemId]: { selected: boolean, quantity: number } } }
    const [modifierSelections, setModifierSelections] = useState<
        Record<string, Record<string, { selected: boolean; quantity: number }>>
    >({});

    // Expanded modifier groups for UI
    const [expandedModifierGroups, setExpandedModifierGroups] = useState<
        Record<string, boolean>
    >({});

    // Set default menu item when data loads
    React.useEffect(() => {
        if (defaultMenuItem && !selectedMenuItem) {
            setSelectedMenuItem(defaultMenuItem);
            setMenuItemId(defaultMenuItem.id);
            setSelectedCategoryName(defaultCategoryName);
        }
    }, [defaultMenuItem, defaultCategoryName, selectedMenuItem]);

    // Update menuItemId when selectedMenuItem changes
    React.useEffect(() => {
        if (selectedMenuItem) {
            setMenuItemId(selectedMenuItem.id);
            // Reset modifier selections when menu item changes
            setModifierSelections({});
            // Expand all modifier groups by default
            const expanded: Record<string, boolean> = {};
            selectedMenuItem.modifier_groups.forEach((group) => {
                expanded[group.id] = true;
            });
            setExpandedModifierGroups(expanded);
        }
    }, [selectedMenuItem]);

    // Helper function to toggle modifier selection
    const handleModifierToggle = (groupId: string, itemId: string) => {
        const group = selectedMenuItem?.modifier_groups.find(
            (g) => g.id === groupId
        );
        if (!group) return;

        setModifierSelections((prev) => {
            const newSelections = { ...prev };
            if (!newSelections[groupId]) {
                newSelections[groupId] = {};
            }

            const currentSelections = newSelections[groupId];
            const isCurrentlySelected = currentSelections[itemId]?.selected || false;
            const currentSelectedCount = Object.values(currentSelections).filter(
                (sel) => sel.selected
            ).length;

            // Handle single selection (max_selections = 1)
            if (group.max_selections === 1) {
                // Clear all other selections in this group
                Object.keys(currentSelections).forEach((key) => {
                    currentSelections[key] = { selected: false, quantity: 1 };
                });
                // Toggle the selected item
                currentSelections[itemId] = {
                    selected: !isCurrentlySelected,
                    quantity: 1,
                };
            } else {
                // Multiple selection - check max limit
                if (
                    !isCurrentlySelected &&
                    currentSelectedCount >= group.max_selections
                ) {
                    // Max reached, don't allow selection
                    return prev;
                }

                // Toggle selection
                currentSelections[itemId] = {
                    selected: !isCurrentlySelected,
                    quantity: currentSelections[itemId]?.quantity || 1,
                };
            }

            return newSelections;
        });
    };

    // Helper function to update modifier quantity
    const handleModifierQuantityChange = (
        groupId: string,
        itemId: string,
        delta: number
    ) => {
        setModifierSelections((prev) => {
            const newSelections = { ...prev };
            if (!newSelections[groupId]) {
                newSelections[groupId] = {};
            }

            const current = newSelections[groupId][itemId];
            if (!current || !current.selected) return prev;

            const newQuantity = Math.max(1, (current.quantity || 1) + delta);
            newSelections[groupId][itemId] = {
                ...current,
                quantity: newQuantity,
            };

            return newSelections;
        });
    };

    // Helper function to convert modifier selections to AddOrderItemParams format
    const convertModifiersToParams = (): Array<{
        modifier_group_id: string;
        modifier_item_id: string;
        modifier_group_name: string;
        modifier_name: string;
        price_modifier: number;
        quantity?: number;
    }> => {
        if (!selectedMenuItem) return [];

        const result: Array<{
            modifier_group_id: string;
            modifier_item_id: string;
            modifier_group_name: string;
            modifier_name: string;
            price_modifier: number;
            quantity?: number;
        }> = [];

        Object.entries(modifierSelections).forEach(([groupId, items]) => {
            const group = selectedMenuItem.modifier_groups.find(
                (g) => g.id === groupId
            );
            if (!group) return;

            Object.entries(items).forEach(([itemId, selection]) => {
                if (selection.selected) {
                    const modifierItem = group.items.find((item) => item.id === itemId);
                    if (modifierItem) {
                        result.push({
                            modifier_group_id: groupId,
                            modifier_item_id: itemId,
                            modifier_group_name: group.name,
                            modifier_name: modifierItem.name,
                            price_modifier: modifierItem.price_modifier,
                            quantity: selection.quantity > 1 ? selection.quantity : undefined,
                        });
                    }
                }
            });
        });

        return result;
    };

    // Helper function to validate modifier selections
    const validateModifierSelections = (): { valid: boolean; error?: string } => {
        if (!selectedMenuItem) return { valid: true };

        for (const group of selectedMenuItem.modifier_groups) {
            const selections = modifierSelections[group.id] || {};
            const selectedCount = Object.values(selections).filter(
                (sel) => sel.selected
            ).length;

            // Check required groups
            if (group.is_required && selectedCount < group.min_selections) {
                return {
                    valid: false,
                    error: `${group.name} is required. Please select at least ${group.min_selections} item(s).`,
                };
            }

            // Check min selections
            if (selectedCount > 0 && selectedCount < group.min_selections) {
                return {
                    valid: false,
                    error: `${group.name} requires at least ${group.min_selections} selection(s).`,
                };
            }

            // Check max selections
            if (selectedCount > group.max_selections) {
                return {
                    valid: false,
                    error: `${group.name} allows a maximum of ${group.max_selections} selection(s).`,
                };
            }
        }

        return { valid: true };
    };

    // Helper function to clear all modifiers
    const handleClearModifiers = () => {
        setModifierSelections({});
        show({
            title: "Modifiers Cleared",
            message: "All modifier selections have been cleared",
            type: "success",
        });
    };

    // Helper function to toggle replace modifier selection
    const handleReplaceModifierToggle = (groupId: string, itemId: string) => {
        if (!selectedOrderItemMenuItem) return;

        const group = selectedOrderItemMenuItem.modifier_groups.find(
            (g) => g.id === groupId
        );
        if (!group) return;

        setReplaceModifierSelections((prev) => {
            const newSelections = { ...prev };
            if (!newSelections[groupId]) {
                newSelections[groupId] = {};
            }

            const currentSelections = newSelections[groupId];
            const isCurrentlySelected = currentSelections[itemId]?.selected || false;
            const currentSelectedCount = Object.values(currentSelections).filter(
                (sel) => sel.selected
            ).length;

            // Handle single selection (max_selections = 1)
            if (group.max_selections === 1) {
                // Clear all other selections in this group
                Object.keys(currentSelections).forEach((key) => {
                    currentSelections[key] = { selected: false, quantity: 1 };
                });
                // Toggle the selected item
                currentSelections[itemId] = {
                    selected: !isCurrentlySelected,
                    quantity: 1,
                };
            } else {
                // Multiple selection - check max limit
                if (
                    !isCurrentlySelected &&
                    currentSelectedCount >= group.max_selections
                ) {
                    // Max reached, don't allow selection
                    return prev;
                }

                // Toggle selection
                currentSelections[itemId] = {
                    selected: !isCurrentlySelected,
                    quantity: currentSelections[itemId]?.quantity || 1,
                };
            }

            return newSelections;
        });
    };

    // Helper function to update replace modifier quantity
    const handleReplaceModifierQuantityChange = (
        groupId: string,
        itemId: string,
        delta: number
    ) => {
        setReplaceModifierSelections((prev) => {
            const newSelections = { ...prev };
            if (!newSelections[groupId]) {
                newSelections[groupId] = {};
            }

            const current = newSelections[groupId][itemId];
            if (!current || !current.selected) return prev;

            const newQuantity = Math.max(1, (current.quantity || 1) + delta);
            newSelections[groupId][itemId] = {
                ...current,
                quantity: newQuantity,
            };

            return newSelections;
        });
    };

    // Helper function to clear replace modifiers
    const handleClearReplaceModifiers = () => {
        setReplaceModifierSelections({});
        show({
            title: "Modifiers Cleared",
            message: "All modifier selections have been cleared",
            type: "success",
        });
    };

    // Helper function to calculate total modifier price impact
    const calculateModifierPriceImpact = (): number => {
        if (!selectedMenuItem) return 0;

        let total = 0;
        Object.entries(modifierSelections).forEach(([groupId, items]) => {
            const group = selectedMenuItem.modifier_groups.find(
                (g) => g.id === groupId
            );
            if (!group) return;

            Object.entries(items).forEach(([itemId, selection]) => {
                if (selection.selected) {
                    const modifierItem = group.items.find((item) => item.id === itemId);
                    if (modifierItem) {
                        total += modifierItem.price_modifier * (selection.quantity || 1);
                    }
                }
            });
        });

        return total;
    };

    // Payment Configuration State
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
    const [amount, setAmount] = useState("");
    const [tipAmount, setTipAmount] = useState("0");
    const [taxRate, setTaxRate] = useState("0.0825");
    const [terminalType, setTerminalType] = useState<TerminalType>("none");
    const [terminalId, setTerminalId] = useState("");
    const [deviceId, setDeviceId] = useState("");


    // Status Configuration
    const [orderStatus, setOrderStatus] = useState<OrderStatus>("pending");

    // Current Order State
    const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);

    // Test Results/Logs
    const [logs, setLogs] = useState<TestLog[]>([]);

    // Order Item CRUD State
    interface OrderItemWithModifiers extends OrderItem {
        modifiers?: OrderItemModifier[];
        prep_station?: string;
        course_number?: number;
    }

    const [orderItemsList, setOrderItemsList] = useState<OrderItem[]>([]);
    const [selectedOrderItemId, setSelectedOrderItemId] = useState<string | null>(null);
    const [selectedOrderItem, setSelectedOrderItem] = useState<OrderItemWithModifiers | null>(null);
    const [itemQuantity, setItemQuantity] = useState("");
    const [itemCrudSpecialInstructions, setItemCrudSpecialInstructions] = useState("");
    const [itemPriceOverride, setItemPriceOverride] = useState("");
    const [itemPrepStation, setItemPrepStation] = useState("");
    const [itemCourseNumber, setItemCourseNumber] = useState("");
    const [modifierIdToRemove, setModifierIdToRemove] = useState("");
    const [voidReason, setVoidReason] = useState("");
    const [duplicateQuantity, setDuplicateQuantity] = useState("");

    // Modifier selection for add operation
    const [selectedModifierForAdd, setSelectedModifierForAdd] = useState<{
        modifierGroupId: string;
        modifierItemId: string;
        modifierGroupName: string;
        modifierName: string;
        priceModifier: number;
        quantity: number;
    } | null>(null);

    // Modifier selection for replace operation (separate from Item Configuration)
    const [replaceModifierSelections, setReplaceModifierSelections] = useState<
        Record<string, Record<string, { selected: boolean; quantity: number }>>
    >({});

    // Menu item associated with the selected order item
    const [selectedOrderItemMenuItem, setSelectedOrderItemMenuItem] = useState<MenuItemDetails | null>(null);

    // Expanded modifier groups for replace operation
    const [expandedReplaceModifierGroups, setExpandedReplaceModifierGroups] = useState<
        Record<string, boolean>
    >({});

    // Loading States
    const [loading, setLoading] = useState({
        createOrder: false,
        addItem: false,
        calculateTax: false,
        updateStatus: false,
        processPayment: false,
        completeFlow: false,
        getOrderItems: false,
        getOrderItem: false,
        updateQuantity: false,
        updateItem: false,
        replaceModifiers: false,
        addModifier: false,
        removeModifier: false,
        voidItem: false,
        duplicateItem: false,
    });

    // Helper function to add log
    const addLog = (
        operation: string,
        request?: any,
        response?: any,
        error?: string
    ) => {
        const log: TestLog = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            operation,
            request,
            response,
            error,
            success: !error,
        };
        setLogs((prev) => [log, ...prev]);
    };

    // Helper function to call RPC
    const callRPC = async (rpcName: string, params: any) => {
        const { data, error } = await supabase.rpc(rpcName, params);
        if (error) throw error;
        return data;
    };

    // Helper function to map order item modifiers to selection state
    const mapOrderItemModifiersToSelections = (
        orderItem: OrderItemWithModifiers,
        menuItem: MenuItemDetails
    ): Record<string, Record<string, { selected: boolean; quantity: number }>> => {
        const selections: Record<string, Record<string, { selected: boolean; quantity: number }>> = {};

        // Initialize all modifier groups from menu item
        menuItem.modifier_groups.forEach((group) => {
            selections[group.id] = {};
            group.items.forEach((modifierItem) => {
                selections[group.id][modifierItem.id] = {
                    selected: false,
                    quantity: 1,
                };
            });
        });

        // Map current order item modifiers to selections
        if (orderItem.modifiers && orderItem.modifiers.length > 0) {
            orderItem.modifiers.forEach((orderModifier) => {
                // Find the modifier group and item
                const group = menuItem.modifier_groups.find(
                    (g) => g.id === orderModifier.modifier_group_id || g.name === orderModifier.modifier_group_name
                );

                if (group) {
                    const modifierItem = group.items.find(
                        (item) => item.id === orderModifier.modifier_item_id || item.name === orderModifier.modifier_name
                    );

                    if (modifierItem && selections[group.id]) {
                        selections[group.id][modifierItem.id] = {
                            selected: true,
                            quantity: orderModifier.quantity || 1,
                        };
                    }
                }
            });
        }

        return selections;
    };

    // Create Order
    const handleCreateOrder = async () => {
        if (!selectedStore) {
            show({
                title: "Error",
                message: "No store selected. Please select a store in settings.",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, createOrder: true }));

        try {
            const params: CreateOrderParams = {
                p_merchant_id: selectedStore.merchant_id,
                p_location_id: selectedStore.id,
                p_order_type: orderType,
                p_table_number: tableNumber || undefined,
                p_customer_name: customerName || undefined,
                p_customer_phone: customerPhone || undefined,
                p_special_instructions: orderSpecialInstructions || undefined,
            };

            addLog("Create Order", params);

            const result = await callRPC("create_order", params);

            if (result?.order_id) {
                setCurrentOrderId(result.order_id);
                addLog("Create Order", params, result);
                show({
                    title: "Success",
                    message: `Order created: ${result.order_id}`,
                    type: "success",
                });
            } else {
                throw new Error("No order_id in response");
            }
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to create order";
            addLog("Create Order", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, createOrder: false }));
        }
    };

    // Add Item
    const handleAddItem = async () => {
        if (!currentOrderId) {
            show({
                title: "Error",
                message: "Please create an order first.",
                type: "error",
            });
            return;
        }

        if (!menuItemId && !locationExclusiveItemId) {
            show({
                title: "Error",
                message:
                    "Please provide either menu_item_id or location_exclusive_item_id",
                type: "error",
            });
            return;
        }

        // Validate that we have a selected menu item with required data
        if (!selectedMenuItem) {
            show({
                title: "Error",
                message: "Please select a menu item",
                type: "error",
            });
            return;
        }

        // Validate modifier selections
        const validation = validateModifierSelections();
        if (!validation.valid) {
            show({
                title: "Invalid Modifier Selection",
                message: validation.error || "Please fix modifier selections",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, addItem: true }));

        try {
            // Convert modifier selections to params format
            const convertedModifiers = convertModifiersToParams();

            const params: AddOrderItemParams = {
                p_order_id: currentOrderId,
                p_menu_item_id: menuItemId || undefined,
                p_location_exclusive_item_id: locationExclusiveItemId || undefined,

                // Pre-calculated item information
                p_item_name: selectedMenuItem.name,
                p_item_description: selectedMenuItem.description || undefined,
                p_category_name: selectedCategoryName || "Uncategorized",

                // Pre-calculated prices
                p_unit_price: selectedMenuItem.effective_price,
                p_cash_price: selectedMenuItem.effective_cash_price || undefined,
                p_use_cash_price: useCashPrice,

                // Quantity
                p_quantity: parseInt(quantity) || 1,

                // Size information (pre-calculated)
                p_selected_size_id: selectedSizeId || undefined,
                p_selected_size_name: selectedSizeName || undefined,
                p_size_price_modifier: sizePriceModifier || undefined,

                // Instructions
                p_special_instructions: itemSpecialInstructions || undefined,

                // Modifiers (pre-calculated prices)
                p_modifiers:
                    convertedModifiers.length > 0 ? convertedModifiers : undefined,
            };

            addLog("Add Item", params);

            const result = await callRPC("add_order_item", params);

            addLog("Add Item", params, result);
            show({
                title: "Success",
                message: "Item added to order",
                type: "success",
            });
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to add item";
            addLog("Add Item", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, addItem: false }));
        }
    };

    // Calculate Tax
    const handleCalculateTax = async () => {
        if (!currentOrderId) {
            show({
                title: "Error",
                message: "Please create an order first.",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, calculateTax: true }));

        try {
            const taxRateNum = parseFloat(taxRate) || 0.0825;
            const params = {
                p_order_id: currentOrderId,
                p_tax_rate: taxRateNum,
            };

            addLog("Calculate Tax", params);

            const result = await callRPC("calculate_order_tax", params);

            addLog("Calculate Tax", params, result);
            show({
                title: "Success",
                message: "Tax calculated",
                type: "success",
            });
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to calculate tax";
            addLog("Calculate Tax", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, calculateTax: false }));
        }
    };

    // Update Status
    const handleUpdateStatus = async () => {
        if (!currentOrderId) {
            show({
                title: "Error",
                message: "Please create an order first.",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, updateStatus: true }));

        try {
            const params = {
                p_order_id: currentOrderId,
                p_new_status: orderStatus,
                p_reason: undefined,
            };

            addLog("Update Status", params);

            const result = await callRPC("update_order_status", params);

            addLog("Update Status", params, result);
            show({
                title: "Success",
                message: `Order status updated to ${orderStatus}`,
                type: "success",
            });
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to update status";
            addLog("Update Status", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, updateStatus: false }));
        }
    };

    // Process Payment
    const handleProcessPayment = async () => {
        console.log(paymentMethod);
        if (!currentOrderId) {
            show({
                title: "Error",
                message: "Please create an order first.",
                type: "error",
            });
            return;
        }

        if (!amount) {
            show({
                title: "Error",
                message: "Please enter payment amount",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, processPayment: true }));

        try {
            const params: ProcessPaymentParams = {
                p_order_id: currentOrderId,
                p_payment_method: paymentMethod,
                p_amount: parseFloat(amount),
                p_tip_amount: parseFloat(tipAmount) || undefined,
                p_terminal_type: terminalType !== "none" ? terminalType : undefined,
                p_terminal_id: terminalId || undefined,
                p_device_id: deviceId || undefined,
            };

            addLog("Process Payment", params);

            const result = await callRPC("process_payment", params);
            addLog("Process Payment", params, result);
            show({
                title: "Success",
                message: "Payment processed",
                type: "success",
            });
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to process payment";
            addLog("Process Payment", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, processPayment: false }));
        }
    };

    // ==========================================================================
    // ORDER ITEM CRUD OPERATIONS
    // ==========================================================================

    // Get All Order Items
    const handleGetOrderItems = async () => {
        if (!currentOrderId) {
            show({
                title: "Error",
                message: "Please create an order first.",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, getOrderItems: true }));

        try {
            const { data, error } = await supabase
                .from("order_items")
                .select("*")
                .eq("order_id", currentOrderId)
                .eq("is_voided", false)
                .order("created_at");

            if (error) throw error;

            setOrderItemsList(data || []);
            addLog("Get Order Items", { order_id: currentOrderId }, data);
            show({
                title: "Success",
                message: `Found ${data?.length || 0} items`,
                type: "success",
            });
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to get order items";
            addLog("Get Order Items", { order_id: currentOrderId }, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, getOrderItems: false }));
        }
    };

    // Get Single Order Item with Modifiers
    const handleGetOrderItem = async () => {
        if (!selectedOrderItemId) {
            show({
                title: "Error",
                message: "Please select an order item first.",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, getOrderItem: true }));

        try {
            const params = {
                p_order_item_id: selectedOrderItemId,
            };

            addLog("Get Order Item", params);

            const result = await callRPC("get_order_item", params);

            if (result?.item) {
                const orderItemWithModifiers: OrderItemWithModifiers = {
                    ...result.item,
                    modifiers: result.modifiers || [],
                };

                setSelectedOrderItem(orderItemWithModifiers);

                // Find the corresponding menu item
                if (orderItemWithModifiers.menu_item_id) {
                    const menuItemWithCategory = menuItemsFromSync.find(
                        (mi) => mi.menu_item.id === orderItemWithModifiers.menu_item_id
                    );

                    if (menuItemWithCategory) {
                        setSelectedOrderItemMenuItem(menuItemWithCategory.menu_item);

                        // Map current modifiers to selection state
                        const mappedSelections = mapOrderItemModifiersToSelections(
                            orderItemWithModifiers,
                            menuItemWithCategory.menu_item
                        );
                        setReplaceModifierSelections(mappedSelections);

                        // Expand all modifier groups by default
                        const expanded: Record<string, boolean> = {};
                        menuItemWithCategory.menu_item.modifier_groups.forEach((group) => {
                            expanded[group.id] = true;
                        });
                        setExpandedReplaceModifierGroups(expanded);
                    } else {
                        setSelectedOrderItemMenuItem(null);
                        setReplaceModifierSelections({});
                        show({
                            title: "Warning",
                            message: "Menu item not found for this order item. Modifier replacement may not work.",
                            type: "error",
                        });
                    }
                } else {
                    setSelectedOrderItemMenuItem(null);
                    setReplaceModifierSelections({});
                }

                addLog("Get Order Item", params, result);
                show({
                    title: "Success",
                    message: "Item details retrieved",
                    type: "success",
                });
            } else {
                throw new Error("No item data in response");
            }
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to get order item";
            addLog("Get Order Item", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, getOrderItem: false }));
        }
    };

    // Update Item Quantity
    const handleUpdateQuantity = async () => {
        if (!selectedOrderItemId) {
            show({
                title: "Error",
                message: "Please select an order item first.",
                type: "error",
            });
            return;
        }

        if (!itemQuantity || parseInt(itemQuantity) < 1) {
            show({
                title: "Error",
                message: "Please enter a valid quantity (>= 1)",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, updateQuantity: true }));

        try {
            const params = {
                p_order_item_id: selectedOrderItemId,
                p_quantity: parseInt(itemQuantity),
            };

            addLog("Update Item Quantity", params);

            const result = await callRPC("update_order_item_quantity", params);

            addLog("Update Item Quantity", params, result);
            show({
                title: "Success",
                message: `Quantity updated. New subtotal: $${result?.new_subtotal?.toFixed(2) || "N/A"}`,
                type: "success",
            });

            // Refresh items list
            if (currentOrderId) {
                await handleGetOrderItems();
            }
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to update quantity";
            addLog("Update Item Quantity", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, updateQuantity: false }));
        }
    };

    // Update Item
    const handleUpdateItem = async () => {
        if (!selectedOrderItemId) {
            show({
                title: "Error",
                message: "Please select an order item first.",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, updateItem: true }));

        try {
            const params: any = {
                p_order_item_id: selectedOrderItemId,
            };

            if (itemQuantity) {
                params.p_quantity = parseInt(itemQuantity);
            }
            if (itemCrudSpecialInstructions) {
                params.p_special_instructions = itemCrudSpecialInstructions;
            }
            if (itemPrepStation) {
                params.p_prep_station = itemPrepStation;
            }
            if (itemCourseNumber) {
                params.p_course_number = parseInt(itemCourseNumber);
            }
            if (itemPriceOverride) {
                params.p_price_override = parseFloat(itemPriceOverride);
            }

            addLog("Update Item", params);

            const result = await callRPC("update_order_item", params);

            addLog("Update Item", params, result);
            show({
                title: "Success",
                message: "Item updated successfully",
                type: "success",
            });

            // Refresh items list
            if (currentOrderId) {
                await handleGetOrderItems();
            }
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to update item";
            addLog("Update Item", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, updateItem: false }));
        }
    };

    // Replace Modifiers
    const handleReplaceModifiers = async () => {
        if (!selectedOrderItemId) {
            show({
                title: "Error",
                message: "Please select an order item first.",
                type: "error",
            });
            return;
        }

        if (!selectedOrderItemMenuItem) {
            show({
                title: "Error",
                message: "Menu item not loaded. Please get item details first.",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, replaceModifiers: true }));

        try {
            // Convert modifier selections to params format
            const convertedModifiers: Array<{
                modifier_group_id: string;
                modifier_item_id: string;
                modifier_group_name: string;
                modifier_name: string;
                price_modifier: number;
                quantity?: number;
            }> = [];

            Object.entries(replaceModifierSelections).forEach(([groupId, items]) => {
                const group = selectedOrderItemMenuItem.modifier_groups.find((g) => g.id === groupId);
                if (!group) return;

                Object.entries(items).forEach(([itemId, selection]) => {
                    if (selection.selected) {
                        const modifierItem = group.items.find((item) => item.id === itemId);
                        if (modifierItem) {
                            convertedModifiers.push({
                                modifier_group_id: groupId,
                                modifier_item_id: itemId,
                                modifier_group_name: group.name,
                                modifier_name: modifierItem.name,
                                price_modifier: modifierItem.price_modifier,
                                quantity: selection.quantity > 1 ? selection.quantity : undefined,
                            });
                        }
                    }
                });
            });

            const params = {
                p_order_item_id: selectedOrderItemId,
                p_modifiers: convertedModifiers,
            };

            addLog("Replace Modifiers", params);

            const result = await callRPC("replace_order_item_modifiers", params);

            addLog("Replace Modifiers", params, result);
            show({
                title: "Success",
                message: "Modifiers replaced successfully",
                type: "success",
            });

            // Refresh items list and item details
            if (currentOrderId) {
                await handleGetOrderItems();
                // Refresh the selected item details
                if (selectedOrderItemId) {
                    await handleGetOrderItem();
                }
            }
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to replace modifiers";
            addLog("Replace Modifiers", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, replaceModifiers: false }));
        }
    };

    // Add Modifier
    const handleAddModifier = async () => {
        if (!selectedOrderItemId) {
            show({
                title: "Error",
                message: "Please select an order item first.",
                type: "error",
            });
            return;
        }

        if (!selectedModifierForAdd) {
            show({
                title: "Error",
                message: "Please select a modifier to add.",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, addModifier: true }));

        try {
            const params = {
                p_order_item_id: selectedOrderItemId,
                p_modifier_group_id: selectedModifierForAdd.modifierGroupId,
                p_modifier_item_id: selectedModifierForAdd.modifierItemId,
                p_modifier_group_name: selectedModifierForAdd.modifierGroupName,
                p_modifier_name: selectedModifierForAdd.modifierName,
                p_price_modifier: selectedModifierForAdd.priceModifier,
                p_quantity: selectedModifierForAdd.quantity || 1,
            };

            addLog("Add Modifier", params);

            const result = await callRPC("add_order_item_modifier", params);

            addLog("Add Modifier", params, result);
            show({
                title: "Success",
                message: `Modifier added. Modifier ID: ${result?.modifier_id || "N/A"}`,
                type: "success",
            });

            // Refresh items list
            if (currentOrderId) {
                await handleGetOrderItems();
            }
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to add modifier";
            addLog("Add Modifier", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, addModifier: false }));
        }
    };

    // Remove Modifier
    const handleRemoveModifier = async () => {
        if (!modifierIdToRemove) {
            show({
                title: "Error",
                message: "Please select a modifier to remove.",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, removeModifier: true }));

        try {
            const params = {
                p_modifier_id: modifierIdToRemove,
            };

            addLog("Remove Modifier", params);

            const result = await callRPC("remove_order_item_modifier", params);

            addLog("Remove Modifier", params, result);
            show({
                title: "Success",
                message: "Modifier removed successfully",
                type: "success",
            });

            // Refresh items list
            if (currentOrderId) {
                await handleGetOrderItems();
            }
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to remove modifier";
            addLog("Remove Modifier", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, removeModifier: false }));
        }
    };

    // Void Item
    const handleVoidItem = async () => {
        if (!selectedOrderItemId) {
            show({
                title: "Error",
                message: "Please select an order item first.",
                type: "error",
            });
            return;
        }

        if (!voidReason) {
            show({
                title: "Error",
                message: "Please enter a void reason.",
                type: "error",
            });
            return;
        }

        Alert.alert(
            "Confirm Void Item",
            `Are you sure you want to void this item?\n\nReason: ${voidReason}`,
            [
                {
                    text: "Cancel",
                    style: "cancel",
                },
                {
                    text: "Void",
                    style: "destructive",
                    onPress: async () => {
                        setLoading((prev) => ({ ...prev, voidItem: true }));

                        try {
                            const params = {
                                p_order_item_id: selectedOrderItemId,
                                p_void_reason: voidReason,
                            };

                            addLog("Void Item", params);

                            const result = await callRPC("void_order_item", params);

                            addLog("Void Item", params, result);
                            show({
                                title: "Success",
                                message: "Item voided successfully",
                                type: "success",
                            });

                            // Clear selection and refresh items list
                            setSelectedOrderItemId(null);
                            setSelectedOrderItem(null);
                            if (currentOrderId) {
                                await handleGetOrderItems();
                            }
                        } catch (error: any) {
                            const errorMessage = error?.message || "Failed to void item";
                            addLog("Void Item", undefined, undefined, errorMessage);
                            show({
                                title: "Error",
                                message: errorMessage,
                                type: "error",
                            });
                        } finally {
                            setLoading((prev) => ({ ...prev, voidItem: false }));
                        }
                    },
                },
            ],
            { userInterfaceStyle: "dark" }
        );
    };

    // Duplicate Item
    const handleDuplicateItem = async () => {
        if (!selectedOrderItemId) {
            show({
                title: "Error",
                message: "Please select an order item first.",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, duplicateItem: true }));

        try {
            const params: any = {
                p_order_item_id: selectedOrderItemId,
            };

            if (duplicateQuantity) {
                params.p_quantity = parseInt(duplicateQuantity);
            }

            addLog("Duplicate Item", params);

            const result = await callRPC("duplicate_order_item", params);

            addLog("Duplicate Item", params, result);
            show({
                title: "Success",
                message: `Item duplicated. New Item ID: ${result?.new_item_id || "N/A"}`,
                type: "success",
            });

            // Refresh items list
            if (currentOrderId) {
                await handleGetOrderItems();
            }
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to duplicate item";
            addLog("Duplicate Item", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, duplicateItem: false }));
        }
    };

    // Complete Flow
    const handleCompleteFlow = async () => {
        if (!selectedStore) {
            show({
                title: "Error",
                message: "No store selected. Please select a store in settings.",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, completeFlow: true }));

        try {
            let orderId: string | null = null;

            // 1. Create Order
            try {
                const createParams: CreateOrderParams = {
                    p_merchant_id: selectedStore.merchant_id,
                    p_location_id: selectedStore.id,
                    p_order_type: orderType,
                    p_table_number: tableNumber || undefined,
                    p_customer_name: customerName || undefined,
                    p_customer_phone: customerPhone || undefined,
                    p_special_instructions: orderSpecialInstructions || undefined,
                };

                addLog("Create Order (Complete Flow)", createParams);
                const createResult = await callRPC("create_order", createParams);

                if (createResult?.order_id) {
                    orderId = createResult.order_id;
                    setCurrentOrderId(orderId);
                    addLog("Create Order (Complete Flow)", createParams, createResult);
                } else {
                    throw new Error("No order_id in response");
                }
            } catch (error: any) {
                const errorMessage = error?.message || "Failed to create order";
                addLog(
                    "Create Order (Complete Flow)",
                    undefined,
                    undefined,
                    errorMessage
                );
                throw new Error(errorMessage);
            }

            if (!orderId) {
                throw new Error("Order ID not available");
            }

            // 2. Add Item (if menu_item_id is provided)
            if ((menuItemId || locationExclusiveItemId) && selectedMenuItem) {
                try {
                    const convertedModifiers = convertModifiersToParams();
                    const addItemParams: AddOrderItemParams = {
                        p_order_id: orderId,
                        p_menu_item_id: menuItemId || undefined,
                        p_location_exclusive_item_id: locationExclusiveItemId || undefined,

                        // Pre-calculated item information
                        p_item_name: selectedMenuItem.name,
                        p_item_description: selectedMenuItem.description || undefined,
                        p_category_name: selectedCategoryName || "Uncategorized",

                        // Pre-calculated prices
                        p_unit_price: selectedMenuItem.effective_price,
                        p_cash_price: selectedMenuItem.effective_cash_price || undefined,
                        p_use_cash_price: useCashPrice,

                        // Quantity
                        p_quantity: parseInt(quantity) || 1,

                        // Size information (pre-calculated)
                        p_selected_size_id: selectedSizeId || undefined,
                        p_selected_size_name: selectedSizeName || undefined,
                        p_size_price_modifier: sizePriceModifier || undefined,

                        // Instructions
                        p_special_instructions: itemSpecialInstructions || undefined,

                        // Modifiers (pre-calculated prices)
                        p_modifiers:
                            convertedModifiers.length > 0 ? convertedModifiers : undefined,
                    };

                    addLog("Add Item (Complete Flow)", addItemParams);
                    const addItemResult = await callRPC("add_order_item", addItemParams);
                    addLog("Add Item (Complete Flow)", addItemParams, addItemResult);
                } catch (error: any) {
                    const errorMessage = error?.message || "Failed to add item";
                    addLog(
                        "Add Item (Complete Flow)",
                        undefined,
                        undefined,
                        errorMessage
                    );
                    // Continue with flow even if add item fails
                }
            }

            // 3. Calculate Tax
            try {
                const taxRateNum = parseFloat(taxRate) || 0.0825;
                const taxParams = {
                    p_order_id: orderId,
                    p_tax_rate: taxRateNum,
                };

                addLog("Calculate Tax (Complete Flow)", taxParams);
                const taxResult = await callRPC("calculate_order_tax", taxParams);
                addLog("Calculate Tax (Complete Flow)", taxParams, taxResult);
            } catch (error: any) {
                const errorMessage = error?.message || "Failed to calculate tax";
                addLog(
                    "Calculate Tax (Complete Flow)",
                    undefined,
                    undefined,
                    errorMessage
                );
                // Continue with flow even if tax calculation fails
            }

            // 4. Update Status
            try {
                const statusParams = {
                    p_order_id: orderId,
                    p_new_status: orderStatus,
                    p_reason: undefined,
                };

                addLog("Update Status (Complete Flow)", statusParams);
                const statusResult = await callRPC("update_order_status", statusParams);
                addLog("Update Status (Complete Flow)", statusParams, statusResult);
            } catch (error: any) {
                const errorMessage = error?.message || "Failed to update status";
                addLog(
                    "Update Status (Complete Flow)",
                    undefined,
                    undefined,
                    errorMessage
                );
                // Continue with flow even if status update fails
            }

            // 5. Process Payment
            if (amount) {
                try {
                    const paymentParams: ProcessPaymentParams = {
                        p_order_id: orderId,
                        p_payment_method: paymentMethod,
                        p_amount: parseFloat(amount),
                        p_tip_amount: parseFloat(tipAmount) || undefined,
                        p_terminal_type: terminalType !== "none" ? terminalType : undefined,
                        p_terminal_id: terminalId || undefined,
                        p_device_id: deviceId || undefined,
                    };

                    addLog("Process Payment (Complete Flow)", paymentParams);
                    const paymentResult = await callRPC("process_payment", paymentParams);
                    addLog(
                        "Process Payment (Complete Flow)",
                        paymentParams,
                        paymentResult
                    );
                } catch (error: any) {
                    const errorMessage = error?.message || "Failed to process payment";
                    addLog(
                        "Process Payment (Complete Flow)",
                        undefined,
                        undefined,
                        errorMessage
                    );
                    // Continue with flow even if payment fails
                }
            }

            show({
                title: "Success",
                message: "Complete flow executed successfully",
                type: "success",
            });
        } catch (error: any) {
            show({
                title: "Error",
                message: error?.message || "Complete flow failed",
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, completeFlow: false }));
        }
    };

    // Clear Logs
    const handleClearLogs = () => {
        setLogs([]);
        show({
            title: "Logs Cleared",
            message: "All test logs have been cleared",
            type: "success",
        });
    };

    // Reset Form
    const handleResetForm = () => {
        setOrderType("dine_in");
        setTableNumber("");
        setCustomerName("");
        setCustomerPhone("");
        setOrderSpecialInstructions("");
        setSelectedMenuItem(defaultMenuItem);
        setSelectedCategoryName(defaultCategoryName);
        setMenuItemId(defaultMenuItem?.id || "");
        setLocationExclusiveItemId("");
        setQuantity("1");
        setSelectedSizeId("");
        setSelectedSizeName("");
        setSizePriceModifier(0);
        setItemSpecialInstructions("");
        setUseCashPrice(true);
        setModifierSelections({});
        setExpandedModifierGroups({});
        setPaymentMethod("cash");
        setAmount("");
        setTipAmount("0");
        setTaxRate("0.0825");
        setTerminalType("none");
        setTerminalId("");
        setDeviceId("");
        setOrderStatus("pending");
        setCurrentOrderId(null);
        show({
            title: "Form Reset",
            message: "All fields have been reset to defaults",
            type: "success",
        });
    };

    // Copy Order ID
    const handleCopyOrderId = () => {
        if (!currentOrderId) {
            show({
                title: "Error",
                message: "No order ID to copy",
                type: "error",
            });
            return;
        }

        // Show alert with order ID that user can manually copy
        Alert.alert(
            "Order ID",
            currentOrderId,
            [
                {
                    text: "OK",
                    style: "default",
                },
            ],
            { userInterfaceStyle: "dark" }
        );
        show({
            title: "Order ID",
            message: "Order ID displayed above. You can manually copy it.",
            type: "success",
        });
    };

    return (
        <View className="flex-1 bg-[#212121]">
            <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
                {/* Header */}
                <View className="mb-4">
                    <View className="flex-row items-center justify-between mb-2">
                        <Text className="text-3xl font-bold text-white">
                            Order Test Interface
                        </Text>
                        <TouchableOpacity
                            onPress={() => {
                                if (typeof router !== "undefined" && router?.back) router.back();
                            }}
                            className="bg-gray-700 px-4 py-2 rounded-lg"
                        >
                            <Text className="text-white font-semibold">Back</Text>
                        </TouchableOpacity>
                    </View>
                    <Text className="text-gray-400 text-sm">
                        Test the complete order lifecycle with configurable parameters
                    </Text>
                </View>

                {/* Current Order Info */}
                {currentOrderId && (
                    <View className="bg-blue-900/20 border border-blue-600 rounded-lg p-4 mb-4">
                        <View className="flex-row items-center justify-between">
                            <View className="flex-1">
                                <Text className="text-blue-400 text-sm font-semibold mb-1">
                                    Current Order ID
                                </Text>
                                <Text className="text-white text-lg font-mono">
                                    {currentOrderId}
                                </Text>
                            </View>
                            <TouchableOpacity
                                onPress={handleCopyOrderId}
                                className="bg-blue-600 px-4 py-2 rounded-lg flex-row items-center gap-2"
                            >
                                <Copy size={16} color="white" />
                                <Text className="text-white font-semibold">Copy</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {/* Order Configuration Section */}
                <Accordion type="single" collapsible className="mb-4">
                    <AccordionItem value="order-config">
                        <AccordionTrigger className="py-3">
                            <Text className="text-xl font-bold text-white">
                                Order Configuration
                            </Text>
                        </AccordionTrigger>
                        <AccordionContent>
                            <View className="space-y-4">
                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Merchant ID
                                    </Text>
                                    <TextInput
                                        value={selectedStore?.merchant_id || "N/A"}
                                        editable={false}
                                        className="bg-[#303030] border border-gray-600 rounded-lg px-3 py-2 text-white"
                                    />
                                </View>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Location ID
                                    </Text>
                                    <TextInput
                                        value={selectedStore?.id || "N/A"}
                                        // editable={false}
                                        className="bg-[#303030] border border-gray-600 rounded-lg px-3 py-2 text-white"
                                    />
                                </View>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Order Type
                                    </Text>
                                    <Select
                                        value={{
                                            value: orderType,
                                            label:
                                                orderType.charAt(0).toUpperCase() +
                                                orderType.slice(1).replace("_", " "),
                                        }}
                                        onValueChange={(option) =>
                                            setOrderType(option?.value as OrderType)
                                        }
                                    >
                                        <SelectTrigger className="bg-[#303030] border-gray-600">
                                            <SelectValue
                                                placeholder="Select order type"
                                                className="text-white"
                                            />
                                        </SelectTrigger>
                                        <SelectContent className="bg-[#212121] border-gray-600">
                                            <SelectItem value="dine_in" label="Dine In" />
                                            <SelectItem value="takeout" label="Takeout" />
                                            <SelectItem value="delivery" label="Delivery" />
                                            <SelectItem value="online" label="Online" />
                                            <SelectItem value="catering" label="Catering" />
                                        </SelectContent>
                                    </Select>
                                </View>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Table Number (Optional)
                                    </Text>
                                    <Input
                                        value={tableNumber}
                                        onChangeText={setTableNumber}
                                        placeholder="e.g., 12"
                                        className="bg-[#303030] border-gray-600 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </View>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Customer Name (Optional)
                                    </Text>
                                    <Input
                                        value={customerName}
                                        onChangeText={setCustomerName}
                                        placeholder="John Doe"
                                        className="bg-[#303030] border-gray-600 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </View>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Customer Phone (Optional)
                                    </Text>
                                    <Input
                                        value={customerPhone}
                                        onChangeText={setCustomerPhone}
                                        placeholder="+1234567890"
                                        keyboardType="phone-pad"
                                        className="bg-[#303030] border-gray-600 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </View>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Special Instructions (Optional)
                                    </Text>
                                    <Input
                                        value={orderSpecialInstructions}
                                        onChangeText={setOrderSpecialInstructions}
                                        placeholder="Special instructions for the order"
                                        multiline
                                        numberOfLines={3}
                                        className="bg-[#303030] border-gray-600 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </View>
                            </View>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>

                {/* Item Configuration Section */}
                <Accordion type="single" collapsible className="mb-4">
                    <AccordionItem value="item-config">
                        <AccordionTrigger className="py-3">
                            <Text className="text-xl font-bold text-white">
                                Item Configuration
                            </Text>
                        </AccordionTrigger>
                        <AccordionContent>
                            <View className="space-y-4">
                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Menu Item
                                    </Text>
                                    {isLoadingMenu ? (
                                        <View className="bg-[#303030] border border-gray-600 rounded-lg px-3 py-2">
                                            <Text className="text-gray-400">
                                                Loading menu items...
                                            </Text>
                                        </View>
                                    ) : menuItemsFromSync.length > 0 ? (
                                        <Select
                                            value={
                                                selectedMenuItem
                                                    ? {
                                                        value: selectedMenuItem.id,
                                                        label: `${selectedMenuItem.name} - $${selectedMenuItem.effective_price.toFixed(2)}`,
                                                    }
                                                    : undefined
                                            }
                                            onValueChange={(option) => {
                                                const itemWithCategory = menuItemsFromSync.find(
                                                    (mi) => mi.menu_item.id === option?.value
                                                );
                                                if (itemWithCategory) {
                                                    setSelectedMenuItem(itemWithCategory.menu_item);
                                                    setSelectedCategoryName(
                                                        itemWithCategory.category_name
                                                    );
                                                } else {
                                                    setSelectedMenuItem(null);
                                                    setSelectedCategoryName("");
                                                }
                                            }}
                                        >
                                            <SelectTrigger className="bg-[#303030] border-gray-600">
                                                <SelectValue
                                                    placeholder="Select a menu item"
                                                    className="text-white"
                                                />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#212121] border-gray-600">
                                                {menuItemsFromSync.map((itemWithCategory) => (
                                                    <SelectItem
                                                        key={itemWithCategory.menu_item.id}
                                                        value={itemWithCategory.menu_item.id}
                                                        label={`${itemWithCategory.menu_item.name} - $${itemWithCategory.menu_item.effective_price.toFixed(2)}`}
                                                    />
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    ) : (
                                        <View className="bg-[#303030] border border-gray-600 rounded-lg px-3 py-2">
                                            <Text className="text-gray-400">
                                                No menu items available
                                            </Text>
                                        </View>
                                    )}
                                </View>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Menu Item ID (Manual Override)
                                    </Text>
                                    <Input
                                        value={menuItemId}
                                        onChangeText={setMenuItemId}
                                        placeholder="Enter menu item ID manually"
                                        className="bg-[#303030] border-gray-600 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                    <Text className="text-xs text-gray-500 mt-1">
                                        Current: {menuItemId || "None"}
                                    </Text>
                                </View>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Location Exclusive Item ID (Optional)
                                    </Text>
                                    <Input
                                        value={locationExclusiveItemId}
                                        onChangeText={setLocationExclusiveItemId}
                                        placeholder="Enter location exclusive item ID"
                                        className="bg-[#303030] border-gray-600 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </View>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Quantity
                                    </Text>
                                    <Input
                                        value={quantity}
                                        onChangeText={setQuantity}
                                        placeholder="1"
                                        keyboardType="numeric"
                                        className="bg-[#303030] border-gray-600 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </View>

                                {selectedMenuItem && selectedMenuItem.effective_cash_price && (
                                    <View className="flex-row items-center gap-3 p-3 bg-[#1a1a1a] rounded-lg border border-gray-700">
                                        <Checkbox
                                            id="use-cash-price"
                                            checked={useCashPrice}
                                            onCheckedChange={setUseCashPrice}
                                            className="border-blue-400"
                                        />
                                        <View className="flex-1">
                                            <Text className="text-white text-sm font-medium">
                                                Use Cash Price
                                            </Text>
                                            <Text className="text-gray-400 text-xs">
                                                Card: ${selectedMenuItem.effective_price.toFixed(2)} |
                                                Cash: $
                                                {selectedMenuItem.effective_cash_price.toFixed(2)}
                                            </Text>
                                        </View>
                                    </View>
                                )}

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Selected Size ID (Optional)
                                    </Text>
                                    <Input
                                        value={selectedSizeId}
                                        onChangeText={setSelectedSizeId}
                                        placeholder="Enter size ID"
                                        className="bg-[#303030] border-gray-600 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </View>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Item Special Instructions (Optional)
                                    </Text>
                                    <Input
                                        value={itemSpecialInstructions}
                                        onChangeText={setItemSpecialInstructions}
                                        placeholder="Special instructions for this item"
                                        multiline
                                        numberOfLines={2}
                                        className="bg-[#303030] border-gray-600 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </View>

                                {selectedMenuItem &&
                                    selectedMenuItem.modifier_groups.length > 0 && (
                                        <View>
                                            <View className="flex-row items-center justify-between mb-3">
                                                <Text className="text-sm font-semibold text-gray-300">
                                                    Modifiers
                                                </Text>
                                                <TouchableOpacity
                                                    onPress={handleClearModifiers}
                                                    className="flex-row items-center gap-1 px-2 py-1 bg-red-900/30 border border-red-600 rounded"
                                                >
                                                    <Trash2 size={14} color="#ef4444" />
                                                    <Text className="text-red-400 text-xs">
                                                        Clear All
                                                    </Text>
                                                </TouchableOpacity>
                                            </View>

                                            {selectedMenuItem.modifier_groups.map((group) => {
                                                const isExpanded =
                                                    expandedModifierGroups[group.id] ?? true;
                                                const selections = modifierSelections[group.id] || {};
                                                const selectedCount = Object.values(selections).filter(
                                                    (sel) => sel.selected
                                                ).length;
                                                const isValidSelection =
                                                    (!group.is_required ||
                                                        selectedCount >= group.min_selections) &&
                                                    selectedCount <= group.max_selections &&
                                                    (selectedCount === 0 ||
                                                        selectedCount >= group.min_selections);

                                                return (
                                                    <View
                                                        key={group.id}
                                                        className={`mb-3 rounded-lg border ${isValidSelection
                                                            ? "bg-[#1a1a1a] border-gray-700"
                                                            : "bg-red-900/10 border-red-600"
                                                            }`}
                                                    >
                                                        {/* Group Header */}
                                                        <TouchableOpacity
                                                            onPress={() =>
                                                                setExpandedModifierGroups((prev) => ({
                                                                    ...prev,
                                                                    [group.id]: !isExpanded,
                                                                }))
                                                            }
                                                            className="flex-row items-center justify-between p-3"
                                                        >
                                                            <View className="flex-1">
                                                                <View className="flex-row items-center gap-2 mb-1">
                                                                    <Text className="text-white font-semibold">
                                                                        {group.name}
                                                                    </Text>
                                                                    {group.is_required && (
                                                                        <View className="bg-red-900/30 border border-red-500 px-2 py-0.5 rounded">
                                                                            <Text className="text-red-400 text-xs font-medium">
                                                                                Required
                                                                            </Text>
                                                                        </View>
                                                                    )}
                                                                    {!group.is_required && (
                                                                        <View className="bg-blue-900/30 border border-blue-500 px-2 py-0.5 rounded">
                                                                            <Text className="text-blue-400 text-xs font-medium">
                                                                                Optional
                                                                            </Text>
                                                                        </View>
                                                                    )}
                                                                </View>
                                                                <Text className="text-gray-400 text-xs">
                                                                    {group.max_selections === 1
                                                                        ? "Select 1 item"
                                                                        : `Select ${group.min_selections}-${group.max_selections} item(s)`}
                                                                    {selectedCount > 0 && (
                                                                        <Text className="text-green-400 ml-1">
                                                                            ({selectedCount} selected)
                                                                        </Text>
                                                                    )}
                                                                </Text>
                                                                {!isValidSelection && selectedCount > 0 && (
                                                                    <Text className="text-red-400 text-xs mt-1">
                                                                        {selectedCount < group.min_selections
                                                                            ? `Minimum ${group.min_selections} selection(s) required`
                                                                            : `Maximum ${group.max_selections} selection(s) allowed`}
                                                                    </Text>
                                                                )}
                                                            </View>
                                                            {isExpanded ? (
                                                                <ChevronUp size={20} color="#9ca3af" />
                                                            ) : (
                                                                <ChevronDown size={20} color="#9ca3af" />
                                                            )}
                                                        </TouchableOpacity>

                                                        {/* Modifier Items */}
                                                        {isExpanded && (
                                                            <View className="px-3 pb-3 border-t border-gray-700">
                                                                {group.items.map((modifierItem) => {
                                                                    const isSelected =
                                                                        selections[modifierItem.id]?.selected ||
                                                                        false;
                                                                    const modifierQuantity =
                                                                        selections[modifierItem.id]?.quantity || 1;
                                                                    const isMaxReached =
                                                                        group.max_selections > 1 &&
                                                                        selectedCount >= group.max_selections &&
                                                                        !isSelected;

                                                                    return (
                                                                        <View
                                                                            key={modifierItem.id}
                                                                            className={`flex-row items-center justify-between py-2 border-b border-gray-800 last:border-b-0 ${isSelected ? "bg-blue-900/10" : ""
                                                                                }`}
                                                                        >
                                                                            <View className="flex-row items-center gap-3 flex-1">
                                                                                <Checkbox
                                                                                    id={`modifier-${group.id}-${modifierItem.id}`}
                                                                                    checked={isSelected}
                                                                                    onCheckedChange={() =>
                                                                                        handleModifierToggle(
                                                                                            group.id,
                                                                                            modifierItem.id
                                                                                        )
                                                                                    }
                                                                                    disabled={isMaxReached}
                                                                                    className="border-blue-400"
                                                                                />
                                                                                <View className="flex-1">
                                                                                    <Text
                                                                                        className={`text-sm ${isSelected
                                                                                            ? "text-white font-medium"
                                                                                            : "text-gray-300"
                                                                                            }`}
                                                                                    >
                                                                                        {modifierItem.name}
                                                                                    </Text>
                                                                                    <Text className="text-gray-400 text-xs">
                                                                                        {modifierItem.price_modifier >= 0
                                                                                            ? `+$${modifierItem.price_modifier.toFixed(2)}`
                                                                                            : `$${modifierItem.price_modifier.toFixed(2)}`}
                                                                                    </Text>
                                                                                </View>
                                                                            </View>

                                                                            {/* Quantity Selector (only show if selected and multiple allowed) */}
                                                                            {isSelected &&
                                                                                group.max_selections > 1 && (
                                                                                    <View className="flex-row items-center gap-2">
                                                                                        <TouchableOpacity
                                                                                            onPress={() =>
                                                                                                handleModifierQuantityChange(
                                                                                                    group.id,
                                                                                                    modifierItem.id,
                                                                                                    -1
                                                                                                )
                                                                                            }
                                                                                            className="bg-gray-700 p-1 rounded"
                                                                                            disabled={modifierQuantity <= 1}
                                                                                        >
                                                                                            <Minus
                                                                                                size={16}
                                                                                                color={
                                                                                                    modifierQuantity <= 1
                                                                                                        ? "#6b7280"
                                                                                                        : "#ffffff"
                                                                                                }
                                                                                            />
                                                                                        </TouchableOpacity>
                                                                                        <Text className="text-white text-sm w-8 text-center">
                                                                                            {modifierQuantity}
                                                                                        </Text>
                                                                                        <TouchableOpacity
                                                                                            onPress={() =>
                                                                                                handleModifierQuantityChange(
                                                                                                    group.id,
                                                                                                    modifierItem.id,
                                                                                                    1
                                                                                                )
                                                                                            }
                                                                                            className="bg-gray-700 p-1 rounded"
                                                                                        >
                                                                                            <Plus size={16} color="#ffffff" />
                                                                                        </TouchableOpacity>
                                                                                    </View>
                                                                                )}
                                                                        </View>
                                                                    );
                                                                })}
                                                            </View>
                                                        )}
                                                    </View>
                                                );
                                            })}

                                            {/* Modifier Price Summary */}
                                            {Object.keys(modifierSelections).length > 0 && (
                                                <View className="mt-3 p-3 bg-green-900/20 border border-green-600 rounded-lg">
                                                    <Text className="text-green-400 text-sm font-semibold mb-1">
                                                        Modifier Price Impact
                                                    </Text>
                                                    <Text className="text-white text-lg font-bold">
                                                        {calculateModifierPriceImpact() >= 0 ? "+" : ""}$
                                                        {calculateModifierPriceImpact().toFixed(2)}
                                                    </Text>
                                                </View>
                                            )}
                                        </View>
                                    )}

                                {selectedMenuItem && (
                                    <View className="bg-blue-900/20 border border-blue-600 rounded-lg p-3">
                                        <Text className="text-blue-400 text-sm font-semibold mb-1">
                                            Selected Item Details
                                        </Text>
                                        <Text className="text-white text-sm">
                                            Name: {selectedMenuItem.name}
                                        </Text>
                                        {selectedCategoryName && (
                                            <Text className="text-white text-sm">
                                                Category: {selectedCategoryName}
                                            </Text>
                                        )}
                                        <Text className="text-white text-sm">
                                            Card Price: ${selectedMenuItem.effective_price.toFixed(2)}
                                        </Text>
                                        {selectedMenuItem.effective_cash_price && (
                                            <Text className="text-white text-sm">
                                                Cash Price: $
                                                {selectedMenuItem.effective_cash_price.toFixed(2)}
                                            </Text>
                                        )}
                                        <Text className="text-white text-sm">
                                            Price Used:{" "}
                                            {useCashPrice && selectedMenuItem.effective_cash_price
                                                ? "Cash"
                                                : "Card"}
                                        </Text>
                                        <Text className="text-white text-sm">
                                            Available:{" "}
                                            {selectedMenuItem.effective_availability ? "Yes" : "No"}
                                        </Text>
                                        {selectedMenuItem.description && (
                                            <Text className="text-gray-300 text-xs mt-1">
                                                {selectedMenuItem.description}
                                            </Text>
                                        )}
                                    </View>
                                )}
                            </View>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>

                {/* Order Item CRUD Operations Section */}
                <Accordion type="single" collapsible className="mb-4">
                    <AccordionItem value="item-crud">
                        <AccordionTrigger className="py-3">
                            <Text className="text-xl font-bold text-white">
                                Order Item CRUD Operations
                            </Text>
                        </AccordionTrigger>
                        <AccordionContent>
                            <View className="space-y-4">
                                {/* Fetch & Select Item */}
                                <View>
                                    <Text className="text-lg font-bold text-white mb-3">
                                        Fetch & Select Item
                                    </Text>

                                    <Button
                                        onPress={handleGetOrderItems}
                                        disabled={loading.getOrderItems || !currentOrderId}
                                        className="bg-blue-600 mb-3"
                                    >
                                        <Text className="text-white font-semibold">
                                            {loading.getOrderItems ? "Loading..." : "Get All Order Items"}
                                        </Text>
                                    </Button>

                                    {orderItemsList.length > 0 && (
                                        <View className="mb-3">
                                            <Text className="text-sm font-semibold text-gray-300 mb-2">
                                                Select Order Item ({orderItemsList.length} items)
                                            </Text>
                                            <Select
                                                value={
                                                    selectedOrderItemId
                                                        ? {
                                                            value: selectedOrderItemId,
                                                            label: orderItemsList.find(
                                                                (item) => item.id === selectedOrderItemId
                                                            )?.item_name || "Select item",
                                                        }
                                                        : undefined
                                                }
                                                onValueChange={(option) => {
                                                    setSelectedOrderItemId(option?.value || null);
                                                    const item = orderItemsList.find(
                                                        (i) => i.id === option?.value
                                                    );
                                                    if (item) {
                                                        setItemQuantity(item.quantity.toString());
                                                        setItemCrudSpecialInstructions(item.special_instructions || "");
                                                        const itemWithExtras = item as OrderItemWithModifiers;
                                                        setItemPrepStation(itemWithExtras.prep_station || "");
                                                        setItemCourseNumber(itemWithExtras.course_number?.toString() || "");
                                                    }
                                                }}
                                            >
                                                <SelectTrigger className="bg-[#303030] border-gray-600">
                                                    <SelectValue
                                                        placeholder="Select an order item"
                                                        className="text-white"
                                                    />
                                                </SelectTrigger>
                                                <SelectContent className="bg-[#212121] border-gray-600">
                                                    {orderItemsList.map((item) => (
                                                        <SelectItem
                                                            key={item.id}
                                                            value={item.id}
                                                            label={`${item.item_name} (Qty: ${item.quantity}, $${item.subtotal.toFixed(2)})`}
                                                        />
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </View>
                                    )}

                                    <Button
                                        onPress={handleGetOrderItem}
                                        disabled={loading.getOrderItem || !selectedOrderItemId}
                                        className="bg-purple-600"
                                    >
                                        <Text className="text-white font-semibold">
                                            {loading.getOrderItem ? "Loading..." : "Get Item Details"}
                                        </Text>
                                    </Button>

                                    {selectedOrderItem && (
                                        <View className="mt-3 p-3 bg-blue-900/20 border border-blue-600 rounded-lg">
                                            <Text className="text-blue-400 text-sm font-semibold mb-2">
                                                Item Details
                                            </Text>
                                            <Text className="text-white text-sm">
                                                Name: {selectedOrderItem.item_name}
                                            </Text>
                                            <Text className="text-white text-sm">
                                                Quantity: {selectedOrderItem.quantity}
                                            </Text>
                                            <Text className="text-white text-sm">
                                                Unit Price: ${selectedOrderItem.unit_price.toFixed(2)}
                                            </Text>
                                            <Text className="text-white text-sm">
                                                Price Paid: ${selectedOrderItem.price_paid.toFixed(2)}
                                            </Text>
                                            <Text className="text-white text-sm">
                                                Subtotal: ${selectedOrderItem.subtotal.toFixed(2)}
                                            </Text>
                                            {selectedOrderItem.special_instructions && (
                                                <Text className="text-white text-sm">
                                                    Instructions: {selectedOrderItem.special_instructions}
                                                </Text>
                                            )}
                                            {selectedOrderItem.modifiers && selectedOrderItem.modifiers.length > 0 && (
                                                <View className="mt-2">
                                                    <Text className="text-white text-sm font-semibold">
                                                        Modifiers ({selectedOrderItem.modifiers.length}):
                                                    </Text>
                                                    {selectedOrderItem.modifiers.map((mod: OrderItemModifier, idx: number) => (
                                                        <Text key={idx} className="text-gray-300 text-xs ml-2">
                                                            • {mod.modifier_name} (+${mod.price_modifier.toFixed(2)})
                                                        </Text>
                                                    ))}
                                                </View>
                                            )}
                                        </View>
                                    )}
                                </View>

                                {/* Update Quantity */}
                                <View className="border-t border-gray-700 pt-4">
                                    <Text className="text-lg font-bold text-white mb-3">
                                        Update Quantity
                                    </Text>
                                    <View className="mb-2">
                                        <Text className="text-sm font-semibold text-gray-300 mb-2">
                                            New Quantity
                                        </Text>
                                        <Input
                                            value={itemQuantity}
                                            onChangeText={setItemQuantity}
                                            placeholder="Enter quantity"
                                            keyboardType="numeric"
                                            className="bg-[#303030] border-gray-600 text-white"
                                            placeholderTextColor="#9CA3AF"
                                        />
                                    </View>
                                    <Button
                                        onPress={handleUpdateQuantity}
                                        disabled={loading.updateQuantity || !selectedOrderItemId}
                                        className="bg-green-600"
                                    >
                                        <Text className="text-white font-semibold">
                                            {loading.updateQuantity ? "Updating..." : "Update Quantity"}
                                        </Text>
                                    </Button>
                                </View>

                                {/* Update Item */}
                                <View className="border-t border-gray-700 pt-4">
                                    <Text className="text-lg font-bold text-white mb-3">
                                        Update Item
                                    </Text>
                                    <View className="mb-2">
                                        <Text className="text-sm font-semibold text-gray-300 mb-2">
                                            Special Instructions
                                        </Text>
                                        <Input
                                            value={itemCrudSpecialInstructions}
                                            onChangeText={setItemCrudSpecialInstructions}
                                            placeholder="Enter special instructions"
                                            multiline
                                            numberOfLines={2}
                                            className="bg-[#303030] border-gray-600 text-white"
                                            placeholderTextColor="#9CA3AF"
                                        />
                                    </View>
                                    <View className="mb-2">
                                        <Text className="text-sm font-semibold text-gray-300 mb-2">
                                            Prep Station
                                        </Text>
                                        <Input
                                            value={itemPrepStation}
                                            onChangeText={setItemPrepStation}
                                            placeholder="Enter prep station"
                                            className="bg-[#303030] border-gray-600 text-white"
                                            placeholderTextColor="#9CA3AF"
                                        />
                                    </View>
                                    <View className="mb-2">
                                        <Text className="text-sm font-semibold text-gray-300 mb-2">
                                            Course Number
                                        </Text>
                                        <Input
                                            value={itemCourseNumber}
                                            onChangeText={setItemCourseNumber}
                                            placeholder="Enter course number"
                                            keyboardType="numeric"
                                            className="bg-[#303030] border-gray-600 text-white"
                                            placeholderTextColor="#9CA3AF"
                                        />
                                    </View>
                                    <View className="mb-2">
                                        <Text className="text-sm font-semibold text-gray-300 mb-2">
                                            Price Override (Manager Only)
                                        </Text>
                                        <Input
                                            value={itemPriceOverride}
                                            onChangeText={setItemPriceOverride}
                                            placeholder="Enter price override"
                                            keyboardType="decimal-pad"
                                            className="bg-[#303030] border-gray-600 text-white"
                                            placeholderTextColor="#9CA3AF"
                                        />
                                    </View>
                                    <Button
                                        onPress={handleUpdateItem}
                                        disabled={loading.updateItem || !selectedOrderItemId}
                                        className="bg-orange-600"
                                    >
                                        <Text className="text-white font-semibold">
                                            {loading.updateItem ? "Updating..." : "Update Item"}
                                        </Text>
                                    </Button>
                                </View>

                                {/* Modifier Operations */}
                                <View className="border-t border-gray-700 pt-4">
                                    <Text className="text-lg font-bold text-white mb-3">
                                        Modifier Operations
                                    </Text>

                                    {/* Replace All Modifiers */}
                                    <View className="mb-4">
                                        <View className="flex-row items-center justify-between mb-3">
                                            <Text className="text-md font-semibold text-gray-300">
                                                Replace All Modifiers
                                            </Text>
                                            {selectedOrderItemMenuItem && (
                                                <TouchableOpacity
                                                    onPress={handleClearReplaceModifiers}
                                                    className="flex-row items-center gap-1 px-2 py-1 bg-red-900/30 border border-red-600 rounded"
                                                >
                                                    <Trash2 size={14} color="#ef4444" />
                                                    <Text className="text-red-400 text-xs">
                                                        Clear All
                                                    </Text>
                                                </TouchableOpacity>
                                            )}
                                        </View>

                                        {selectedOrderItemMenuItem && selectedOrderItemMenuItem.modifier_groups.length > 0 ? (
                                            <>
                                                <Text className="text-xs text-gray-400 mb-3">
                                                    Current modifiers are pre-selected. Edit selections below, then click Replace.
                                                </Text>

                                                {selectedOrderItemMenuItem.modifier_groups.map((group) => {
                                                    const isExpanded =
                                                        expandedReplaceModifierGroups[group.id] ?? true;
                                                    const selections = replaceModifierSelections[group.id] || {};
                                                    const selectedCount = Object.values(selections).filter(
                                                        (sel) => sel.selected
                                                    ).length;
                                                    const isValidSelection =
                                                        (!group.is_required ||
                                                            selectedCount >= group.min_selections) &&
                                                        selectedCount <= group.max_selections &&
                                                        (selectedCount === 0 ||
                                                            selectedCount >= group.min_selections);

                                                    return (
                                                        <View
                                                            key={group.id}
                                                            className={`mb-3 rounded-lg border ${isValidSelection
                                                                ? "bg-[#1a1a1a] border-gray-700"
                                                                : "bg-red-900/10 border-red-600"
                                                                }`}
                                                        >
                                                            {/* Group Header */}
                                                            <TouchableOpacity
                                                                onPress={() =>
                                                                    setExpandedReplaceModifierGroups((prev) => ({
                                                                        ...prev,
                                                                        [group.id]: !isExpanded,
                                                                    }))
                                                                }
                                                                className="flex-row items-center justify-between p-3"
                                                            >
                                                                <View className="flex-1">
                                                                    <View className="flex-row items-center gap-2 mb-1">
                                                                        <Text className="text-white font-semibold">
                                                                            {group.name}
                                                                        </Text>
                                                                        {group.is_required && (
                                                                            <View className="bg-red-900/30 border border-red-500 px-2 py-0.5 rounded">
                                                                                <Text className="text-red-400 text-xs font-medium">
                                                                                    Required
                                                                                </Text>
                                                                            </View>
                                                                        )}
                                                                        {!group.is_required && (
                                                                            <View className="bg-blue-900/30 border border-blue-500 px-2 py-0.5 rounded">
                                                                                <Text className="text-blue-400 text-xs font-medium">
                                                                                    Optional
                                                                                </Text>
                                                                            </View>
                                                                        )}
                                                                    </View>
                                                                    <Text className="text-gray-400 text-xs">
                                                                        {group.max_selections === 1
                                                                            ? "Select 1 item"
                                                                            : `Select ${group.min_selections}-${group.max_selections} item(s)`}
                                                                        {selectedCount > 0 && (
                                                                            <Text className="text-green-400 ml-1">
                                                                                ({selectedCount} selected)
                                                                            </Text>
                                                                        )}
                                                                    </Text>
                                                                    {!isValidSelection && selectedCount > 0 && (
                                                                        <Text className="text-red-400 text-xs mt-1">
                                                                            {selectedCount < group.min_selections
                                                                                ? `Minimum ${group.min_selections} selection(s) required`
                                                                                : `Maximum ${group.max_selections} selection(s) allowed`}
                                                                        </Text>
                                                                    )}
                                                                </View>
                                                                {isExpanded ? (
                                                                    <ChevronUp size={20} color="#9ca3af" />
                                                                ) : (
                                                                    <ChevronDown size={20} color="#9ca3af" />
                                                                )}
                                                            </TouchableOpacity>

                                                            {/* Modifier Items */}
                                                            {isExpanded && (
                                                                <View className="px-3 pb-3 border-t border-gray-700">
                                                                    {group.items.map((modifierItem) => {
                                                                        const isSelected =
                                                                            selections[modifierItem.id]?.selected ||
                                                                            false;
                                                                        const modifierQuantity =
                                                                            selections[modifierItem.id]?.quantity || 1;
                                                                        const isMaxReached =
                                                                            group.max_selections > 1 &&
                                                                            selectedCount >= group.max_selections &&
                                                                            !isSelected;

                                                                        return (
                                                                            <View
                                                                                key={modifierItem.id}
                                                                                className={`flex-row items-center justify-between py-2 border-b border-gray-800 last:border-b-0 ${isSelected ? "bg-blue-900/10" : ""
                                                                                    }`}
                                                                            >
                                                                                <View className="flex-row items-center gap-3 flex-1">
                                                                                    <Checkbox
                                                                                        id={`replace-modifier-${group.id}-${modifierItem.id}`}
                                                                                        checked={isSelected}
                                                                                        onCheckedChange={() =>
                                                                                            handleReplaceModifierToggle(
                                                                                                group.id,
                                                                                                modifierItem.id
                                                                                            )
                                                                                        }
                                                                                        disabled={isMaxReached}
                                                                                        className="border-blue-400"
                                                                                    />
                                                                                    <View className="flex-1">
                                                                                        <Text
                                                                                            className={`text-sm ${isSelected
                                                                                                ? "text-white font-medium"
                                                                                                : "text-gray-300"
                                                                                                }`}
                                                                                        >
                                                                                            {modifierItem.name}
                                                                                        </Text>
                                                                                        <Text className="text-gray-400 text-xs">
                                                                                            {modifierItem.price_modifier >= 0
                                                                                                ? `+$${modifierItem.price_modifier.toFixed(2)}`
                                                                                                : `$${modifierItem.price_modifier.toFixed(2)}`}
                                                                                        </Text>
                                                                                    </View>
                                                                                </View>

                                                                                {/* Quantity Selector (only show if selected and multiple allowed) */}
                                                                                {isSelected &&
                                                                                    group.max_selections > 1 && (
                                                                                        <View className="flex-row items-center gap-2">
                                                                                            <TouchableOpacity
                                                                                                onPress={() =>
                                                                                                    handleReplaceModifierQuantityChange(
                                                                                                        group.id,
                                                                                                        modifierItem.id,
                                                                                                        -1
                                                                                                    )
                                                                                                }
                                                                                                className="bg-gray-700 p-1 rounded"
                                                                                                disabled={modifierQuantity <= 1}
                                                                                            >
                                                                                                <Minus
                                                                                                    size={16}
                                                                                                    color={
                                                                                                        modifierQuantity <= 1
                                                                                                            ? "#6b7280"
                                                                                                            : "#ffffff"
                                                                                                    }
                                                                                                />
                                                                                            </TouchableOpacity>
                                                                                            <Text className="text-white text-sm w-8 text-center">
                                                                                                {modifierQuantity}
                                                                                            </Text>
                                                                                            <TouchableOpacity
                                                                                                onPress={() =>
                                                                                                    handleReplaceModifierQuantityChange(
                                                                                                        group.id,
                                                                                                        modifierItem.id,
                                                                                                        1
                                                                                                    )
                                                                                                }
                                                                                                className="bg-gray-700 p-1 rounded"
                                                                                            >
                                                                                                <Plus size={16} color="#ffffff" />
                                                                                            </TouchableOpacity>
                                                                                        </View>
                                                                                    )}
                                                                            </View>
                                                                        );
                                                                    })}
                                                                </View>
                                                            )}
                                                        </View>
                                                    );
                                                })}

                                                <Button
                                                    onPress={handleReplaceModifiers}
                                                    disabled={loading.replaceModifiers || !selectedOrderItemId || !selectedOrderItemMenuItem}
                                                    className="bg-indigo-600 mt-3"
                                                >
                                                    <Text className="text-white font-semibold">
                                                        {loading.replaceModifiers ? "Replacing..." : "Replace Modifiers"}
                                                    </Text>
                                                </Button>
                                            </>
                                        ) : (
                                            <Text className="text-gray-400 text-sm">
                                                {!selectedOrderItemMenuItem
                                                    ? "Get item details first to load modifier options."
                                                    : "No modifiers available for this menu item."}
                                            </Text>
                                        )}
                                    </View>

                                    {/* Add Modifier */}
                                    <View className="mb-4">
                                        <Text className="text-md font-semibold text-gray-300 mb-2">
                                            Add Modifier
                                        </Text>
                                        {selectedMenuItem && selectedMenuItem.modifier_groups.length > 0 ? (
                                            <>
                                                <View className="mb-2">
                                                    <Text className="text-xs text-gray-400 mb-2">
                                                        Select modifier group and item
                                                    </Text>
                                                    {selectedMenuItem.modifier_groups.map((group) => (
                                                        <View key={group.id} className="mb-2">
                                                            <Text className="text-sm text-white font-medium mb-1">
                                                                {group.name}
                                                            </Text>
                                                            {group.items.map((modifierItem) => (
                                                                <TouchableOpacity
                                                                    key={modifierItem.id}
                                                                    onPress={() => {
                                                                        setSelectedModifierForAdd({
                                                                            modifierGroupId: group.id,
                                                                            modifierItemId: modifierItem.id,
                                                                            modifierGroupName: group.name,
                                                                            modifierName: modifierItem.name,
                                                                            priceModifier: modifierItem.price_modifier,
                                                                            quantity: 1,
                                                                        });
                                                                    }}
                                                                    className={`p-2 mb-1 rounded border ${selectedModifierForAdd?.modifierItemId === modifierItem.id
                                                                        ? "bg-blue-900/30 border-blue-500"
                                                                        : "bg-[#1a1a1a] border-gray-700"
                                                                        }`}
                                                                >
                                                                    <Text className="text-white text-sm">
                                                                        {modifierItem.name} (+${modifierItem.price_modifier.toFixed(2)})
                                                                    </Text>
                                                                </TouchableOpacity>
                                                            ))}
                                                        </View>
                                                    ))}
                                                </View>
                                                {selectedModifierForAdd && (
                                                    <View className="mb-2">
                                                        <Text className="text-sm font-semibold text-gray-300 mb-2">
                                                            Quantity
                                                        </Text>
                                                        <Input
                                                            value={selectedModifierForAdd.quantity.toString()}
                                                            onChangeText={(text) => {
                                                                const qty = parseInt(text) || 1;
                                                                setSelectedModifierForAdd({
                                                                    ...selectedModifierForAdd,
                                                                    quantity: qty,
                                                                });
                                                            }}
                                                            keyboardType="numeric"
                                                            className="bg-[#303030] border-gray-600 text-white"
                                                            placeholderTextColor="#9CA3AF"
                                                        />
                                                    </View>
                                                )}
                                                <Button
                                                    onPress={handleAddModifier}
                                                    disabled={loading.addModifier || !selectedOrderItemId || !selectedModifierForAdd}
                                                    className="bg-teal-600"
                                                >
                                                    <Text className="text-white font-semibold">
                                                        {loading.addModifier ? "Adding..." : "Add Modifier"}
                                                    </Text>
                                                </Button>
                                            </>
                                        ) : (
                                            <Text className="text-gray-400 text-sm">
                                                No modifiers available. Select a menu item with modifiers first.
                                            </Text>
                                        )}
                                    </View>

                                    {/* Remove Modifier */}
                                    <View className="mb-4">
                                        <Text className="text-md font-semibold text-gray-300 mb-2">
                                            Remove Modifier
                                        </Text>
                                        {selectedOrderItem && selectedOrderItem.modifiers && selectedOrderItem.modifiers.length > 0 ? (
                                            <>
                                                <View className="mb-2">
                                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                                        Select Modifier to Remove
                                                    </Text>
                                                    <Select
                                                        value={
                                                            modifierIdToRemove
                                                                ? {
                                                                    value: modifierIdToRemove,
                                                                    label: selectedOrderItem.modifiers.find(
                                                                        (m: OrderItemModifier) => m.id === modifierIdToRemove
                                                                    )?.modifier_name || "Select modifier",
                                                                }
                                                                : undefined
                                                        }
                                                        onValueChange={(option) =>
                                                            setModifierIdToRemove(option?.value || "")
                                                        }
                                                    >
                                                        <SelectTrigger className="bg-[#303030] border-gray-600">
                                                            <SelectValue
                                                                placeholder="Select modifier to remove"
                                                                className="text-white"
                                                            />
                                                        </SelectTrigger>
                                                        <SelectContent className="bg-[#212121] border-gray-600">
                                                            {selectedOrderItem.modifiers.map((modifier: OrderItemModifier) => (
                                                                <SelectItem
                                                                    key={modifier.id}
                                                                    value={modifier.id}
                                                                    label={`${modifier.modifier_name} (+$${modifier.price_modifier.toFixed(2)})`}
                                                                />
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </View>
                                                <Button
                                                    onPress={handleRemoveModifier}
                                                    disabled={loading.removeModifier || !modifierIdToRemove}
                                                    className="bg-red-600"
                                                >
                                                    <Text className="text-white font-semibold">
                                                        {loading.removeModifier ? "Removing..." : "Remove Modifier"}
                                                    </Text>
                                                </Button>
                                            </>
                                        ) : (
                                            <Text className="text-gray-400 text-sm">
                                                No modifiers to remove. Get item details first.
                                            </Text>
                                        )}
                                    </View>
                                </View>

                                {/* Void Item */}
                                <View className="border-t border-gray-700 pt-4">
                                    <Text className="text-lg font-bold text-white mb-3">
                                        Void Item
                                    </Text>
                                    <View className="mb-2">
                                        <Text className="text-sm font-semibold text-gray-300 mb-2">
                                            Void Reason (Required)
                                        </Text>
                                        <Input
                                            value={voidReason}
                                            onChangeText={setVoidReason}
                                            placeholder="Enter reason for voiding"
                                            className="bg-[#303030] border-gray-600 text-white"
                                            placeholderTextColor="#9CA3AF"
                                        />
                                    </View>
                                    <Button
                                        onPress={handleVoidItem}
                                        disabled={loading.voidItem || !selectedOrderItemId || !voidReason}
                                        className="bg-red-700"
                                    >
                                        <Text className="text-white font-semibold">
                                            {loading.voidItem ? "Voiding..." : "Void Item"}
                                        </Text>
                                    </Button>
                                </View>

                                {/* Duplicate Item */}
                                <View className="border-t border-gray-700 pt-4">
                                    <Text className="text-lg font-bold text-white mb-3">
                                        Duplicate Item
                                    </Text>
                                    <View className="mb-2">
                                        <Text className="text-sm font-semibold text-gray-300 mb-2">
                                            Quantity (Optional - defaults to original)
                                        </Text>
                                        <Input
                                            value={duplicateQuantity}
                                            onChangeText={setDuplicateQuantity}
                                            placeholder="Enter quantity (optional)"
                                            keyboardType="numeric"
                                            className="bg-[#303030] border-gray-600 text-white"
                                            placeholderTextColor="#9CA3AF"
                                        />
                                    </View>
                                    <Button
                                        onPress={handleDuplicateItem}
                                        disabled={loading.duplicateItem || !selectedOrderItemId}
                                        className="bg-cyan-600"
                                    >
                                        <Text className="text-white font-semibold">
                                            {loading.duplicateItem ? "Duplicating..." : "Duplicate Item"}
                                        </Text>
                                    </Button>
                                </View>
                            </View>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>

                {/* Payment Configuration Section */}
                <Accordion type="single" collapsible className="mb-4">
                    <AccordionItem value="payment-config">
                        <AccordionTrigger className="py-3">
                            <Text className="text-xl font-bold text-white">
                                Payment Configuration
                            </Text>
                        </AccordionTrigger>
                        <AccordionContent>
                            <View className="space-y-4">
                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Payment Method
                                    </Text>
                                    <Select
                                        value={{
                                            value: paymentMethod,
                                            label: paymentMethod
                                                .replace("_", " ")
                                                .replace(/\b\w/g, (l) => l.toUpperCase()),
                                        }}
                                        onValueChange={(option) =>
                                            setPaymentMethod(option?.value as PaymentMethod)
                                        }
                                    >
                                        <SelectTrigger className="bg-[#303030] border-gray-600">
                                            <SelectValue
                                                placeholder="Select payment method"
                                                className="text-white"
                                            />
                                        </SelectTrigger>
                                        <SelectContent className="bg-[#212121] border-gray-600">
                                            <SelectItem value="cash" label="Cash" />
                                            <SelectItem value="card_spinapi" label="Card (SPINAPI)" />
                                            <SelectItem
                                                value="card_dvpaylite"
                                                label="Card (DVPayLite)"
                                            />
                                            <SelectItem value="card_manual" label="Card (Manual)" />
                                            <SelectItem value="gift_card" label="Gift Card" />
                                            <SelectItem value="house_account" label="House Account" />
                                            <SelectItem value="external" label="External" />
                                        </SelectContent>
                                    </Select>
                                </View>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Terminal Type
                                    </Text>
                                    <Select
                                        value={{
                                            value: terminalType,
                                            label: terminalType
                                                .replace("_", " ")
                                                .replace(/\b\w/g, (l) => l.toUpperCase()),
                                        }}
                                        onValueChange={(option) =>
                                            setTerminalType(option?.value as TerminalType)
                                        }
                                    >
                                        <SelectTrigger className="bg-[#303030] border-gray-600">
                                            <SelectValue
                                                placeholder="Select terminal type"
                                                className="text-white"
                                            />
                                        </SelectTrigger>
                                        <SelectContent className="bg-[#212121] border-gray-600">
                                            <SelectItem
                                                value="dejavoo_spinapi"
                                                label="Dejavoo SPINAPI"
                                            />
                                            <SelectItem value="dejavoo_p18" label="Dejavoo P18" />
                                            <SelectItem value="manual" label="Manual" />
                                            <SelectItem value="none" label="None" />
                                        </SelectContent>
                                    </Select>
                                </View>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Terminal ID (Optional)
                                    </Text>
                                    <Input
                                        value={terminalId}
                                        onChangeText={setTerminalId}
                                        placeholder="Enter terminal ID"
                                        className="bg-[#303030] border-gray-600 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </View>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Device ID (Optional)
                                    </Text>
                                    <Input
                                        value={deviceId}
                                        onChangeText={setDeviceId}
                                        placeholder="Enter device ID"
                                        className="bg-[#303030] border-gray-600 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </View>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Amount ($)
                                    </Text>
                                    <Input
                                        value={amount}
                                        onChangeText={setAmount}
                                        placeholder="0.00"
                                        keyboardType="decimal-pad"
                                        className="bg-[#303030] border-gray-600 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </View>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Tip Amount ($)
                                    </Text>
                                    <Input
                                        value={tipAmount}
                                        onChangeText={setTipAmount}
                                        placeholder="0.00"
                                        keyboardType="decimal-pad"
                                        className="bg-[#303030] border-gray-600 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </View>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Tax Rate (e.g., 0.0825 for 8.25%)
                                    </Text>
                                    <Input
                                        value={taxRate}
                                        onChangeText={setTaxRate}
                                        placeholder="0.0825"
                                        keyboardType="decimal-pad"
                                        className="bg-[#303030] border-gray-600 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </View>
                            </View>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>

                {/* Status Configuration */}
                <Accordion type="single" collapsible className="mb-4">
                    <AccordionItem value="status-config">
                        <AccordionTrigger className="py-3">
                            <Text className="text-xl font-bold text-white">
                                Status Configuration
                            </Text>
                        </AccordionTrigger>
                        <AccordionContent>
                            <View>
                                <Text className="text-sm font-semibold text-gray-300 mb-2">
                                    Order Status
                                </Text>
                                <Select
                                    value={{
                                        value: orderStatus,
                                        label:
                                            orderStatus.charAt(0).toUpperCase() +
                                            orderStatus.slice(1),
                                    }}
                                    onValueChange={(option) =>
                                        setOrderStatus(option?.value as OrderStatus)
                                    }
                                >
                                    <SelectTrigger className="bg-[#303030] border-gray-600">
                                        <SelectValue
                                            placeholder="Select order status"
                                            className="text-white"
                                        />
                                    </SelectTrigger>
                                    <SelectContent className="bg-[#212121] border-gray-600">
                                        <SelectItem value="draft" label="Draft" />
                                        <SelectItem value="pending" label="Pending" />
                                        <SelectItem value="preparing" label="Preparing" />
                                        <SelectItem value="ready" label="Ready" />
                                        <SelectItem value="completed" label="Completed" />
                                        <SelectItem value="cancelled" label="Cancelled" />
                                        <SelectItem value="refunded" label="Refunded" />
                                        <SelectItem value="void" label="Void" />
                                    </SelectContent>
                                </Select>
                            </View>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>

                {/* Test Actions Section */}
                <View className="bg-[#303030] rounded-lg p-4 mb-4">
                    <Text className="text-xl font-bold text-white mb-4">
                        Test Actions
                    </Text>

                    <View className="gap-y-3 flex flex-col">
                        <Button
                            onPress={handleCreateOrder}
                            disabled={loading.createOrder || loading.completeFlow}
                            className="bg-blue-600"
                        >
                            <Text className="text-white font-semibold">
                                {loading.createOrder ? "Creating..." : "Create Order"}
                            </Text>
                        </Button>

                        <Button
                            onPress={handleAddItem}
                            disabled={
                                loading.addItem || loading.completeFlow || !currentOrderId
                            }
                            className="bg-green-600"
                        >
                            <Text className="text-white font-semibold">
                                {loading.addItem ? "Adding..." : "Add Item"}
                            </Text>
                        </Button>

                        <Button
                            onPress={handleCalculateTax}
                            disabled={
                                loading.calculateTax || loading.completeFlow || !currentOrderId
                            }
                            className="bg-purple-600"
                        >
                            <Text className="text-white font-semibold">
                                {loading.calculateTax ? "Calculating..." : "Calculate Tax"}
                            </Text>
                        </Button>

                        <Button
                            onPress={handleUpdateStatus}
                            disabled={
                                loading.updateStatus || loading.completeFlow || !currentOrderId
                            }
                            className="bg-orange-600"
                        >
                            <Text className="text-white font-semibold">
                                {loading.updateStatus ? "Updating..." : "Update Status"}
                            </Text>
                        </Button>

                        <Button
                            onPress={handleProcessPayment}
                            disabled={
                                loading.processPayment ||
                                loading.completeFlow ||
                                !currentOrderId
                            }
                            className="bg-emerald-600"
                        >
                            <Text className="text-white font-semibold">
                                {loading.processPayment ? "Processing..." : "Process Payment"}
                            </Text>
                        </Button>

                        <View className="border-t border-gray-600 pt-3 mt-3">
                            <Button
                                onPress={handleCompleteFlow}
                                disabled={loading.completeFlow}
                                className="bg-indigo-600"
                            >
                                <Text className="text-white font-semibold text-lg">
                                    {loading.completeFlow
                                        ? "Running Complete Flow..."
                                        : "Run Complete Flow"}
                                </Text>
                            </Button>
                        </View>
                    </View>

                    {/* Helper Buttons */}
                    <View className="flex-row gap-3 mt-4 pt-4 border-t border-gray-600">
                        <TouchableOpacity
                            onPress={handleResetForm}
                            className="flex-1 bg-gray-700 px-4 py-3 rounded-lg flex-row items-center justify-center gap-2"
                        >
                            <RotateCcw size={18} color="white" />
                            <Text className="text-white font-semibold">Reset Form</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={handleClearLogs}
                            className="flex-1 bg-gray-700 px-4 py-3 rounded-lg flex-row items-center justify-center gap-2"
                        >
                            <Trash2 size={18} color="white" />
                            <Text className="text-white font-semibold">Clear Logs</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Results/Logs Section */}
                <View className="bg-[#303030] rounded-lg p-4 mb-4">
                    <Text className="text-xl font-bold text-white mb-4">
                        Test Results & Logs
                    </Text>

                    {logs.length === 0 ? (
                        <Text className="text-gray-400 text-center py-8">
                            No logs yet. Run a test action to see results.
                        </Text>
                    ) : (
                        <ScrollView
                            className="max-h-96"
                            style={{ maxHeight: 400 }}
                            nestedScrollEnabled
                        >
                            {logs.map((log) => (
                                <View
                                    key={log.id}
                                    className={`mb-3 p-3 rounded-lg border ${log.success
                                        ? "bg-green-900/20 border-green-600"
                                        : "bg-red-900/20 border-red-600"
                                        }`}
                                >
                                    <View className="flex-row items-center justify-between mb-2">
                                        <Text
                                            className={`font-bold ${log.success ? "text-green-400" : "text-red-400"
                                                }`}
                                        >
                                            {log.operation}
                                        </Text>
                                        <Text className="text-gray-400 text-xs">
                                            {new Date(log.timestamp).toLocaleTimeString()}
                                        </Text>
                                    </View>

                                    {log.request && (
                                        <View className="mb-2">
                                            <Text className="text-gray-300 text-xs font-semibold mb-1">
                                                Request:
                                            </Text>
                                            <Text className="text-gray-400 text-xs font-mono">
                                                {JSON.stringify(log.request, null, 2)}
                                            </Text>
                                        </View>
                                    )}

                                    {log.response && (
                                        <View className="mb-2">
                                            <Text className="text-gray-300 text-xs font-semibold mb-1">
                                                Response:
                                            </Text>
                                            <Text className="text-gray-400 text-xs font-mono">
                                                {JSON.stringify(log.response, null, 2)}
                                            </Text>
                                        </View>
                                    )}

                                    {log.error && (
                                        <View>
                                            <Text className="text-red-400 text-xs font-semibold mb-1">
                                                Error:
                                            </Text>
                                            <Text className="text-red-300 text-xs">{log.error}</Text>
                                        </View>
                                    )}
                                </View>
                            ))}
                        </ScrollView>
                    )}
                </View>
            </ScrollView>
        </View>
    );
};

export default OrderTest;
