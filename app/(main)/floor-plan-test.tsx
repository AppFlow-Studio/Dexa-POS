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
import { TABLE_SHAPES } from "@/lib/table-shapes";
import { useMenuStore } from "@/stores/useMenuStore";
import { setOrderStoreSupabaseClient, useOrderStore, type CartItem } from "@/stores/useOrderStoreOptimized";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import type {
    FloorPlan,
    FloorPlanObject,
    Reservation,
    TableSession,
    TableStatus,
    WaitlistEntry
} from "@/types/db-floor-plan-types";
import type { MenuItemDetails, MenuWithCategories } from "@/types/menu";
import { useRouter } from "expo-router";
import {
    ChevronDown,
    ChevronUp,
    Minus,
    Plus,
    RotateCcw,
    Trash2
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

const FloorPlanTest = () => {
    const { show } = useToast();
    const supabase = useSupabaseClient();
    const router = useRouter();
    const selectedStore = useStoreSettingsStore((state) => state.selectedStore);
    const orderStore = useOrderStore();

    // Initialize order store with supabase client
    React.useEffect(() => {
        setOrderStoreSupabaseClient(supabase);
    }, [supabase]);

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

    // Location & Floor Plan State
    const [locationId, setLocationId] = useState<string | null>(selectedStore?.id || null);

    // Update locationId when store changes
    React.useEffect(() => {
        if (selectedStore?.id) {
            setLocationId(selectedStore.id);
        }
    }, [selectedStore?.id]);
    const [floorPlans, setFloorPlans] = useState<FloorPlan[]>([]);
    const [selectedFloorPlanId, setSelectedFloorPlanId] = useState<string | null>(null);
    const [floorPlanName, setFloorPlanName] = useState("");
    const [floorPlanDescription, setFloorPlanDescription] = useState("");

    // Table Design State
    const [selectedShapeId, setSelectedShapeId] = useState<keyof typeof TABLE_SHAPES>("square-4");
    const [tableName, setTableName] = useState("");
    const [tableX, setTableX] = useState("100");
    const [tableY, setTableY] = useState("100");
    const [tableRotation, setTableRotation] = useState("0");
    const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
    const [batchUpdates, setBatchUpdates] = useState("");

    // Table Sessions State
    const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
    const [tableIdsInput, setTableIdsInput] = useState(""); // For text input
    const [partySize, setPartySize] = useState("2");
    const [guestName, setGuestName] = useState("");
    const [guestPhone, setGuestPhone] = useState("");
    const [guestNotes, setGuestNotes] = useState("");
    const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
    const [sessionStatus, setSessionStatus] = useState<TableStatus>("seated");
    const [newTableIds, setNewTableIds] = useState("");
    const [tableToMerge, setTableToMerge] = useState("");
    const [tableToUnmerge, setTableToUnmerge] = useState("");
    const [orderIdToLink, setOrderIdToLink] = useState("");

    // Waitlist State
    const [waitlistPartyName, setWaitlistPartyName] = useState("");
    const [waitlistPartySize, setWaitlistPartySize] = useState("2");
    const [waitlistPhone, setWaitlistPhone] = useState("");
    const [waitlistNotes, setWaitlistNotes] = useState("");
    const [preferredSection, setPreferredSection] = useState("");
    const [quotedWaitMinutes, setQuotedWaitMinutes] = useState("");
    const [selectedWaitlistId, setSelectedWaitlistId] = useState<string | null>(null);
    const [waitlistStatus, setWaitlistStatus] = useState<WaitlistEntry['status']>("waiting");

    // Reservation State
    const [reservationPartyName, setReservationPartyName] = useState("");
    const [reservationPartySize, setReservationPartySize] = useState("2");
    const [reservationPhone, setReservationPhone] = useState("");
    const [reservationEmail, setReservationEmail] = useState("");
    const [reservationDate, setReservationDate] = useState("");
    const [reservationTime, setReservationTime] = useState("");
    const [reservationNotes, setReservationNotes] = useState("");
    const [specialRequests, setSpecialRequests] = useState("");
    const [isVip, setIsVip] = useState(false);
    const [selectedReservationId, setSelectedReservationId] = useState<string | null>(null);
    const [reservationStatus, setReservationStatus] = useState<Reservation['status']>("pending");
    const [reservationTableIds, setReservationTableIds] = useState("");
    const [checkDate, setCheckDate] = useState("");
    const [checkTime, setCheckTime] = useState("");
    const [checkPartySize, setCheckPartySize] = useState("2");

    // Order & Coursing State
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
    const [selectedCourseNumber, setSelectedCourseNumber] = useState("1");
    const [itemName, setItemName] = useState("");
    const [itemPrice, setItemPrice] = useState("10.00");
    const [itemQuantity, setItemQuantity] = useState("1");
    const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
    const [targetCourseNumber, setTargetCourseNumber] = useState("2");
    const [courseToFire, setCourseToFire] = useState("1");
    const [courseToServe, setCourseToServe] = useState("1");

    // Menu Item Configuration State
    const [selectedMenuItem, setSelectedMenuItem] = useState<MenuItemDetails | null>(null);
    const [selectedCategoryName, setSelectedCategoryName] = useState<string>("");
    const [useCashPrice, setUseCashPrice] = useState<boolean>(true);
    const [menuItemId, setMenuItemId] = useState("");
    const [locationExclusiveItemId, setLocationExclusiveItemId] = useState("");
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

    // Data Lists
    const [tables, setTables] = useState<FloorPlanObject[]>([]);
    const [sessions, setSessions] = useState<TableSession[]>([]);
    const [waitlistEntries, setWaitlistEntries] = useState<WaitlistEntry[]>([]);
    const [reservations, setReservations] = useState<Reservation[]>([]);

    // Test Results/Logs
    const [logs, setLogs] = useState<TestLog[]>([]);

    // Loading States
    const [loading, setLoading] = useState({
        getFloorPlans: false,
        createFloorPlan: false,
        getFloorPlanStatus: false,
        addTable: false,
        updateTablePosition: false,
        updateTablePositionsBatch: false,
        removeTable: false,
        seatGuests: false,
        updateSessionStatus: false,
        transferSession: false,
        mergeTable: false,
        unmergeTable: false,
        advanceCourse: false,
        linkOrder: false,
        getWaitlist: false,
        addToWaitlist: false,
        notifyWaitlist: false,
        updateWaitlistStatus: false,
        seatFromWaitlist: false,
        getReservations: false,
        createReservation: false,
        updateReservationStatus: false,
        assignReservationTables: false,
        seatReservation: false,
        checkAvailability: false,
        createOrderForSession: false,
        linkOrderToSession: false,
        setWorkingCourse: false,
        createNextCourse: false,
        addItemToOrder: false,
        fireCourse: false,
        markCourseServed: false,
        moveItemToCourse: false,
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

    // ==========================================================================
    // FLOOR PLAN OPERATIONS
    // ==========================================================================

    const handleGetFloorPlans = async () => {
        if (!locationId) {
            show({
                title: "Error",
                message: "Please set location ID first.",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, getFloorPlans: true }));

        try {
            const params = { p_location_id: locationId };
            addLog("Get Floor Plans", params);

            const result = await callRPC("get_location_floor_plans", params);

            setFloorPlans(result || []);
            addLog("Get Floor Plans", params, result);
            show({
                title: "Success",
                message: `Found ${result?.length || 0} floor plans`,
                type: "success",
            });
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to get floor plans";
            addLog("Get Floor Plans", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, getFloorPlans: false }));
        }
    };

    const handleCreateFloorPlan = async () => {
        if (!locationId) {
            show({
                title: "Error",
                message: "Please set location ID first.",
                type: "error",
            });
            return;
        }

        if (!floorPlanName) {
            show({
                title: "Error",
                message: "Please enter floor plan name.",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, createFloorPlan: true }));

        try {
            const params = {
                p_location_id: locationId,
                p_name: floorPlanName,
                p_description: floorPlanDescription || undefined,
            };

            addLog("Create Floor Plan", params);

            const result = await callRPC("create_floor_plan", params);

            if (result?.floor_plan_id) {
                setSelectedFloorPlanId(result.floor_plan_id);
                addLog("Create Floor Plan", params, result);
                show({
                    title: "Success",
                    message: `Floor plan created: ${result.floor_plan_id}`,
                    type: "success",
                });
                await handleGetFloorPlans();
            } else {
                throw new Error("No floor_plan_id in response");
            }
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to create floor plan";
            addLog("Create Floor Plan", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, createFloorPlan: false }));
        }
    };

    const handleGetFloorPlanStatus = async () => {
        if (!selectedFloorPlanId) {
            show({
                title: "Error",
                message: "Please select a floor plan first.",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, getFloorPlanStatus: true }));

        try {
            const params = { p_floor_plan_id: selectedFloorPlanId };
            addLog("Get Floor Plan Status", params);

            const result = await callRPC("get_floor_plan_status", params);

            setTables(result?.tables || []);
            addLog("Get Floor Plan Status", params, result);
            show({
                title: "Success",
                message: `Loaded ${result?.tables?.length || 0} tables`,
                type: "success",
            });
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to get floor plan status";
            addLog("Get Floor Plan Status", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, getFloorPlanStatus: false }));
        }
    };

    // ==========================================================================
    // TABLE DESIGN OPERATIONS
    // ==========================================================================

    const handleAddTable = async () => {
        if (!selectedFloorPlanId) {
            show({
                title: "Error",
                message: "Please select a floor plan first.",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, addTable: true }));

        try {
            const shape = TABLE_SHAPES[selectedShapeId];
            if (!shape) {
                throw new Error(`Invalid shape ID: ${selectedShapeId}`);
            }

            const params = {
                p_floor_plan_id: selectedFloorPlanId,
                p_name: tableName || `Table ${tables.length + 1}`,
                p_shape_id: selectedShapeId,
                p_category: shape.category || "table",
                p_x: parseFloat(tableX) || 100,
                p_y: parseFloat(tableY) || 100,
                p_rotation: parseFloat(tableRotation) || 0,
                p_capacity: shape.capacity || null,
                p_width: shape.width || null,
                p_height: shape.height || null,
            };

            addLog("Add Table", params);

            const result = await callRPC("add_floor_plan_object", params);

            if (result?.object_id) {
                addLog("Add Table", params, result);
                show({
                    title: "Success",
                    message: `Table added: ${result.object_id}`,
                    type: "success",
                });
                await handleGetFloorPlanStatus();
            } else {
                throw new Error("No object_id in response");
            }
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to add table";
            addLog("Add Table", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, addTable: false }));
        }
    };

    const handleUpdateTablePosition = async () => {
        if (!selectedTableId) {
            show({
                title: "Error",
                message: "Please select a table first.",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, updateTablePosition: true }));

        try {
            const params = {
                p_object_id: selectedTableId,
                p_x: parseFloat(tableX) || 100,
                p_y: parseFloat(tableY) || 100,
                p_rotation: parseFloat(tableRotation) || undefined,
            };

            addLog("Update Table Position", params);

            const result = await callRPC("update_floor_plan_object_position", params);

            addLog("Update Table Position", params, result);
            show({
                title: "Success",
                message: "Table position updated",
                type: "success",
            });
            await handleGetFloorPlanStatus();
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to update table position";
            addLog("Update Table Position", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, updateTablePosition: false }));
        }
    };

    const handleUpdateTablePositionsBatch = async () => {
        if (!batchUpdates) {
            show({
                title: "Error",
                message: "Please enter batch updates JSON.",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, updateTablePositionsBatch: true }));

        try {
            let updates;
            try {
                updates = JSON.parse(batchUpdates);
            } catch (e) {
                throw new Error("Invalid JSON format");
            }

            if (!Array.isArray(updates)) {
                throw new Error("Updates must be an array");
            }

            const params = { p_updates: updates };
            addLog("Update Table Positions Batch", params);

            const result = await callRPC("update_floor_plan_objects_batch", params);

            addLog("Update Table Positions Batch", params, result);
            show({
                title: "Success",
                message: "Batch update completed",
                type: "success",
            });
            await handleGetFloorPlanStatus();
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to update table positions";
            addLog("Update Table Positions Batch", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, updateTablePositionsBatch: false }));
        }
    };

    const handleRemoveTable = async () => {
        if (!selectedTableId) {
            show({
                title: "Error",
                message: "Please select a table first.",
                type: "error",
            });
            return;
        }

        Alert.alert(
            "Confirm Delete",
            "Are you sure you want to delete this table?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        setLoading((prev) => ({ ...prev, removeTable: true }));

                        try {
                            const { error } = await supabase
                                .from("floor_plan_objects")
                                .delete()
                                .eq("id", selectedTableId);

                            if (error) throw error;

                            addLog("Remove Table", { table_id: selectedTableId }, { success: true });
                            show({
                                title: "Success",
                                message: "Table removed",
                                type: "success",
                            });
                            setSelectedTableId(null);
                            await handleGetFloorPlanStatus();
                        } catch (error: any) {
                            const errorMessage = error?.message || "Failed to remove table";
                            addLog("Remove Table", undefined, undefined, errorMessage);
                            show({
                                title: "Error",
                                message: errorMessage,
                                type: "error",
                            });
                        } finally {
                            setLoading((prev) => ({ ...prev, removeTable: false }));
                        }
                    },
                },
            ]
        );
    };

    // ==========================================================================
    // TABLE SESSION OPERATIONS
    // ==========================================================================

    const handleSeatGuests = async () => {
        if (!selectedTableIds.length) {
            show({
                title: "Error",
                message: "Please select at least one table.",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, seatGuests: true }));

        try {
            const params = {
                p_table_ids: selectedTableIds,
                p_party_size: parseInt(partySize) || 2,
                p_guest_name: guestName || undefined,
                p_guest_phone: guestPhone || undefined,
                p_guest_notes: guestNotes || undefined,
                p_create_order: true,
            };

            addLog("Seat Guests", params);

            const result = await callRPC("seat_guests", params);

            addLog("Seat Guests", params, result);
            show({
                title: "Success",
                message: `Guests seated. Session: ${result?.session_id || "N/A"}`,
                type: "success",
            });
            await handleGetFloorPlanStatus();
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to seat guests";
            addLog("Seat Guests", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, seatGuests: false }));
        }
    };

    const handleUpdateSessionStatus = async () => {
        if (!selectedSessionId) {
            show({
                title: "Error",
                message: "Please select a session first.",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, updateSessionStatus: true }));

        try {
            const params = {
                p_session_id: selectedSessionId,
                p_status: sessionStatus,
                p_notes: guestNotes || undefined,
            };

            addLog("Update Session Status", params);

            const result = await callRPC("update_table_session_status", params);

            addLog("Update Session Status", params, result);
            show({
                title: "Success",
                message: "Session status updated",
                type: "success",
            });
            await handleGetFloorPlanStatus();
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to update session status";
            addLog("Update Session Status", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, updateSessionStatus: false }));
        }
    };

    const handleTransferSession = async () => {
        if (!selectedSessionId) {
            show({
                title: "Error",
                message: "Please select a session first.",
                type: "error",
            });
            return;
        }

        if (!newTableIds) {
            show({
                title: "Error",
                message: "Please enter new table IDs (comma-separated).",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, transferSession: true }));

        try {
            const tableIdsArray = newTableIds.split(",").map((id) => id.trim()).filter(Boolean);

            const params = {
                p_session_id: selectedSessionId,
                p_new_table_ids: tableIdsArray,
            };

            addLog("Transfer Session", params);

            const result = await callRPC("transfer_table_session", params);

            addLog("Transfer Session", params, result);
            show({
                title: "Success",
                message: "Session transferred",
                type: "success",
            });
            await handleGetFloorPlanStatus();
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to transfer session";
            addLog("Transfer Session", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, transferSession: false }));
        }
    };

    const handleMergeTable = async () => {
        if (!selectedSessionId) {
            show({
                title: "Error",
                message: "Please select a session first.",
                type: "error",
            });
            return;
        }

        if (!tableToMerge) {
            show({
                title: "Error",
                message: "Please enter table ID to merge.",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, mergeTable: true }));

        try {
            const params = {
                p_session_id: selectedSessionId,
                p_table_id: tableToMerge,
            };

            addLog("Merge Table", params);

            const result = await callRPC("merge_table_to_session", params);

            addLog("Merge Table", params, result);
            show({
                title: "Success",
                message: "Table merged to session",
                type: "success",
            });
            await handleGetFloorPlanStatus();
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to merge table";
            addLog("Merge Table", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, mergeTable: false }));
        }
    };

    const handleUnmergeTable = async () => {
        if (!selectedSessionId) {
            show({
                title: "Error",
                message: "Please select a session first.",
                type: "error",
            });
            return;
        }

        if (!tableToUnmerge) {
            show({
                title: "Error",
                message: "Please enter table ID to unmerge.",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, unmergeTable: true }));

        try {
            const params = {
                p_session_id: selectedSessionId,
                p_table_id: tableToUnmerge,
            };

            addLog("Unmerge Table", params);

            const result = await callRPC("unmerge_table_from_session", params);

            addLog("Unmerge Table", params, result);
            show({
                title: "Success",
                message: "Table unmerged from session",
                type: "success",
            });
            await handleGetFloorPlanStatus();
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to unmerge table";
            addLog("Unmerge Table", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, unmergeTable: false }));
        }
    };

    const handleAdvanceCourse = async () => {
        if (!selectedSessionId) {
            show({
                title: "Error",
                message: "Please select a session first.",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, advanceCourse: true }));

        try {
            const params = { p_session_id: selectedSessionId };

            addLog("Advance Course", params);

            const result = await callRPC("advance_course", params);

            addLog("Advance Course", params, result);
            show({
                title: "Success",
                message: `Course advanced to ${result?.current_course || "N/A"}`,
                type: "success",
            });
            await handleGetFloorPlanStatus();
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to advance course";
            addLog("Advance Course", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, advanceCourse: false }));
        }
    };

    const handleLinkOrder = async () => {
        if (!selectedSessionId) {
            show({
                title: "Error",
                message: "Please select a session first.",
                type: "error",
            });
            return;
        }

        if (!orderIdToLink) {
            show({
                title: "Error",
                message: "Please enter order ID.",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, linkOrder: true }));

        try {
            const params = {
                p_session_id: selectedSessionId,
                p_order_id: orderIdToLink,
            };

            addLog("Link Order", params);

            const result = await callRPC("link_order_to_session", params);

            addLog("Link Order", params, result);
            show({
                title: "Success",
                message: "Order linked to session",
                type: "success",
            });
            await handleGetFloorPlanStatus();
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to link order";
            addLog("Link Order", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, linkOrder: false }));
        }
    };

    // ==========================================================================
    // WAITLIST OPERATIONS
    // ==========================================================================

    const handleGetWaitlist = async () => {
        if (!locationId) {
            show({
                title: "Error",
                message: "Please set location ID first.",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, getWaitlist: true }));

        try {
            const params = { p_location_id: locationId };
            addLog("Get Waitlist", params);

            const result = await callRPC("get_waitlist", params);

            setWaitlistEntries(result?.waitlist || []);
            addLog("Get Waitlist", params, result);
            show({
                title: "Success",
                message: `Found ${result?.waitlist?.length || 0} waitlist entries`,
                type: "success",
            });
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to get waitlist";
            addLog("Get Waitlist", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, getWaitlist: false }));
        }
    };

    const handleAddToWaitlist = async () => {
        if (!locationId) {
            show({
                title: "Error",
                message: "Please set location ID first.",
                type: "error",
            });
            return;
        }

        if (!waitlistPartyName) {
            show({
                title: "Error",
                message: "Please enter party name.",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, addToWaitlist: true }));

        try {
            const params = {
                p_location_id: locationId,
                p_party_name: waitlistPartyName,
                p_party_size: parseInt(waitlistPartySize) || 2,
                p_phone: waitlistPhone || undefined,
                p_notes: waitlistNotes || undefined,
                p_preferred_section: preferredSection || undefined,
                p_quoted_wait_minutes: quotedWaitMinutes ? parseInt(quotedWaitMinutes) : undefined,
            };

            addLog("Add to Waitlist", params);

            const result = await callRPC("add_to_waitlist", params);

            addLog("Add to Waitlist", params, result);
            show({
                title: "Success",
                message: `Added to waitlist. Position: ${result?.position || "N/A"}`,
                type: "success",
            });
            await handleGetWaitlist();
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to add to waitlist";
            addLog("Add to Waitlist", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, addToWaitlist: false }));
        }
    };

    const handleNotifyWaitlist = async () => {
        if (!selectedWaitlistId) {
            show({
                title: "Error",
                message: "Please select a waitlist entry first.",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, notifyWaitlist: true }));

        try {
            const params = { p_waitlist_id: selectedWaitlistId };
            addLog("Notify Waitlist Party", params);

            const result = await callRPC("notify_waitlist_party", params);

            addLog("Notify Waitlist Party", params, result);
            show({
                title: "Success",
                message: `Notification ready for ${result?.phone || "N/A"}`,
                type: "success",
            });
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to notify waitlist party";
            addLog("Notify Waitlist Party", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, notifyWaitlist: false }));
        }
    };

    const handleUpdateWaitlistStatus = async () => {
        if (!selectedWaitlistId) {
            show({
                title: "Error",
                message: "Please select a waitlist entry first.",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, updateWaitlistStatus: true }));

        try {
            const params = {
                p_waitlist_id: selectedWaitlistId,
                p_status: waitlistStatus,
            };

            addLog("Update Waitlist Status", params);

            const result = await callRPC("update_waitlist_status", params);

            addLog("Update Waitlist Status", params, result);
            show({
                title: "Success",
                message: "Waitlist status updated",
                type: "success",
            });
            await handleGetWaitlist();
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to update waitlist status";
            addLog("Update Waitlist Status", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, updateWaitlistStatus: false }));
        }
    };

    const handleSeatFromWaitlist = async () => {
        if (!selectedWaitlistId) {
            show({
                title: "Error",
                message: "Please select a waitlist entry first.",
                type: "error",
            });
            return;
        }

        if (!selectedTableIds.length) {
            show({
                title: "Error",
                message: "Please select at least one table.",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, seatFromWaitlist: true }));

        try {
            const params = {
                p_waitlist_id: selectedWaitlistId,
                p_table_ids: selectedTableIds,
            };

            addLog("Seat from Waitlist", params);

            const result = await callRPC("seat_from_waitlist", params);

            addLog("Seat from Waitlist", params, result);
            show({
                title: "Success",
                message: `Seated from waitlist. Session: ${result?.session_id || "N/A"}`,
                type: "success",
            });
            await handleGetWaitlist();
            await handleGetFloorPlanStatus();
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to seat from waitlist";
            addLog("Seat from Waitlist", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, seatFromWaitlist: false }));
        }
    };

    // ==========================================================================
    // RESERVATION OPERATIONS
    // ==========================================================================

    const handleGetReservations = async () => {
        if (!locationId) {
            show({
                title: "Error",
                message: "Please set location ID first.",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, getReservations: true }));

        try {
            const params = {
                p_location_id: locationId,
                p_date: checkDate || new Date().toISOString().split("T")[0],
            };

            addLog("Get Reservations", params);

            const result = await callRPC("get_reservations", params);

            setReservations(result?.reservations || []);
            addLog("Get Reservations", params, result);
            show({
                title: "Success",
                message: `Found ${result?.reservations?.length || 0} reservations`,
                type: "success",
            });
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to get reservations";
            addLog("Get Reservations", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, getReservations: false }));
        }
    };

    const handleCreateReservation = async () => {
        if (!locationId) {
            show({
                title: "Error",
                message: "Please set location ID first.",
                type: "error",
            });
            return;
        }

        if (!reservationPartyName || !reservationPhone || !reservationDate || !reservationTime) {
            show({
                title: "Error",
                message: "Please fill in all required fields (name, phone, date, time).",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, createReservation: true }));

        try {
            const params = {
                p_location_id: locationId,
                p_party_name: reservationPartyName,
                p_party_size: parseInt(reservationPartySize) || 2,
                p_phone: reservationPhone,
                p_reservation_date: reservationDate,
                p_reservation_time: reservationTime,
                p_email: reservationEmail || undefined,
                p_notes: reservationNotes || undefined,
                p_special_requests: specialRequests || undefined,
                p_is_vip: isVip,
            };

            addLog("Create Reservation", params);

            const result = await callRPC("create_reservation", params);

            addLog("Create Reservation", params, result);
            show({
                title: "Success",
                message: `Reservation created. Confirmation: ${result?.confirmation_number || "N/A"}`,
                type: "success",
            });
            await handleGetReservations();
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to create reservation";
            addLog("Create Reservation", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, createReservation: false }));
        }
    };

    const handleUpdateReservationStatus = async () => {
        if (!selectedReservationId) {
            show({
                title: "Error",
                message: "Please select a reservation first.",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, updateReservationStatus: true }));

        try {
            const params = {
                p_reservation_id: selectedReservationId,
                p_status: reservationStatus,
            };

            addLog("Update Reservation Status", params);

            const result = await callRPC("update_reservation_status", params);

            addLog("Update Reservation Status", params, result);
            show({
                title: "Success",
                message: "Reservation status updated",
                type: "success",
            });
            await handleGetReservations();
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to update reservation status";
            addLog("Update Reservation Status", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, updateReservationStatus: false }));
        }
    };

    const handleAssignReservationTables = async () => {
        if (!selectedReservationId) {
            show({
                title: "Error",
                message: "Please select a reservation first.",
                type: "error",
            });
            return;
        }

        if (!reservationTableIds) {
            show({
                title: "Error",
                message: "Please enter table IDs (comma-separated).",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, assignReservationTables: true }));

        try {
            const tableIdsArray = reservationTableIds.split(",").map((id) => id.trim()).filter(Boolean);

            const params = {
                p_reservation_id: selectedReservationId,
                p_table_ids: tableIdsArray,
            };

            addLog("Assign Reservation Tables", params);

            const result = await callRPC("assign_reservation_tables", params);

            addLog("Assign Reservation Tables", params, result);
            show({
                title: "Success",
                message: "Tables assigned to reservation",
                type: "success",
            });
            await handleGetReservations();
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to assign reservation tables";
            addLog("Assign Reservation Tables", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, assignReservationTables: false }));
        }
    };

    const handleSeatReservation = async () => {
        if (!selectedReservationId) {
            show({
                title: "Error",
                message: "Please select a reservation first.",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, seatReservation: true }));

        try {
            const tableIdsArray = reservationTableIds
                ? reservationTableIds.split(",").map((id) => id.trim()).filter(Boolean)
                : undefined;

            const params: any = {
                p_reservation_id: selectedReservationId,
            };

            if (tableIdsArray) {
                params.p_table_ids = tableIdsArray;
            }

            addLog("Seat Reservation", params);

            const result = await callRPC("seat_reservation", params);

            addLog("Seat Reservation", params, result);
            show({
                title: "Success",
                message: `Reservation seated. Session: ${result?.session_id || "N/A"}`,
                type: "success",
            });
            await handleGetReservations();
            await handleGetFloorPlanStatus();
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to seat reservation";
            addLog("Seat Reservation", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, seatReservation: false }));
        }
    };

    const handleCheckAvailability = async () => {
        if (!locationId) {
            show({
                title: "Error",
                message: "Please set location ID first.",
                type: "error",
            });
            return;
        }

        if (!checkDate || !checkTime) {
            show({
                title: "Error",
                message: "Please enter date and time.",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, checkAvailability: true }));

        try {
            const params = {
                p_location_id: locationId,
                p_date: checkDate,
                p_time: checkTime,
                p_party_size: parseInt(checkPartySize) || 2,
            };

            addLog("Check Availability", params);

            const result = await callRPC("check_table_availability", params);

            addLog("Check Availability", params, result);
            show({
                title: "Success",
                message: `Found ${result?.available_tables?.length || 0} available tables`,
                type: "success",
            });
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to check availability";
            addLog("Check Availability", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, checkAvailability: false }));
        }
    };

    // ==========================================================================
    // ORDER & COURSING OPERATIONS
    // ==========================================================================

    const handleCreateOrderForSession = async () => {
        if (!selectedSessionId) {
            show({
                title: "Error",
                message: "Please select a table session first.",
                type: "error",
            });
            return;
        }

        const session = sessions.find((s) => s.id === selectedSessionId);
        if (!session) {
            show({
                title: "Error",
                message: "Session not found.",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, createOrderForSession: true }));

        try {
            // Get table ID from session (first table if merged)
            const tableIds = tables
                .filter((t) => t.session?.id === selectedSessionId)
                .map((t) => t.id);

            if (tableIds.length === 0) {
                throw new Error("No tables found for this session");
            }

            const tableId = tableIds[0];

            // Create new order
            const newOrder = orderStore.startNewOrder({
                tableId,
                guestCount: session.party_size || 2,
            });

            // Set as active order
            orderStore.setActiveOrder(newOrder.id);
            setSelectedOrderId(newOrder.id);

            addLog("Create Order for Session", { sessionId: selectedSessionId, tableId, orderId: newOrder.id }, { orderId: newOrder.id });
            show({
                title: "Success",
                message: `Order created: ${newOrder.id}`,
                type: "success",
            });
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to create order";
            addLog("Create Order for Session", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, createOrderForSession: false }));
        }
    };

    const handleLinkOrderToSession = async () => {
        if (!selectedOrderId) {
            show({
                title: "Error",
                message: "Please select an order first.",
                type: "error",
            });
            return;
        }

        if (!selectedSessionId) {
            show({
                title: "Error",
                message: "Please select a table session first.",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, linkOrderToSession: true }));

        try {
            const order = orderStore.getOrder(selectedOrderId);
            if (!order) {
                throw new Error("Order not found");
            }

            if (!order.db_order_id) {
                throw new Error("Order must be synced to server first");
            }

            const params = {
                p_session_id: selectedSessionId,
                p_order_id: order.db_order_id,
            };

            addLog("Link Order to Session", params);

            const result = await callRPC("link_order_to_session", params);

            addLog("Link Order to Session", params, result);
            show({
                title: "Success",
                message: "Order linked to session",
                type: "success",
            });
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to link order to session";
            addLog("Link Order to Session", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, linkOrderToSession: false }));
        }
    };

    const handleSetWorkingCourse = () => {
        if (!selectedOrderId) {
            show({
                title: "Error",
                message: "Please select an order first.",
                type: "error",
            });
            return;
        }

        const courseNumber = parseInt(selectedCourseNumber);
        if (isNaN(courseNumber) || courseNumber < 1) {
            show({
                title: "Error",
                message: "Please enter a valid course number.",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, setWorkingCourse: true }));

        try {
            orderStore.setWorkingCourse(selectedOrderId, courseNumber);
            addLog("Set Working Course", { orderId: selectedOrderId, courseNumber }, { success: true });
            show({
                title: "Success",
                message: `Working course set to ${courseNumber}`,
                type: "success",
            });
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to set working course";
            addLog("Set Working Course", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, setWorkingCourse: false }));
        }
    };

    const handleCreateNextCourse = () => {
        if (!selectedOrderId) {
            show({
                title: "Error",
                message: "Please select an order first.",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, createNextCourse: true }));

        try {
            const nextCourse = orderStore.createNextCourse(selectedOrderId);
            addLog("Create Next Course", { orderId: selectedOrderId }, { nextCourse });
            show({
                title: "Success",
                message: `Course ${nextCourse} created`,
                type: "success",
            });
            setSelectedCourseNumber(nextCourse.toString());
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to create next course";
            addLog("Create Next Course", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, createNextCourse: false }));
        }
    };

    // ==========================================================================
    // MODIFIER HELPER FUNCTIONS
    // ==========================================================================

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

    // Helper function to convert modifier selections to CartItem customizations format
    const convertModifiersToCustomizations = () => {
        if (!selectedMenuItem) return { addOns: [], modifiers: [] };

        const addOns: Array<{ id: string; name: string; price: number }> = [];
        const modifiers: Array<{
            categoryId: string;
            categoryName: string;
            options: Array<{ id: string; name: string; price: number }>;
        }> = [];

        Object.entries(modifierSelections).forEach(([groupId, items]) => {
            const group = selectedMenuItem.modifier_groups.find(
                (g) => g.id === groupId
            );
            if (!group) return;

            const selectedOptions: Array<{ id: string; name: string; price: number }> = [];

            Object.entries(items).forEach(([itemId, selection]) => {
                if (selection.selected) {
                    const modifierItem = group.items.find((item) => item.id === itemId);
                    if (modifierItem) {
                        const option = {
                            id: modifierItem.id,
                            name: modifierItem.name,
                            price: modifierItem.price_modifier,
                        };

                        // If quantity > 1, add multiple times or handle differently
                        for (let i = 0; i < (selection.quantity || 1); i++) {
                            selectedOptions.push(option);
                        }
                    }
                }
            });

            if (selectedOptions.length > 0) {
                modifiers.push({
                    categoryId: group.id,
                    categoryName: group.name,
                    options: selectedOptions,
                });
            }
        });

        return { addOns, modifiers };
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

    // Helper function to calculate effective item price
    const calculateEffectiveItemPrice = (): number => {
        if (!selectedMenuItem) return parseFloat(itemPrice) || 0;

        let price = useCashPrice && selectedMenuItem.effective_cash_price
            ? selectedMenuItem.effective_cash_price
            : selectedMenuItem.effective_price;

        // Add size modifier
        if (sizePriceModifier) {
            price += sizePriceModifier;
        }

        // Add modifier prices
        price += calculateModifierPriceImpact();

        return Math.round(price * 100) / 100;
    };

    const handleAddItemToOrder = () => {
        if (!selectedOrderId) {
            show({
                title: "Error",
                message: "Please select an order first.",
                type: "error",
            });
            return;
        }

        // Validate menu item selection
        if (!menuItemId && !locationExclusiveItemId) {
            show({
                title: "Error",
                message: "Please provide either menu_item_id or location_exclusive_item_id",
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

        setLoading((prev) => ({ ...prev, addItemToOrder: true }));

        try {
            const order = orderStore.getOrder(selectedOrderId);
            if (!order) {
                throw new Error("Order not found");
            }

            const quantity = parseInt(itemQuantity) || 1;
            if (quantity <= 0) {
                throw new Error("Invalid quantity");
            }

            // Calculate effective price
            const effectivePrice = calculateEffectiveItemPrice();

            // Set as active order to add item
            orderStore.setActiveOrder(selectedOrderId);

            // Build customizations
            const customizations: CartItem["customizations"] = {
                notes: itemSpecialInstructions || undefined,
            };

            // Add size if selected
            if (selectedSizeId && selectedSizeName) {
                customizations.size = {
                    id: selectedSizeId,
                    name: selectedSizeName,
                    priceModifier: sizePriceModifier,
                };
            }

            // Add modifiers from selections
            const modifierCustomizations = convertModifiersToCustomizations();
            if (modifierCustomizations.addOns.length > 0) {
                customizations.addOns = modifierCustomizations.addOns;
            }
            if (modifierCustomizations.modifiers.length > 0) {
                customizations.modifiers = modifierCustomizations.modifiers;
            }

            // Generate item ID
            const itemId = orderStore.generateCartItemId(
                menuItemId || locationExclusiveItemId || "unknown",
                customizations
            );

            const newItem: CartItem = {
                id: itemId,
                menuItemId: menuItemId || "",
                locationExclusiveItemId: locationExclusiveItemId || undefined,
                name: selectedMenuItem.name,
                category_name: selectedCategoryName || "Uncategorized",
                originalPrice: useCashPrice && selectedMenuItem.effective_cash_price
                    ? selectedMenuItem.effective_cash_price
                    : selectedMenuItem.effective_price,
                price: effectivePrice,
                quantity: quantity,
                paidQuantity: 0,
                course_number: order.working_course,
                customizations: customizations,
                synced: false,
                syncing: false,
                kitchen_status: "new",
            };

            orderStore.addItemToActiveOrder(newItem);

            addLog("Add Item to Order", { orderId: selectedOrderId, item: newItem.name, course: order.working_course }, { success: true });
            show({
                title: "Success",
                message: `${newItem.name} added to course ${order.working_course}`,
                type: "success",
            });

            // Clear form
            setItemName("");
            setItemPrice("10.00");
            setItemQuantity("1");
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to add item";
            addLog("Add Item to Order", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, addItemToOrder: false }));
        }
    };

    const handleFireCourse = async () => {
        if (!selectedOrderId) {
            show({
                title: "Error",
                message: "Please select an order first.",
                type: "error",
            });
            return;
        }

        const courseNumber = parseInt(courseToFire);
        if (isNaN(courseNumber) || courseNumber < 1) {
            show({
                title: "Error",
                message: "Please enter a valid course number.",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, fireCourse: true }));

        try {
            await orderStore.fireCourse(selectedOrderId, courseNumber);
            const order = orderStore.getOrder(selectedOrderId);
            const itemsInCourse = order?.items.filter((i) => i.course_number === courseNumber) || [];
            addLog("Fire Course", { orderId: selectedOrderId, courseNumber }, { itemCount: itemsInCourse.length });
            show({
                title: "Success",
                message: `Course ${courseNumber} fired (${itemsInCourse.length} items)`,
                type: "success",
            });
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to fire course";
            addLog("Fire Course", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, fireCourse: false }));
        }
    };

    const handleMarkCourseServed = () => {
        if (!selectedOrderId) {
            show({
                title: "Error",
                message: "Please select an order first.",
                type: "error",
            });
            return;
        }

        const courseNumber = parseInt(courseToServe);
        if (isNaN(courseNumber) || courseNumber < 1) {
            show({
                title: "Error",
                message: "Please enter a valid course number.",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, markCourseServed: true }));

        try {
            orderStore.markCourseServed(selectedOrderId, courseNumber);
            addLog("Mark Course Served", { orderId: selectedOrderId, courseNumber }, { success: true });
            show({
                title: "Success",
                message: `Course ${courseNumber} marked as served`,
                type: "success",
            });
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to mark course served";
            addLog("Mark Course Served", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, markCourseServed: false }));
        }
    };

    const handleMoveItemToCourse = () => {
        if (!selectedOrderId) {
            show({
                title: "Error",
                message: "Please select an order first.",
                type: "error",
            });
            return;
        }

        if (!selectedItemId) {
            show({
                title: "Error",
                message: "Please select an item first.",
                type: "error",
            });
            return;
        }

        const targetCourse = parseInt(targetCourseNumber);
        if (isNaN(targetCourse) || targetCourse < 1) {
            show({
                title: "Error",
                message: "Please enter a valid target course number.",
                type: "error",
            });
            return;
        }

        setLoading((prev) => ({ ...prev, moveItemToCourse: true }));

        try {
            orderStore.setItemCourse(selectedOrderId, selectedItemId, targetCourse);
            const order = orderStore.getOrder(selectedOrderId);
            const item = order?.items.find((i) => i.id === selectedItemId);
            addLog("Move Item to Course", { orderId: selectedOrderId, itemId: selectedItemId, targetCourse }, { itemName: item?.name });
            show({
                title: "Success",
                message: `${item?.name || "Item"} moved to course ${targetCourse}`,
                type: "success",
            });
        } catch (error: any) {
            const errorMessage = error?.message || "Failed to move item";
            addLog("Move Item to Course", undefined, undefined, errorMessage);
            show({
                title: "Error",
                message: errorMessage,
                type: "error",
            });
        } finally {
            setLoading((prev) => ({ ...prev, moveItemToCourse: false }));
        }
    };

    // ==========================================================================
    // DISPLAY HELPERS
    // ==========================================================================

    const getOrderDisplayInfo = (orderId: string) => {
        const order = orderStore.getOrder(orderId);
        if (!order) return null;

        return {
            id: order.id,
            tableId: order.service_location_id,
            status: order.order_status,
            subtotal: order.subtotal,
            tax: order.tax_amount,
            total: order.total_amount,
            amountPaid: order.amount_paid,
            amountDue: order.amount_due,
            courseCount: Object.keys(order.courses || {}).length,
            workingCourse: order.working_course,
            itemCount: order.items.length,
        };
    };

    const getCoursesDisplayInfo = (orderId: string) => {
        const order = orderStore.getOrder(orderId);
        if (!order) return [];

        return Object.values(order.courses || {}).map((course) => {
            const itemsInCourse = order.items.filter((i) => i.course_number === course.course_number);
            return {
                courseNumber: course.course_number,
                status: course.status,
                itemCount: itemsInCourse.length,
                firedAt: course.fired_at ? new Date(course.fired_at).toLocaleString() : undefined,
                servedAt: course.served_at ? new Date(course.served_at).toLocaleString() : undefined,
            };
        }).sort((a, b) => a.courseNumber - b.courseNumber);
    };

    const getItemsByCourse = (orderId: string) => {
        const order = orderStore.getOrder(orderId);
        if (!order) return {};

        const grouped: Record<number, CartItem[]> = {};
        order.items.forEach((item) => {
            if (!grouped[item.course_number]) {
                grouped[item.course_number] = [];
            }
            grouped[item.course_number].push(item);
        });

        return grouped;
    };

    // Helper to extract sessions from tables
    React.useEffect(() => {
        const extractedSessions: TableSession[] = [];
        tables.forEach((table) => {
            if (table.session) {
                const existing = extractedSessions.find((s) => s.id === table.session!.id);
                if (!existing) {
                    extractedSessions.push(table.session);
                }
            }
        });
        setSessions(extractedSessions);
    }, [tables]);

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
        setFloorPlanName("");
        setFloorPlanDescription("");
        setTableName("");
        setTableX("100");
        setTableY("100");
        setTableRotation("0");
        setSelectedTableId(null);
        setBatchUpdates("");
        setSelectedTableIds([]);
        setTableIdsInput("");
        setPartySize("2");
        setGuestName("");
        setGuestPhone("");
        setGuestNotes("");
        setSelectedSessionId(null);
        setNewTableIds("");
        setTableToMerge("");
        setTableToUnmerge("");
        setOrderIdToLink("");
        setWaitlistPartyName("");
        setWaitlistPartySize("2");
        setWaitlistPhone("");
        setWaitlistNotes("");
        setPreferredSection("");
        setQuotedWaitMinutes("");
        setSelectedWaitlistId(null);
        setReservationPartyName("");
        setReservationPartySize("2");
        setReservationPhone("");
        setReservationEmail("");
        setReservationDate("");
        setReservationTime("");
        setReservationNotes("");
        setSpecialRequests("");
        setIsVip(false);
        setSelectedReservationId(null);
        setReservationTableIds("");
        setCheckDate("");
        setCheckTime("");
        setCheckPartySize("2");
        setSelectedOrderId(null);
        setSelectedCourseNumber("1");
        setItemName("");
        setItemPrice("10.00");
        setItemQuantity("1");
        setSelectedItemId(null);
        setTargetCourseNumber("2");
        setCourseToFire("1");
        setCourseToServe("1");
        setSelectedMenuItem(null);
        setSelectedCategoryName("");
        setUseCashPrice(true);
        setMenuItemId("");
        setLocationExclusiveItemId("");
        setSelectedSizeId("");
        setSelectedSizeName("");
        setSizePriceModifier(0);
        setItemSpecialInstructions("");
        setModifierSelections({});
        setExpandedModifierGroups({});
        show({
            title: "Form Reset",
            message: "All fields have been reset",
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
                            Floor Plan & Table Test Interface
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
                        Test all floor plan and table management RPC functions
                    </Text>
                </View>

                {/* Location & Floor Plan Setup Section */}
                <Accordion type="single" collapsible className="mb-4">
                    <AccordionItem value="floor-plan-setup">
                        <AccordionTrigger className="py-3">
                            <Text className="text-xl font-bold text-white">
                                Location & Floor Plan Setup
                            </Text>
                        </AccordionTrigger>
                        <AccordionContent>
                            <View className="space-y-4">
                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Location ID
                                    </Text>
                                    <TextInput
                                        value={locationId || ""}
                                        onChangeText={setLocationId}
                                        placeholder="Enter location ID"
                                        className="bg-[#303030] border border-gray-600 rounded-lg px-3 py-2 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                    <Text className="text-xs text-gray-500 mt-1">
                                        Current: {locationId || "None"} (from store: {selectedStore?.id || "N/A"})
                                    </Text>
                                </View>

                                <Button
                                    onPress={handleGetFloorPlans}
                                    disabled={loading.getFloorPlans || !locationId}
                                    className="bg-blue-600"
                                >
                                    <Text className="text-white font-semibold">
                                        {loading.getFloorPlans ? "Loading..." : "Get Floor Plans"}
                                    </Text>
                                </Button>

                                {floorPlans.length > 0 && (
                                    <View>
                                        <Text className="text-sm font-semibold text-gray-300 mb-2">
                                            Select Floor Plan ({floorPlans.length} available)
                                        </Text>
                                        <Select
                                            value={
                                                selectedFloorPlanId
                                                    ? {
                                                        value: selectedFloorPlanId,
                                                        label: floorPlans.find((fp) => fp.id === selectedFloorPlanId)?.name || "Select",
                                                    }
                                                    : undefined
                                            }
                                            onValueChange={(option) =>
                                                setSelectedFloorPlanId(option?.value || null)
                                            }
                                        >
                                            <SelectTrigger className="bg-[#303030] border-gray-600">
                                                <SelectValue
                                                    placeholder="Select floor plan"
                                                    className="text-white"
                                                />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#212121] border-gray-600">
                                                {floorPlans.map((fp) => (
                                                    <SelectItem
                                                        key={fp.id}
                                                        value={fp.id}
                                                        label={`${fp.name} ${fp.is_default ? "(Default)" : ""}`}
                                                    />
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </View>
                                )}

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Floor Plan Name
                                    </Text>
                                    <Input
                                        value={floorPlanName}
                                        onChangeText={setFloorPlanName}
                                        placeholder="Enter floor plan name"
                                        className="bg-[#303030] border-gray-600 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </View>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Description (Optional)
                                    </Text>
                                    <Input
                                        value={floorPlanDescription}
                                        onChangeText={setFloorPlanDescription}
                                        placeholder="Enter description"
                                        multiline
                                        numberOfLines={2}
                                        className="bg-[#303030] border-gray-600 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </View>

                                <Button
                                    onPress={handleCreateFloorPlan}
                                    disabled={loading.createFloorPlan || !locationId || !floorPlanName}
                                    className="bg-green-600"
                                >
                                    <Text className="text-white font-semibold">
                                        {loading.createFloorPlan ? "Creating..." : "Create Floor Plan"}
                                    </Text>
                                </Button>

                                <Button
                                    onPress={handleGetFloorPlanStatus}
                                    disabled={loading.getFloorPlanStatus || !selectedFloorPlanId}
                                    className="bg-purple-600"
                                >
                                    <Text className="text-white font-semibold">
                                        {loading.getFloorPlanStatus ? "Loading..." : "Get Floor Plan Status"}
                                    </Text>
                                </Button>

                                {tables.length > 0 && (
                                    <View className="mt-3 p-3 bg-blue-900/20 border border-blue-600 rounded-lg">
                                        <Text className="text-blue-400 text-sm font-semibold mb-2">
                                            Tables Loaded: {tables.length}
                                        </Text>
                                        <Text className="text-white text-xs">
                                            {tables.filter((t) => t.session).length} occupied,{" "}
                                            {tables.filter((t) => !t.session).length} available
                                        </Text>
                                    </View>
                                )}
                            </View>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>

                {/* Table Design Section */}
                <Accordion type="single" collapsible className="mb-4">
                    <AccordionItem value="table-design">
                        <AccordionTrigger className="py-3">
                            <Text className="text-xl font-bold text-white">
                                Table Design (Design Mode)
                            </Text>
                        </AccordionTrigger>
                        <AccordionContent>
                            <View className="space-y-4">
                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Table Shape
                                    </Text>
                                    <Select
                                        value={{
                                            value: selectedShapeId,
                                            label: `${TABLE_SHAPES[selectedShapeId]?.label || selectedShapeId} (Capacity: ${TABLE_SHAPES[selectedShapeId]?.capacity || 0})`,
                                        }}
                                        onValueChange={(option) =>
                                            setSelectedShapeId(option?.value as keyof typeof TABLE_SHAPES)
                                        }
                                    >
                                        <SelectTrigger className="bg-[#303030] border-gray-600">
                                            <SelectValue
                                                placeholder="Select shape"
                                                className="text-white"
                                            />
                                        </SelectTrigger>
                                        <SelectContent className="bg-[#212121] border-gray-600">
                                            {Object.entries(TABLE_SHAPES).map(([key, shape]) => (
                                                <SelectItem
                                                    key={key}
                                                    value={key}
                                                    label={`${shape.label} (Capacity: ${shape.capacity})`}
                                                />
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </View>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Table Name (Optional)
                                    </Text>
                                    <Input
                                        value={tableName}
                                        onChangeText={setTableName}
                                        placeholder="Auto-generated if empty"
                                        className="bg-[#303030] border-gray-600 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </View>

                                <View className="flex-row gap-3">
                                    <View className="flex-1">
                                        <Text className="text-sm font-semibold text-gray-300 mb-2">X Position</Text>
                                        <Input
                                            value={tableX}
                                            onChangeText={setTableX}
                                            placeholder="100"
                                            keyboardType="numeric"
                                            className="bg-[#303030] border-gray-600 text-white"
                                            placeholderTextColor="#9CA3AF"
                                        />
                                    </View>
                                    <View className="flex-1">
                                        <Text className="text-sm font-semibold text-gray-300 mb-2">Y Position</Text>
                                        <Input
                                            value={tableY}
                                            onChangeText={setTableY}
                                            placeholder="100"
                                            keyboardType="numeric"
                                            className="bg-[#303030] border-gray-600 text-white"
                                            placeholderTextColor="#9CA3AF"
                                        />
                                    </View>
                                    <View className="flex-1">
                                        <Text className="text-sm font-semibold text-gray-300 mb-2">Rotation</Text>
                                        <Input
                                            value={tableRotation}
                                            onChangeText={setTableRotation}
                                            placeholder="0"
                                            keyboardType="numeric"
                                            className="bg-[#303030] border-gray-600 text-white"
                                            placeholderTextColor="#9CA3AF"
                                        />
                                    </View>
                                </View>

                                <Button
                                    onPress={handleAddTable}
                                    disabled={loading.addTable || !selectedFloorPlanId}
                                    className="bg-green-600"
                                >
                                    <Text className="text-white font-semibold">
                                        {loading.addTable ? "Adding..." : "Add Table"}
                                    </Text>
                                </Button>

                                {tables.length > 0 && (
                                    <View>
                                        <Text className="text-sm font-semibold text-gray-300 mb-2">
                                            Select Table ({tables.length} available)
                                        </Text>
                                        <Select
                                            value={
                                                selectedTableId
                                                    ? {
                                                        value: selectedTableId,
                                                        label: tables.find((t) => t.id === selectedTableId)?.name || "Select",
                                                    }
                                                    : undefined
                                            }
                                            onValueChange={(option) => {
                                                setSelectedTableId(option?.value || null);
                                                const table = tables.find((t) => t.id === option?.value);
                                                if (table) {
                                                    setTableX(table.x.toString());
                                                    setTableY(table.y.toString());
                                                    setTableRotation(table.rotation.toString());
                                                    setTableName(table.name);
                                                }
                                            }}
                                        >
                                            <SelectTrigger className="bg-[#303030] border-gray-600">
                                                <SelectValue
                                                    placeholder="Select table"
                                                    className="text-white"
                                                />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#212121] border-gray-600">
                                                {tables.map((table) => (
                                                    <SelectItem
                                                        key={table.id}
                                                        value={table.id}
                                                        label={`${table.name} (${table.shape_id})`}
                                                    />
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </View>
                                )}

                                <Button
                                    onPress={handleUpdateTablePosition}
                                    disabled={loading.updateTablePosition || !selectedTableId}
                                    className="bg-orange-600"
                                >
                                    <Text className="text-white font-semibold">
                                        {loading.updateTablePosition ? "Updating..." : "Update Position"}
                                    </Text>
                                </Button>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Batch Updates (JSON Array)
                                    </Text>
                                    <TextInput
                                        value={batchUpdates}
                                        onChangeText={setBatchUpdates}
                                        placeholder='[{"id": "uuid", "x": 100, "y": 200, "rotation": 0}]'
                                        multiline
                                        numberOfLines={4}
                                        className="bg-[#303030] border border-gray-600 rounded-lg px-3 py-2 text-white font-mono text-xs"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </View>

                                <Button
                                    onPress={handleUpdateTablePositionsBatch}
                                    disabled={loading.updateTablePositionsBatch || !batchUpdates}
                                    className="bg-indigo-600"
                                >
                                    <Text className="text-white font-semibold">
                                        {loading.updateTablePositionsBatch ? "Updating..." : "Batch Update Positions"}
                                    </Text>
                                </Button>

                                <Button
                                    onPress={handleRemoveTable}
                                    disabled={loading.removeTable || !selectedTableId}
                                    className="bg-red-600"
                                >
                                    <Text className="text-white font-semibold">
                                        {loading.removeTable ? "Removing..." : "Remove Table"}
                                    </Text>
                                </Button>
                            </View>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>

                {/* Table Sessions Section */}
                <Accordion type="single" collapsible className="mb-4">
                    <AccordionItem value="table-sessions">
                        <AccordionTrigger className="py-3">
                            <Text className="text-xl font-bold text-white">
                                Table Sessions (Service Mode)
                            </Text>
                        </AccordionTrigger>
                        <AccordionContent>
                            <View className="space-y-4">
                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Table IDs (comma-separated or select from list)
                                    </Text>
                                    {tables.length > 0 && (
                                        <View className="mb-2">
                                            <Text className="text-xs text-gray-400 mb-1">
                                                Available Tables:
                                            </Text>
                                            <ScrollView horizontal className="mb-2">
                                                <View className="flex-row gap-2">
                                                    {tables.filter((t) => !t.session).map((table) => (
                                                        <TouchableOpacity
                                                            key={table.id}
                                                            onPress={() => {
                                                                let newIds: string[];
                                                                if (selectedTableIds.includes(table.id)) {
                                                                    newIds = selectedTableIds.filter((id) => id !== table.id);
                                                                } else {
                                                                    newIds = [...selectedTableIds, table.id];
                                                                }
                                                                setSelectedTableIds(newIds);
                                                                setTableIdsInput(newIds.join(", "));
                                                            }}
                                                            className={`px-3 py-1 rounded border ${selectedTableIds.includes(table.id)
                                                                ? "bg-blue-600 border-blue-400"
                                                                : "bg-[#1a1a1a] border-gray-700"
                                                                }`}
                                                        >
                                                            <Text className={`text-xs ${selectedTableIds.includes(table.id) ? "text-white" : "text-gray-300"
                                                                }`}>
                                                                {table.name}
                                                            </Text>
                                                        </TouchableOpacity>
                                                    ))}
                                                </View>
                                            </ScrollView>
                                        </View>
                                    )}
                                    <Input
                                        value={tableIdsInput}
                                        onChangeText={(text) => {
                                            setTableIdsInput(text);
                                            setSelectedTableIds(
                                                text.split(",").map((id) => id.trim()).filter(Boolean)
                                            );
                                        }}
                                        placeholder="table-id-1, table-id-2 or click tables above"
                                        className="bg-[#303030] border-gray-600 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                    {selectedTableIds.length > 0 && (
                                        <Text className="text-xs text-green-400 mt-1">
                                            {selectedTableIds.length} table(s) selected
                                        </Text>
                                    )}
                                </View>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Party Size
                                    </Text>
                                    <Input
                                        value={partySize}
                                        onChangeText={setPartySize}
                                        placeholder="2"
                                        keyboardType="numeric"
                                        className="bg-[#303030] border-gray-600 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </View>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Guest Name (Optional)
                                    </Text>
                                    <Input
                                        value={guestName}
                                        onChangeText={setGuestName}
                                        placeholder="John Doe"
                                        className="bg-[#303030] border-gray-600 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </View>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Guest Phone (Optional)
                                    </Text>
                                    <Input
                                        value={guestPhone}
                                        onChangeText={setGuestPhone}
                                        placeholder="+1234567890"
                                        keyboardType="phone-pad"
                                        className="bg-[#303030] border-gray-600 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </View>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Guest Notes (Optional)
                                    </Text>
                                    <Input
                                        value={guestNotes}
                                        onChangeText={setGuestNotes}
                                        placeholder="Special requests"
                                        multiline
                                        numberOfLines={2}
                                        className="bg-[#303030] border-gray-600 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </View>

                                <Button
                                    onPress={handleSeatGuests}
                                    disabled={loading.seatGuests || !selectedTableIds.length}
                                    className="bg-green-600"
                                >
                                    <Text className="text-white font-semibold">
                                        {loading.seatGuests ? "Seating..." : "Seat Guests"}
                                    </Text>
                                </Button>

                                {sessions.length > 0 && (
                                    <View>
                                        <Text className="text-sm font-semibold text-gray-300 mb-2">
                                            Select Session ({sessions.length} available)
                                        </Text>
                                        <Select
                                            value={
                                                selectedSessionId
                                                    ? {
                                                        value: selectedSessionId,
                                                        label: sessions.find((s) => s.id === selectedSessionId)?.session_number || "Select",
                                                    }
                                                    : undefined
                                            }
                                            onValueChange={(option) =>
                                                setSelectedSessionId(option?.value || null)
                                            }
                                        >
                                            <SelectTrigger className="bg-[#303030] border-gray-600">
                                                <SelectValue
                                                    placeholder="Select session"
                                                    className="text-white"
                                                />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#212121] border-gray-600">
                                                {sessions.map((session) => (
                                                    <SelectItem
                                                        key={session.id}
                                                        value={session.id}
                                                        label={`${session.session_number} - ${session.guest_name || "Guest"} (${session.status})`}
                                                    />
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </View>
                                )}

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Session Status
                                    </Text>
                                    <Select
                                        value={{
                                            value: sessionStatus,
                                            label: sessionStatus.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase()),
                                        }}
                                        onValueChange={(option) =>
                                            setSessionStatus(option?.value as TableStatus)
                                        }
                                    >
                                        <SelectTrigger className="bg-[#303030] border-gray-600">
                                            <SelectValue
                                                placeholder="Select status"
                                                className="text-white"
                                            />
                                        </SelectTrigger>
                                        <SelectContent className="bg-[#212121] border-gray-600">
                                            <SelectItem value="available" label="Available" />
                                            <SelectItem value="reserved" label="Reserved" />
                                            <SelectItem value="seated" label="Seated" />
                                            <SelectItem value="ordered" label="Ordered" />
                                            <SelectItem value="served" label="Served" />
                                            <SelectItem value="check_presented" label="Check Presented" />
                                            <SelectItem value="paid" label="Paid" />
                                            <SelectItem value="cleaning" label="Cleaning" />
                                            <SelectItem value="blocked" label="Blocked" />
                                            <SelectItem value="not_in_service" label="Not In Service" />
                                        </SelectContent>
                                    </Select>
                                </View>

                                <Button
                                    onPress={handleUpdateSessionStatus}
                                    disabled={loading.updateSessionStatus || !selectedSessionId}
                                    className="bg-blue-600"
                                >
                                    <Text className="text-white font-semibold">
                                        {loading.updateSessionStatus ? "Updating..." : "Update Session Status"}
                                    </Text>
                                </Button>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        New Table IDs (comma-separated)
                                    </Text>
                                    <Input
                                        value={newTableIds}
                                        onChangeText={setNewTableIds}
                                        placeholder="table-id-1, table-id-2"
                                        className="bg-[#303030] border-gray-600 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </View>

                                <Button
                                    onPress={handleTransferSession}
                                    disabled={loading.transferSession || !selectedSessionId || !newTableIds}
                                    className="bg-purple-600"
                                >
                                    <Text className="text-white font-semibold">
                                        {loading.transferSession ? "Transferring..." : "Transfer Session"}
                                    </Text>
                                </Button>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Table ID to Merge
                                    </Text>
                                    <Input
                                        value={tableToMerge}
                                        onChangeText={setTableToMerge}
                                        placeholder="Enter table ID"
                                        className="bg-[#303030] border-gray-600 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </View>

                                <Button
                                    onPress={handleMergeTable}
                                    disabled={loading.mergeTable || !selectedSessionId || !tableToMerge}
                                    className="bg-teal-600"
                                >
                                    <Text className="text-white font-semibold">
                                        {loading.mergeTable ? "Merging..." : "Merge Table"}
                                    </Text>
                                </Button>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Table ID to Unmerge
                                    </Text>
                                    <Input
                                        value={tableToUnmerge}
                                        onChangeText={setTableToUnmerge}
                                        placeholder="Enter table ID"
                                        className="bg-[#303030] border-gray-600 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </View>

                                <Button
                                    onPress={handleUnmergeTable}
                                    disabled={loading.unmergeTable || !selectedSessionId || !tableToUnmerge}
                                    className="bg-cyan-600"
                                >
                                    <Text className="text-white font-semibold">
                                        {loading.unmergeTable ? "Unmerging..." : "Unmerge Table"}
                                    </Text>
                                </Button>

                                <Button
                                    onPress={handleAdvanceCourse}
                                    disabled={loading.advanceCourse || !selectedSessionId}
                                    className="bg-yellow-600"
                                >
                                    <Text className="text-white font-semibold">
                                        {loading.advanceCourse ? "Advancing..." : "Advance Course"}
                                    </Text>
                                </Button>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Order ID to Link
                                    </Text>
                                    <Input
                                        value={orderIdToLink}
                                        onChangeText={setOrderIdToLink}
                                        placeholder="Enter order ID"
                                        className="bg-[#303030] border-gray-600 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </View>

                                <Button
                                    onPress={handleLinkOrder}
                                    disabled={loading.linkOrder || !selectedSessionId || !orderIdToLink}
                                    className="bg-pink-600"
                                >
                                    <Text className="text-white font-semibold">
                                        {loading.linkOrder ? "Linking..." : "Link Order"}
                                    </Text>
                                </Button>
                            </View>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>

                {/* Waitlist Operations Section */}
                <Accordion type="single" collapsible className="mb-4">
                    <AccordionItem value="waitlist">
                        <AccordionTrigger className="py-3">
                            <Text className="text-xl font-bold text-white">
                                Waitlist Operations
                            </Text>
                        </AccordionTrigger>
                        <AccordionContent>
                            <View className="space-y-4">
                                <Button
                                    onPress={handleGetWaitlist}
                                    disabled={loading.getWaitlist || !locationId}
                                    className="bg-blue-600"
                                >
                                    <Text className="text-white font-semibold">
                                        {loading.getWaitlist ? "Loading..." : "Get Waitlist"}
                                    </Text>
                                </Button>

                                {waitlistEntries.length > 0 && (
                                    <View className="p-3 bg-blue-900/20 border border-blue-600 rounded-lg">
                                        <Text className="text-blue-400 text-sm font-semibold mb-2">
                                            Waitlist Entries ({waitlistEntries.length})
                                        </Text>
                                        {waitlistEntries.slice(0, 5).map((entry) => (
                                            <Text key={entry.id} className="text-white text-xs mb-1">
                                                • {entry.party_name} - Party of {entry.party_size} - Position {entry.position} - {entry.status}
                                            </Text>
                                        ))}
                                        {waitlistEntries.length > 5 && (
                                            <Text className="text-gray-400 text-xs">
                                                ...and {waitlistEntries.length - 5} more
                                            </Text>
                                        )}
                                    </View>
                                )}

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Party Name
                                    </Text>
                                    <Input
                                        value={waitlistPartyName}
                                        onChangeText={setWaitlistPartyName}
                                        placeholder="Enter party name"
                                        className="bg-[#303030] border-gray-600 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </View>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Party Size
                                    </Text>
                                    <Input
                                        value={waitlistPartySize}
                                        onChangeText={setWaitlistPartySize}
                                        placeholder="2"
                                        keyboardType="numeric"
                                        className="bg-[#303030] border-gray-600 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </View>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Phone (Optional)
                                    </Text>
                                    <Input
                                        value={waitlistPhone}
                                        onChangeText={setWaitlistPhone}
                                        placeholder="+1234567890"
                                        keyboardType="phone-pad"
                                        className="bg-[#303030] border-gray-600 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </View>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Notes (Optional)
                                    </Text>
                                    <Input
                                        value={waitlistNotes}
                                        onChangeText={setWaitlistNotes}
                                        placeholder="Special requests"
                                        multiline
                                        numberOfLines={2}
                                        className="bg-[#303030] border-gray-600 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </View>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Preferred Section (Optional)
                                    </Text>
                                    <Input
                                        value={preferredSection}
                                        onChangeText={setPreferredSection}
                                        placeholder="patio, bar, etc."
                                        className="bg-[#303030] border-gray-600 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </View>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Quoted Wait Minutes (Optional)
                                    </Text>
                                    <Input
                                        value={quotedWaitMinutes}
                                        onChangeText={setQuotedWaitMinutes}
                                        placeholder="25"
                                        keyboardType="numeric"
                                        className="bg-[#303030] border-gray-600 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </View>

                                <Button
                                    onPress={handleAddToWaitlist}
                                    disabled={loading.addToWaitlist || !locationId || !waitlistPartyName}
                                    className="bg-green-600"
                                >
                                    <Text className="text-white font-semibold">
                                        {loading.addToWaitlist ? "Adding..." : "Add to Waitlist"}
                                    </Text>
                                </Button>

                                {waitlistEntries.length > 0 && (
                                    <View>
                                        <Text className="text-sm font-semibold text-gray-300 mb-2">
                                            Select Waitlist Entry
                                        </Text>
                                        <Select
                                            value={
                                                selectedWaitlistId
                                                    ? {
                                                        value: selectedWaitlistId,
                                                        label: waitlistEntries.find((w) => w.id === selectedWaitlistId)?.party_name || "Select",
                                                    }
                                                    : undefined
                                            }
                                            onValueChange={(option) =>
                                                setSelectedWaitlistId(option?.value || null)
                                            }
                                        >
                                            <SelectTrigger className="bg-[#303030] border-gray-600">
                                                <SelectValue
                                                    placeholder="Select waitlist entry"
                                                    className="text-white"
                                                />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#212121] border-gray-600">
                                                {waitlistEntries.map((entry) => (
                                                    <SelectItem
                                                        key={entry.id}
                                                        value={entry.id}
                                                        label={`${entry.party_name} - Position ${entry.position} - ${entry.status}`}
                                                    />
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </View>
                                )}

                                <Button
                                    onPress={handleNotifyWaitlist}
                                    disabled={loading.notifyWaitlist || !selectedWaitlistId}
                                    className="bg-yellow-600"
                                >
                                    <Text className="text-white font-semibold">
                                        {loading.notifyWaitlist ? "Notifying..." : "Notify Party"}
                                    </Text>
                                </Button>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Waitlist Status
                                    </Text>
                                    <Select
                                        value={{
                                            value: waitlistStatus,
                                            label: waitlistStatus.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase()),
                                        }}
                                        onValueChange={(option) =>
                                            setWaitlistStatus(option?.value as WaitlistEntry['status'])
                                        }
                                    >
                                        <SelectTrigger className="bg-[#303030] border-gray-600">
                                            <SelectValue
                                                placeholder="Select status"
                                                className="text-white"
                                            />
                                        </SelectTrigger>
                                        <SelectContent className="bg-[#212121] border-gray-600">
                                            <SelectItem value="waiting" label="Waiting" />
                                            <SelectItem value="notified" label="Notified" />
                                            <SelectItem value="arrived" label="Arrived" />
                                            <SelectItem value="seated" label="Seated" />
                                            <SelectItem value="no_show" label="No Show" />
                                            <SelectItem value="cancelled" label="Cancelled" />
                                            <SelectItem value="expired" label="Expired" />
                                        </SelectContent>
                                    </Select>
                                </View>

                                <Button
                                    onPress={handleUpdateWaitlistStatus}
                                    disabled={loading.updateWaitlistStatus || !selectedWaitlistId}
                                    className="bg-orange-600"
                                >
                                    <Text className="text-white font-semibold">
                                        {loading.updateWaitlistStatus ? "Updating..." : "Update Waitlist Status"}
                                    </Text>
                                </Button>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Table IDs for Seating (comma-separated)
                                    </Text>
                                    <Input
                                        value={tableIdsInput}
                                        onChangeText={(text) => {
                                            setTableIdsInput(text);
                                            setSelectedTableIds(
                                                text.split(",").map((id) => id.trim()).filter(Boolean)
                                            );
                                        }}
                                        placeholder="table-id-1, table-id-2"
                                        className="bg-[#303030] border-gray-600 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </View>

                                <Button
                                    onPress={handleSeatFromWaitlist}
                                    disabled={loading.seatFromWaitlist || !selectedWaitlistId || !selectedTableIds.length}
                                    className="bg-emerald-600"
                                >
                                    <Text className="text-white font-semibold">
                                        {loading.seatFromWaitlist ? "Seating..." : "Seat from Waitlist"}
                                    </Text>
                                </Button>
                            </View>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>

                {/* Reservation Operations Section */}
                <Accordion type="single" collapsible className="mb-4">
                    <AccordionItem value="reservations">
                        <AccordionTrigger className="py-3">
                            <Text className="text-xl font-bold text-white">
                                Reservation Operations
                            </Text>
                        </AccordionTrigger>
                        <AccordionContent>
                            <View className="space-y-4">
                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Date (YYYY-MM-DD)
                                    </Text>
                                    <Input
                                        value={checkDate}
                                        onChangeText={setCheckDate}
                                        placeholder={new Date().toISOString().split("T")[0]}
                                        className="bg-[#303030] border-gray-600 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </View>

                                <Button
                                    onPress={handleGetReservations}
                                    disabled={loading.getReservations || !locationId}
                                    className="bg-blue-600"
                                >
                                    <Text className="text-white font-semibold">
                                        {loading.getReservations ? "Loading..." : "Get Reservations"}
                                    </Text>
                                </Button>

                                {reservations.length > 0 && (
                                    <View className="p-3 bg-blue-900/20 border border-blue-600 rounded-lg">
                                        <Text className="text-blue-400 text-sm font-semibold mb-2">
                                            Reservations ({reservations.length})
                                        </Text>
                                        {reservations.slice(0, 5).map((res) => (
                                            <Text key={res.id} className="text-white text-xs mb-1">
                                                • {res.party_name} - {res.reservation_time} - Party of {res.party_size} - {res.status}
                                            </Text>
                                        ))}
                                        {reservations.length > 5 && (
                                            <Text className="text-gray-400 text-xs">
                                                ...and {reservations.length - 5} more
                                            </Text>
                                        )}
                                    </View>
                                )}

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Party Name *
                                    </Text>
                                    <Input
                                        value={reservationPartyName}
                                        onChangeText={setReservationPartyName}
                                        placeholder="Enter party name"
                                        className="bg-[#303030] border-gray-600 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </View>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Party Size *
                                    </Text>
                                    <Input
                                        value={reservationPartySize}
                                        onChangeText={setReservationPartySize}
                                        placeholder="2"
                                        keyboardType="numeric"
                                        className="bg-[#303030] border-gray-600 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </View>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Phone *
                                    </Text>
                                    <Input
                                        value={reservationPhone}
                                        onChangeText={setReservationPhone}
                                        placeholder="+1234567890"
                                        keyboardType="phone-pad"
                                        className="bg-[#303030] border-gray-600 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </View>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Email (Optional)
                                    </Text>
                                    <Input
                                        value={reservationEmail}
                                        onChangeText={setReservationEmail}
                                        placeholder="email@example.com"
                                        keyboardType="email-address"
                                        className="bg-[#303030] border-gray-600 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </View>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Date (YYYY-MM-DD) *
                                    </Text>
                                    <Input
                                        value={reservationDate}
                                        onChangeText={setReservationDate}
                                        placeholder="2024-12-20"
                                        className="bg-[#303030] border-gray-600 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </View>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Time (HH:MM) *
                                    </Text>
                                    <Input
                                        value={reservationTime}
                                        onChangeText={setReservationTime}
                                        placeholder="19:00"
                                        className="bg-[#303030] border-gray-600 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </View>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Notes (Optional)
                                    </Text>
                                    <Input
                                        value={reservationNotes}
                                        onChangeText={setReservationNotes}
                                        placeholder="Special requests"
                                        multiline
                                        numberOfLines={2}
                                        className="bg-[#303030] border-gray-600 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </View>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Special Requests (Optional)
                                    </Text>
                                    <Input
                                        value={specialRequests}
                                        onChangeText={setSpecialRequests}
                                        placeholder="Dietary restrictions, etc."
                                        multiline
                                        numberOfLines={2}
                                        className="bg-[#303030] border-gray-600 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </View>

                                <View className="flex-row items-center gap-3 p-3 bg-[#1a1a1a] rounded-lg border border-gray-700">
                                    <Checkbox
                                        id="is-vip"
                                        checked={isVip}
                                        onCheckedChange={setIsVip}
                                        className="border-blue-400"
                                    />
                                    <Text className="text-white text-sm font-medium">
                                        VIP Reservation
                                    </Text>
                                </View>

                                <Button
                                    onPress={handleCreateReservation}
                                    disabled={loading.createReservation || !locationId || !reservationPartyName || !reservationPhone || !reservationDate || !reservationTime}
                                    className="bg-green-600"
                                >
                                    <Text className="text-white font-semibold">
                                        {loading.createReservation ? "Creating..." : "Create Reservation"}
                                    </Text>
                                </Button>

                                {reservations.length > 0 && (
                                    <View>
                                        <Text className="text-sm font-semibold text-gray-300 mb-2">
                                            Select Reservation
                                        </Text>
                                        <Select
                                            value={
                                                selectedReservationId
                                                    ? {
                                                        value: selectedReservationId,
                                                        label: reservations.find((r) => r.id === selectedReservationId)?.party_name || "Select",
                                                    }
                                                    : undefined
                                            }
                                            onValueChange={(option) =>
                                                setSelectedReservationId(option?.value || null)
                                            }
                                        >
                                            <SelectTrigger className="bg-[#303030] border-gray-600">
                                                <SelectValue
                                                    placeholder="Select reservation"
                                                    className="text-white"
                                                />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#212121] border-gray-600">
                                                {reservations.map((res) => (
                                                    <SelectItem
                                                        key={res.id}
                                                        value={res.id}
                                                        label={`${res.party_name} - ${res.reservation_time} - ${res.status}`}
                                                    />
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </View>
                                )}

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Reservation Status
                                    </Text>
                                    <Select
                                        value={{
                                            value: reservationStatus,
                                            label: reservationStatus.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase()),
                                        }}
                                        onValueChange={(option) =>
                                            setReservationStatus(option?.value as Reservation['status'])
                                        }
                                    >
                                        <SelectTrigger className="bg-[#303030] border-gray-600">
                                            <SelectValue
                                                placeholder="Select status"
                                                className="text-white"
                                            />
                                        </SelectTrigger>
                                        <SelectContent className="bg-[#212121] border-gray-600">
                                            <SelectItem value="pending" label="Pending" />
                                            <SelectItem value="confirmed" label="Confirmed" />
                                            <SelectItem value="reminded" label="Reminded" />
                                            <SelectItem value="arrived" label="Arrived" />
                                            <SelectItem value="seated" label="Seated" />
                                            <SelectItem value="completed" label="Completed" />
                                            <SelectItem value="no_show" label="No Show" />
                                            <SelectItem value="cancelled" label="Cancelled" />
                                        </SelectContent>
                                    </Select>
                                </View>

                                <Button
                                    onPress={handleUpdateReservationStatus}
                                    disabled={loading.updateReservationStatus || !selectedReservationId}
                                    className="bg-orange-600"
                                >
                                    <Text className="text-white font-semibold">
                                        {loading.updateReservationStatus ? "Updating..." : "Update Reservation Status"}
                                    </Text>
                                </Button>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">
                                        Table IDs to Assign (comma-separated)
                                    </Text>
                                    <Input
                                        value={reservationTableIds}
                                        onChangeText={setReservationTableIds}
                                        placeholder="table-id-1, table-id-2"
                                        className="bg-[#303030] border-gray-600 text-white"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </View>

                                <Button
                                    onPress={handleAssignReservationTables}
                                    disabled={loading.assignReservationTables || !selectedReservationId || !reservationTableIds}
                                    className="bg-indigo-600"
                                >
                                    <Text className="text-white font-semibold">
                                        {loading.assignReservationTables ? "Assigning..." : "Assign Reservation Tables"}
                                    </Text>
                                </Button>

                                <Button
                                    onPress={handleSeatReservation}
                                    disabled={loading.seatReservation || !selectedReservationId}
                                    className="bg-emerald-600"
                                >
                                    <Text className="text-white font-semibold">
                                        {loading.seatReservation ? "Seating..." : "Seat Reservation"}
                                    </Text>
                                </Button>

                                <View className="border-t border-gray-700 pt-4">
                                    <Text className="text-lg font-bold text-white mb-3">
                                        Check Availability
                                    </Text>
                                    <View>
                                        <Text className="text-sm font-semibold text-gray-300 mb-2">
                                            Date (YYYY-MM-DD)
                                        </Text>
                                        <Input
                                            value={checkDate}
                                            onChangeText={setCheckDate}
                                            placeholder={new Date().toISOString().split("T")[0]}
                                            className="bg-[#303030] border-gray-600 text-white"
                                            placeholderTextColor="#9CA3AF"
                                        />
                                    </View>
                                    <View>
                                        <Text className="text-sm font-semibold text-gray-300 mb-2">
                                            Time (HH:MM)
                                        </Text>
                                        <Input
                                            value={checkTime}
                                            onChangeText={setCheckTime}
                                            placeholder="19:00"
                                            className="bg-[#303030] border-gray-600 text-white"
                                            placeholderTextColor="#9CA3AF"
                                        />
                                    </View>
                                    <View>
                                        <Text className="text-sm font-semibold text-gray-300 mb-2">
                                            Party Size
                                        </Text>
                                        <Input
                                            value={checkPartySize}
                                            onChangeText={setCheckPartySize}
                                            placeholder="2"
                                            keyboardType="numeric"
                                            className="bg-[#303030] border-gray-600 text-white"
                                            placeholderTextColor="#9CA3AF"
                                        />
                                    </View>
                                    <Button
                                        onPress={handleCheckAvailability}
                                        disabled={loading.checkAvailability || !locationId || !checkDate || !checkTime}
                                        className="bg-purple-600 mt-2"
                                    >
                                        <Text className="text-white font-semibold">
                                            {loading.checkAvailability ? "Checking..." : "Check Availability"}
                                        </Text>
                                    </Button>
                                </View>
                            </View>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>

                {/* Order & Coursing Testing Section */}
                <Accordion type="single" collapsible className="mb-4">
                    <AccordionItem value="order-coursing">
                        <AccordionTrigger className="py-3">
                            <Text className="text-xl font-bold text-white">
                                Order & Coursing Testing
                            </Text>
                        </AccordionTrigger>
                        <AccordionContent>
                            <View className="space-y-4">
                                {/* Order Creation & Linking */}
                                <View className="border-b border-gray-700 pb-4">
                                    <Text className="text-lg font-bold text-white mb-3">
                                        Order Creation & Linking
                                    </Text>

                                    {sessions.length > 0 && (
                                        <View className="mb-3">
                                            <Text className="text-sm font-semibold text-gray-300 mb-2">
                                                Select Table Session
                                            </Text>
                                            <Select
                                                value={
                                                    selectedSessionId
                                                        ? {
                                                            value: selectedSessionId,
                                                            label: sessions.find((s) => s.id === selectedSessionId)?.session_number || "Select",
                                                        }
                                                        : undefined
                                                }
                                                onValueChange={(option) => {
                                                    setSelectedSessionId(option?.value || null);
                                                    const session = sessions.find((s) => s.id === option?.value);
                                                    if (session?.order_id) {
                                                        // Auto-select order if session has one
                                                        setSelectedOrderId(session.order_id);
                                                    }
                                                }}
                                            >
                                                <SelectTrigger className="bg-[#303030] border-gray-600">
                                                    <SelectValue
                                                        placeholder="Select session"
                                                        className="text-white"
                                                    />
                                                </SelectTrigger>
                                                <SelectContent className="bg-[#212121] border-gray-600">
                                                    {sessions.map((session) => (
                                                        <SelectItem
                                                            key={session.id}
                                                            value={session.id}
                                                            label={`${session.session_number} - ${session.guest_name || "Guest"} ${session.order_id ? "(Has Order)" : ""}`}
                                                        />
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </View>
                                    )}

                                    <View className="flex-row gap-2 mb-3">
                                        <Button
                                            onPress={handleCreateOrderForSession}
                                            disabled={loading.createOrderForSession || !selectedSessionId}
                                            className="flex-1 bg-green-600"
                                        >
                                            <Text className="text-white font-semibold text-xs">
                                                {loading.createOrderForSession ? "Creating..." : "Create Order"}
                                            </Text>
                                        </Button>

                                        <Button
                                            onPress={handleLinkOrderToSession}
                                            disabled={loading.linkOrderToSession || !selectedOrderId || !selectedSessionId}
                                            className="flex-1 bg-blue-600"
                                        >
                                            <Text className="text-white font-semibold text-xs">
                                                {loading.linkOrderToSession ? "Linking..." : "Link Order"}
                                            </Text>
                                        </Button>
                                    </View>

                                    {/* Order Selection */}
                                    <View>
                                        <Text className="text-sm font-semibold text-gray-300 mb-2">
                                            Select Order
                                        </Text>
                                        <Select
                                            value={
                                                selectedOrderId
                                                    ? {
                                                        value: selectedOrderId,
                                                        label: orderStore.getOrder(selectedOrderId)?.id || "Select",
                                                    }
                                                    : undefined
                                            }
                                            onValueChange={(option) => setSelectedOrderId(option?.value || null)}
                                        >
                                            <SelectTrigger className="bg-[#303030] border-gray-600">
                                                <SelectValue
                                                    placeholder="Select order"
                                                    className="text-white"
                                                />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#212121] border-gray-600">
                                                {orderStore.orderIds.map((orderId) => {
                                                    const order = orderStore.getOrder(orderId);
                                                    return (
                                                        <SelectItem
                                                            key={orderId}
                                                            value={orderId}
                                                            label={`${order?.id || orderId} - Table: ${order?.service_location_id || "N/A"} - $${order?.total_amount?.toFixed(2) || "0.00"}`}
                                                        />
                                                    );
                                                })}
                                            </SelectContent>
                                        </Select>
                                    </View>

                                    {/* Order Summary */}
                                    {selectedOrderId && (() => {
                                        const orderInfo = getOrderDisplayInfo(selectedOrderId);
                                        if (!orderInfo) return null;
                                        return (
                                            <View className="mt-3 p-3 bg-blue-900/20 border border-blue-600 rounded-lg">
                                                <Text className="text-blue-400 text-sm font-semibold mb-2">
                                                    Order Summary
                                                </Text>
                                                <Text className="text-white text-xs mb-1">
                                                    ID: {orderInfo.id}
                                                </Text>
                                                <Text className="text-white text-xs mb-1">
                                                    Table: {orderInfo.tableId || "N/A"}
                                                </Text>
                                                <Text className="text-white text-xs mb-1">
                                                    Status: {orderInfo.status}
                                                </Text>
                                                <Text className="text-white text-xs mb-1">
                                                    Subtotal: ${orderInfo.subtotal.toFixed(2)}
                                                </Text>
                                                <Text className="text-white text-xs mb-1">
                                                    Tax: ${orderInfo.tax.toFixed(2)}
                                                </Text>
                                                <Text className="text-white text-xs mb-1">
                                                    Total: ${orderInfo.total.toFixed(2)}
                                                </Text>
                                                <Text className="text-white text-xs mb-1">
                                                    Paid: ${orderInfo.amountPaid.toFixed(2)} | Due: ${orderInfo.amountDue.toFixed(2)}
                                                </Text>
                                                <Text className="text-white text-xs mb-1">
                                                    Working Course: {orderInfo.workingCourse} | Total Courses: {orderInfo.courseCount}
                                                </Text>
                                                <Text className="text-white text-xs">
                                                    Items: {orderInfo.itemCount}
                                                </Text>
                                            </View>
                                        );
                                    })()}
                                </View>

                                {/* Working Course Management */}
                                <View className="border-b border-gray-700 pb-4">
                                    <Text className="text-lg font-bold text-white mb-3">
                                        Working Course Management
                                    </Text>

                                    {selectedOrderId && (() => {
                                        const order = orderStore.getOrder(selectedOrderId);
                                        if (!order) return null;
                                        return (
                                            <View className="mb-3 p-3 bg-gray-800 rounded-lg">
                                                <Text className="text-white text-sm font-semibold mb-1">
                                                    Current Working Course: {order.working_course}
                                                </Text>
                                                <Text className="text-gray-400 text-xs">
                                                    Status: {order.courses[order.working_course]?.status || "open"}
                                                </Text>
                                            </View>
                                        );
                                    })()}

                                    <View className="flex-row gap-2 mb-3">
                                        <View className="flex-1">
                                            <Text className="text-sm font-semibold text-gray-300 mb-2">
                                                Course Number
                                            </Text>
                                            <Input
                                                value={selectedCourseNumber}
                                                onChangeText={setSelectedCourseNumber}
                                                placeholder="1"
                                                keyboardType="numeric"
                                                className="bg-[#303030] border-gray-600 text-white"
                                                placeholderTextColor="#9CA3AF"
                                            />
                                        </View>
                                        <View className="flex-1 justify-end">
                                            <Button
                                                onPress={handleSetWorkingCourse}
                                                disabled={loading.setWorkingCourse || !selectedOrderId}
                                                className="bg-purple-600"
                                            >
                                                <Text className="text-white font-semibold text-xs">
                                                    {loading.setWorkingCourse ? "Setting..." : "Set Working Course"}
                                                </Text>
                                            </Button>
                                        </View>
                                    </View>

                                    <Button
                                        onPress={handleCreateNextCourse}
                                        disabled={loading.createNextCourse || !selectedOrderId}
                                        className="bg-indigo-600"
                                    >
                                        <Text className="text-white font-semibold">
                                            {loading.createNextCourse ? "Creating..." : "Create Next Course"}
                                        </Text>
                                    </Button>

                                    {/* Courses Overview */}
                                    {selectedOrderId && (() => {
                                        const coursesInfo = getCoursesDisplayInfo(selectedOrderId);
                                        if (coursesInfo.length === 0) return null;
                                        return (
                                            <View className="mt-3">
                                                <Text className="text-sm font-semibold text-gray-300 mb-2">
                                                    Courses Overview
                                                </Text>
                                                {coursesInfo.map((course) => {
                                                    const isOpen = course.status === "open";
                                                    const isFired = course.status === "fired";
                                                    const isServed = course.status === "served";
                                                    return (
                                                        <View
                                                            key={course.courseNumber}
                                                            className={`mb-2 p-2 rounded border ${isOpen ? "border-green-600 bg-green-900/20" :
                                                                isFired ? "border-yellow-600 bg-yellow-900/20" :
                                                                    "border-blue-600 bg-blue-900/20"
                                                                }`}
                                                        >
                                                            <Text className={`text-xs font-semibold ${isOpen ? "text-green-400" :
                                                                isFired ? "text-yellow-400" :
                                                                    "text-blue-400"
                                                                }`}>
                                                                Course {course.courseNumber} - {course.status.toUpperCase()}
                                                            </Text>
                                                            <Text className="text-white text-xs">
                                                                Items: {course.itemCount}
                                                            </Text>
                                                            {course.firedAt && (
                                                                <Text className="text-gray-400 text-xs">
                                                                    Fired: {course.firedAt}
                                                                </Text>
                                                            )}
                                                            {course.servedAt && (
                                                                <Text className="text-gray-400 text-xs">
                                                                    Served: {course.servedAt}
                                                                </Text>
                                                            )}
                                                        </View>
                                                    );
                                                })}
                                            </View>
                                        );
                                    })()}
                                </View>

                                {/* Add Items to Order */}
                                <View className="border-b border-gray-700 pb-4">
                                    <Text className="text-lg font-bold text-white mb-3">
                                        Add Items to Order
                                    </Text>

                                    {selectedOrderId && (() => {
                                        const order = orderStore.getOrder(selectedOrderId);
                                        if (!order) return null;
                                        return (
                                            <View className="mb-3 p-2 bg-gray-800 rounded">
                                                <Text className="text-gray-300 text-xs">
                                                    Items will be added to Course {order.working_course} ({order.courses[order.working_course]?.status || "open"})
                                                </Text>
                                            </View>
                                        );
                                    })()}

                                    {/* Menu Item Selection */}
                                    <View className="mb-3">
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
                                                        setMenuItemId(itemWithCategory.menu_item.id);
                                                        // console.log(itemWithCategory)
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

                                    {/* Manual Override Fields */}
                                    <View className="mb-3">
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

                                    <View className="mb-3">
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

                                    {/* Quantity */}
                                    <View className="mb-3">
                                        <Text className="text-sm font-semibold text-gray-300 mb-2">
                                            Quantity
                                        </Text>
                                        <Input
                                            value={itemQuantity}
                                            onChangeText={setItemQuantity}
                                            placeholder="1"
                                            keyboardType="numeric"
                                            className="bg-[#303030] border-gray-600 text-white"
                                            placeholderTextColor="#9CA3AF"
                                        />
                                    </View>

                                    {/* Cash vs Card Price */}
                                    {selectedMenuItem && selectedMenuItem.effective_cash_price && (
                                        <View className="flex-row items-center gap-3 p-3 bg-[#1a1a1a] rounded-lg border border-gray-700 mb-3">
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
                                                    Cash: ${selectedMenuItem.effective_cash_price.toFixed(2)}
                                                </Text>
                                            </View>
                                        </View>
                                    )}

                                    {/* Size Selection */}
                                    <View className="mb-3">
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

                                    {/* Special Instructions */}
                                    <View className="mb-3">
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

                                    {/* Modifiers Section */}
                                    {selectedMenuItem &&
                                        selectedMenuItem.modifier_groups.length > 0 && (
                                            <View className="mb-3">
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

                                    {/* Selected Item Details */}
                                    {selectedMenuItem && (
                                        <View className="bg-blue-900/20 border border-blue-600 rounded-lg p-3 mb-3">
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
                                                    Cash Price: ${selectedMenuItem.effective_cash_price.toFixed(2)}
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
                                                <Text className="text-white text-sm mt-1">
                                                    {selectedMenuItem.description}
                                                </Text>
                                            )}
                                            <Text className="text-white text-sm mt-1 font-semibold">
                                                Effective Price: ${calculateEffectiveItemPrice().toFixed(2)}
                                            </Text>
                                        </View>
                                    )}

                                    <Button
                                        onPress={handleAddItemToOrder}
                                        disabled={loading.addItemToOrder || !selectedOrderId || !selectedMenuItem || (!menuItemId && !locationExclusiveItemId)}
                                        className="bg-green-600"
                                    >
                                        <Text className="text-white font-semibold">
                                            {loading.addItemToOrder ? "Adding..." : "Add Item to Working Course"}
                                        </Text>
                                    </Button>
                                </View>

                                {/* Fire Course */}
                                <View className="border-b border-gray-700 pb-4">
                                    <Text className="text-lg font-bold text-white mb-3">
                                        Fire Course
                                    </Text>

                                    <View className="mb-3">
                                        <Text className="text-sm font-semibold text-gray-300 mb-2">
                                            Course Number to Fire
                                        </Text>
                                        <Input
                                            value={courseToFire}
                                            onChangeText={setCourseToFire}
                                            placeholder="1"
                                            keyboardType="numeric"
                                            className="bg-[#303030] border-gray-600 text-white"
                                            placeholderTextColor="#9CA3AF"
                                        />
                                    </View>

                                    {selectedOrderId && (() => {
                                        const courseNum = parseInt(courseToFire);
                                        if (isNaN(courseNum)) return null;
                                        const order = orderStore.getOrder(selectedOrderId);
                                        if (!order) return null;
                                        const itemsInCourse = order.items.filter((i) => i.course_number === courseNum);
                                        const courseInfo = order.courses[courseNum];
                                        return (
                                            <View className="mb-3 p-2 bg-gray-800 rounded">
                                                <Text className="text-gray-300 text-xs mb-1">
                                                    Course {courseNum} Status: {courseInfo?.status || "open"}
                                                </Text>
                                                <Text className="text-gray-300 text-xs">
                                                    Items in course: {itemsInCourse.length}
                                                </Text>
                                                {itemsInCourse.length > 0 && (
                                                    <View className="mt-2">
                                                        {itemsInCourse.map((item) => (
                                                            <Text key={item.id} className="text-white text-xs">
                                                                • {item.name} (x{item.quantity})
                                                            </Text>
                                                        ))}
                                                    </View>
                                                )}
                                            </View>
                                        );
                                    })()}

                                    <Button
                                        onPress={handleFireCourse}
                                        disabled={loading.fireCourse || !selectedOrderId || !courseToFire}
                                        className="bg-orange-600"
                                    >
                                        <Text className="text-white font-semibold">
                                            {loading.fireCourse ? "Firing..." : "Fire Course"}
                                        </Text>
                                    </Button>
                                </View>

                                {/* Mark Course Served */}
                                <View className="border-b border-gray-700 pb-4">
                                    <Text className="text-lg font-bold text-white mb-3">
                                        Mark Course Served
                                    </Text>

                                    <View className="mb-3">
                                        <Text className="text-sm font-semibold text-gray-300 mb-2">
                                            Course Number
                                        </Text>
                                        <Input
                                            value={courseToServe}
                                            onChangeText={setCourseToServe}
                                            placeholder="1"
                                            keyboardType="numeric"
                                            className="bg-[#303030] border-gray-600 text-white"
                                            placeholderTextColor="#9CA3AF"
                                        />
                                    </View>

                                    <Button
                                        onPress={handleMarkCourseServed}
                                        disabled={loading.markCourseServed || !selectedOrderId || !courseToServe}
                                        className="bg-teal-600"
                                    >
                                        <Text className="text-white font-semibold">
                                            {loading.markCourseServed ? "Marking..." : "Mark Course Served"}
                                        </Text>
                                    </Button>
                                </View>

                                {/* Move Items Between Courses */}
                                <View className="border-b border-gray-700 pb-4">
                                    <Text className="text-lg font-bold text-white mb-3">
                                        Move Items Between Courses
                                    </Text>

                                    {selectedOrderId && (() => {
                                        const order = orderStore.getOrder(selectedOrderId);
                                        if (!order || order.items.length === 0) {
                                            return (
                                                <Text className="text-gray-400 text-sm mb-3">
                                                    No items in order
                                                </Text>
                                            );
                                        }
                                        return (
                                            <View className="mb-3">
                                                <Text className="text-sm font-semibold text-gray-300 mb-2">
                                                    Select Item
                                                </Text>
                                                <Select
                                                    value={
                                                        selectedItemId
                                                            ? {
                                                                value: selectedItemId,
                                                                label: order.items.find((i) => i.id === selectedItemId)?.name || "Select",
                                                            }
                                                            : undefined
                                                    }
                                                    onValueChange={(option) => setSelectedItemId(option?.value || null)}
                                                >
                                                    <SelectTrigger className="bg-[#303030] border-gray-600">
                                                        <SelectValue
                                                            placeholder="Select item"
                                                            className="text-white"
                                                        />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-[#212121] border-gray-600">
                                                        {order.items.map((item) => {
                                                            const courseInfo = order.courses[item.course_number];
                                                            const canModify = !courseInfo || courseInfo.status === "open";
                                                            return (
                                                                <SelectItem
                                                                    key={item.id}
                                                                    value={item.id}
                                                                    label={`${item.name} (Course ${item.course_number} - ${courseInfo?.status || "open"}) ${!canModify ? "🔒" : ""}`}
                                                                />
                                                            );
                                                        })}
                                                    </SelectContent>
                                                </Select>
                                            </View>
                                        );
                                    })()}

                                    <View className="mb-3">
                                        <Text className="text-sm font-semibold text-gray-300 mb-2">
                                            Target Course Number
                                        </Text>
                                        <Input
                                            value={targetCourseNumber}
                                            onChangeText={setTargetCourseNumber}
                                            placeholder="2"
                                            keyboardType="numeric"
                                            className="bg-[#303030] border-gray-600 text-white"
                                            placeholderTextColor="#9CA3AF"
                                        />
                                    </View>

                                    <Button
                                        onPress={handleMoveItemToCourse}
                                        disabled={loading.moveItemToCourse || !selectedOrderId || !selectedItemId || !targetCourseNumber}
                                        className="bg-cyan-600"
                                    >
                                        <Text className="text-white font-semibold">
                                            {loading.moveItemToCourse ? "Moving..." : "Move Item to Course"}
                                        </Text>
                                    </Button>
                                </View>

                                {/* Items by Course Display */}
                                {selectedOrderId && (() => {
                                    const itemsByCourse = getItemsByCourse(selectedOrderId);
                                    const courseNumbers = Object.keys(itemsByCourse).map(Number).sort((a, b) => a - b);
                                    if (courseNumbers.length === 0) return null;
                                    return (
                                        <View>
                                            <Text className="text-lg font-bold text-white mb-3">
                                                Items by Course
                                            </Text>
                                            {courseNumbers.map((courseNum) => {
                                                const order = orderStore.getOrder(selectedOrderId);
                                                const courseInfo = order?.courses[courseNum];
                                                const items = itemsByCourse[courseNum];
                                                return (
                                                    <View key={courseNum} className="mb-3 p-3 bg-gray-800 rounded-lg border border-gray-700">
                                                        <Text className="text-white font-semibold mb-2">
                                                            Course {courseNum} - {courseInfo?.status || "open"}
                                                            {courseInfo && courseInfo.status !== "open" && " 🔒"}
                                                        </Text>
                                                        {items.map((item) => (
                                                            <View key={item.id} className="mb-2 p-2 bg-gray-900 rounded">
                                                                <Text className="text-white text-sm font-medium">
                                                                    {item.name}
                                                                </Text>
                                                                <Text className="text-gray-400 text-xs">
                                                                    Qty: {item.quantity} × ${item.price.toFixed(2)} = ${(item.price * item.quantity).toFixed(2)}
                                                                </Text>
                                                                <Text className="text-gray-500 text-xs">
                                                                    Kitchen Status: {item.kitchen_status || "new"}
                                                                </Text>
                                                            </View>
                                                        ))}
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    );
                                })()}
                            </View>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>

                {/* Helper Buttons */}
                <View className="bg-[#303030] rounded-lg p-4 mb-4">
                    <View className="flex-row gap-3">
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

                {/* Test Results/Logs Section */}
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

export default FloorPlanTest;

