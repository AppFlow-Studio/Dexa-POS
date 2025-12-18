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
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { TABLE_SHAPES } from "@/lib/table-shapes";
import type {
    FloorPlan,
    Reservation,
    TableSession,
    TableStatus,
    TableWithSession,
    WaitlistEntry
} from "@/stores/useFloorPlanTables";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useRouter } from "expo-router";
import {
    RotateCcw,
    Trash2
} from "lucide-react-native";
import React, { useState } from "react";
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

    // Data Lists
    const [tables, setTables] = useState<TableWithSession[]>([]);
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

