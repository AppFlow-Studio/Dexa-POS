import { GuestCountModal } from "@/components/tables/GuestCountModal";
import Sidebar from "@/components/tables/Sidebar";
import TableLayoutSkeleton from "@/components/tables/TableLayoutSkeleton";
import TableLayoutView from "@/components/tables/TableLayoutView";
import { useLoading } from "@/contexts/LoadingContext";
import { useToast } from "@/contexts/ToastContext";
import { OrderProfile } from "@/lib/types";
import { OrderService } from "@/services/orderService";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import {
  getOrderStoreSupabaseClient,
  useOrderStore,
} from "@/stores/useOrderStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { FloorPlanObject } from "@/types/db-floor-plan-types";
import { Href, useRouter } from "expo-router";
import { GitMerge, Search, X } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const TablesScreen = () => {
  const router = useRouter();
  const {
    floorPlans,
    activeFloorPlanId,
    setActiveFloorPlan,
    tables,
    selectedTableIds,
    toggleTableSelection,
    clearSelection,
    mergeTable,
    unmergeTable,
    isLoading: floorPlanLoading,
    realtimeStatus,
    realtimeChannel,
    realtimeError,
    manualReconnect,
  } = useFloorPlanStore();
  const { startNewOrder, setActiveOrder, ordersById, getOrderByDbId } = useOrderStore();
  const { show } = useToast();
  const { showLoading, hideLoading } = useLoading();

  const [searchText, setSearchText] = useState("");
  const [isGuestModalOpen, setGuestModalOpen] = useState(false);
  const [isMergeMode, setMergeMode] = useState(false);

  const { activeEmployeeId, getSession, showClockInWall } = useTimeclockStore();

  useEffect(() => {
    if (!activeFloorPlanId && floorPlans.length > 0) {
      setActiveFloorPlan(floorPlans[0].id);
    }
    clearSelection();
  }, [activeFloorPlanId, floorPlans, setActiveFloorPlan, clearSelection]);

  // activePlan logic is now handled by store loading 'tables' only for active plan.
  // tables = current active tables.

  const isClockedIn = useMemo(() => {
    if (!activeEmployeeId) return false;
    const session = getSession(activeEmployeeId);
    return session?.status === "clockedIn";
  }, [activeEmployeeId, getSession]);

  const handleTablePress = (table: FloorPlanObject) => {
    if (!isClockedIn) {
      showClockInWall();
      return;
    }

    const status = (table.session?.status || "available").toLowerCase();

    // MERGE MODE: Multi-select behavior
    if (isMergeMode) {
      toggleTableSelection(table.id);
      return;
    }

    // NORMAL MODE: Original behavior
    switch (status) {
      case "available":
        clearSelection();
        toggleTableSelection(table.id);
        setGuestModalOpen(true);
        break;
      case "seated":
      case "ordered":
      case "served":
      case "in use":
      case "check_presented":
      case "paid":
        // OPTIMIZED: Prefetch order before navigation for faster table view load
        // This sets the active order immediately so the table view doesn't need to look it up
        if (table.session?.order_id) {
          const existingOrder = ordersById[table.session.order_id] || getOrderByDbId(table.session.order_id);
          if (existingOrder) {
            setActiveOrder(existingOrder.id);
          }
        }
        router.push(`/tables/${table.id}`);
        break;
      case "cleaning":
        router.push(`/tables/clean-table/${table.id}`);
        break;
      default:
        break;
    }
  };

  // OPTIMIZED: Use Set for O(1) membership tests instead of .includes() O(n)
  const selectedTableIdsSet = useMemo(
    () => new Set(selectedTableIds),
    [selectedTableIds]
  );

  // Analyze selected tables for merge actions
  const selectedTables = useMemo(
    () => tables.filter((t) => selectedTableIdsSet.has(t.id)), // O(1) per check
    [tables, selectedTableIdsSet]
  );
  const availableSelectedTables = selectedTables.filter(
    (t) => !t.session || t.session.status === "available"
  );
  const inUseSelectedTables = selectedTables.filter(
    (t) => t.session && t.session.status !== "available"
  );

  // Determine which merge action is valid
  const canMergeAndSeat =
    availableSelectedTables.length >= 2 && inUseSelectedTables.length === 0;
  const canAddToSession =
    inUseSelectedTables.length === 1 && availableSelectedTables.length >= 1;
  const canUnmerge =
    selectedTables.length === 1 &&
    selectedTables[0]?.session?.merged_tables &&
    selectedTables[0].session.merged_tables.length > 0;

  // Check if unmerge is blocked due to pending items
  const checkUnmergeAllowed = (): boolean => {
    if (!canUnmerge) return false;

    // If table is in "cleaning" status, always allow unmerge
    const tableStatus = selectedTables[0]?.session?.status?.toLowerCase();
    if (tableStatus === "cleaning") return true;

    const sessionOrderId = selectedTables[0]?.session?.order_id;
    if (!sessionOrderId) return true;

    // Find the order - OPTIMIZED: Use O(1) lookups
    let order: (typeof ordersById)[string] | undefined =
      ordersById[sessionOrderId] || getOrderByDbId(sessionOrderId);
    if (!order) return true;

    // Check for pending items
    const hasPendingItems = order.items.some(
      (item) =>
        item.item_status !== "ready" &&
        item.item_status !== "served" &&
        item.item_status !== "Ready" &&
        item.item_status !== "Served"
    );
    return !hasPendingItems;
  };

  const handleMergeAndSeat = () => {
    if (availableSelectedTables.length < 2) {
      show({
        title: "Select More Tables",
        message: "Please select at least 2 tables to merge.",
        type: "warning",
      });
      return;
    }
    setGuestModalOpen(true);
  };

  const handleAddToSession = async () => {
    if (inUseSelectedTables.length !== 1 || availableSelectedTables.length < 1)
      return;

    const targetSession = inUseSelectedTables[0].session;
    if (!targetSession?.id) return;

    try {
      for (const table of availableSelectedTables) {
        await mergeTable(targetSession.id, table.id);
      }
      show({
        title: "Tables Merged",
        message: `Added ${availableSelectedTables.length} table(s) to the session.`,
        type: "success",
      });
      clearSelection();
      setMergeMode(false);
    } catch (err) {
      console.error("Failed to merge tables:", err);
      show({
        title: "Merge Failed",
        message: "Could not merge tables. Please try again.",
        type: "error",
      });
    }
  };

  const handleUnmerge = async () => {
    if (!canUnmerge) return;

    if (!checkUnmergeAllowed()) {
      show({
        title: "Cannot Unmerge",
        message: "This table has pending items. Complete them first.",
        type: "error",
      });
      return;
    }

    const table = selectedTables[0];
    if (!table.session?.id) return;

    try {
      await unmergeTable(table.session.id, table.id);
      show({
        title: "Table Unmerged",
        message: `${table.name} has been removed from the session.`,
        type: "success",
      });
      clearSelection();
      setMergeMode(false);
    } catch (err) {
      console.error("Failed to unmerge table:", err);
      show({
        title: "Unmerge Failed",
        message: "Could not unmerge table. Please try again.",
        type: "error",
      });
    }
  };

  const handleCancelMerge = () => {
    clearSelection();
    setMergeMode(false);
  };

  const handleGuestCountSubmit = async (guestCount: number) => {
    const primaryTableId = selectedTableIds[0];
    if (!primaryTableId) return;

    // Use all selected tables if in merge mode, otherwise just the primary
    const tableIdsToSeat = isMergeMode ? selectedTableIds : [primaryTableId];

    showLoading("Creating session...");

    try {
      // Create backend session with correct guest count
      const { sessionId, orderId } = await useFloorPlanStore
        .getState()
        .seatGuests({
          tableIds: tableIdsToSeat,
          partySize: guestCount,
          createOrder: true,
        });

      console.log(
        "[GuestCountSubmit] Created session:",
        sessionId,
        "Order:",
        orderId
      );

      // Fetch full order details from backend and create local order
      if (orderId) {
        const supabase = getOrderStoreSupabaseClient();
        if (supabase) {
          const { data: backendOrder, error } =
            await OrderService.fetchOrderById(supabase, orderId);

          if (backendOrder && !error) {
            console.log(
              "[GuestCountSubmit] Fetched backend order:",
              backendOrder.order_number
            );

            // Create local OrderProfile with backend data
            const localOrderId = `order_${Date.now()}`;
            const newOrderProfile: OrderProfile = {
              id: localOrderId,
              db_order_id: backendOrder.id,
              order_number: backendOrder.order_number,
              display_number: backendOrder.display_number,
              sync_status: "synced",
              service_location_id: primaryTableId,
              order_status: backendOrder.status || "draft",
              check_status: "Opened",
              paid_status: "Unpaid",
              order_type: "Dine In",
              items: [],
              opened_at: backendOrder.created_at,
              guest_count: guestCount,
            };

            // Inject into store
            useOrderStore.setState((state) => ({
              ordersById: {
                ...state.ordersById,
                [localOrderId]: newOrderProfile,
              },
              orderIds: [...state.orderIds, localOrderId],
            }));

            setActiveOrder(localOrderId);
          } else {
            console.error(
              "[GuestCountSubmit] Failed to fetch backend order:",
              error
            );
            // Fallback: use orderId directly (might not work for lookups)
            setActiveOrder(orderId);
          }
        } else {
          setActiveOrder(orderId);
        }
      }
    } catch (err) {
      console.error("[GuestCountSubmit] Failed to seat guests:", err);
      // Fallback to local order creation if backend fails
      const newOrder = startNewOrder({ guestCount, tableId: primaryTableId });
      setActiveOrder(newOrder.id);
    } finally {
      hideLoading();
    }

    setGuestModalOpen(false);
    clearSelection();
    setMergeMode(false);
    router.push(`/tables/${primaryTableId}`);
  };

  return (
    <View className="flex-1 bg-[#212121] px-2 py-1">
      {realtimeStatus !== 'connected' && (
        <TouchableOpacity 
          onPress={manualReconnect}
          className={`py-2 px-4 flex-row items-center justify-center ${
            realtimeStatus === 'reconnecting' 
              ? 'bg-amber-600' 
              : 'bg-red-600'
          }`}
        >
          <View className={`w-2 h-2 rounded-full mr-2 ${
            realtimeStatus === 'reconnecting' ? 'bg-amber-300' : 'bg-red-300'
          }`} />
          <Text className="text-white font-medium">
            {realtimeStatus === 'reconnecting' 
              ? 'Reconnecting...' 
              : 'Offline - Tap to reconnect'}
          </Text>
        </TouchableOpacity>
      )}
      <View className="flex-1 flex-row bg-[#212121] rounded-lg border border-gray-700">
        {/* NEW: Sidebar Component */}
        <Sidebar
          // layouts={layouts} REMOVED
          activeLayoutId={activeFloorPlanId}
          setActiveLayout={setActiveFloorPlan}
        />
       

        {/* Right Side: Floor Plan */}
        <View className="flex-1 p-4">
          <View className="flex-row justify-between items-center mb-3">
            {/* Layout Tabs */}
            <View className="flex-row items-center bg-[#303030] border border-gray-600 p-1 rounded-xl self-start ml-2">
              {floorPlans.map((layout) => (
                <TouchableOpacity
                  key={layout.id}
                  onPress={() => setActiveFloorPlan(layout.id)}
                  className={`py-2 px-4 rounded-lg ${
                    activeFloorPlanId === layout.id ? "bg-[#212121]" : ""
                  }`}
                >
                  <Text
                    className={`text-lg font-semibold ${
                      activeFloorPlanId === layout.id
                        ? "text-blue-400"
                        : "text-gray-300"
                    }`}
                  >
                    {layout.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Search Bar - Edit button removed from here */}
            <View className="flex-row items-center gap-2">
              <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                className="flex-row items-center bg-[#303030] border border-gray-600 rounded-lg px-3 max-w-sm"
              >
                <Search color="#9CA3AF" size={20} />
                <TextInput
                  placeholder="Search table name..."
                  placeholderTextColor="#9CA3AF"
                  value={searchText}
                  onChangeText={setSearchText}
                  className="ml-2 text-lg h-12 flex-1 text-white"
                />
              </KeyboardAvoidingView>
            </View>
          </View>

          {/* Map Container */}
          <View className="bg-[#212121] border border-gray-700 rounded-xl flex-1 relative">
            {floorPlanLoading && tables.length === 0 ? (
              <TableLayoutSkeleton tableCount={10} showControls={true} />
            ) : (
              <TableLayoutView
                tables={tables || []}
                isSelectionMode={true}
                onTableSelect={handleTablePress}
                showConnections={true}
                layoutId={activeFloorPlanId || ""}
              />
            )}

            {/* Top Right Buttons: Merge + Edit Layout */}
            <View className="absolute top-4 right-4 z-10 flex-row gap-2">
              {/* Merge Tables Toggle Button */}
              <TouchableOpacity
                onPress={() => {
                  if (isMergeMode) {
                    handleCancelMerge();
                  } else {
                    clearSelection();
                    setMergeMode(true);
                  }
                }}
                className={`py-2 px-4 flex-row items-center justify-center rounded-lg shadow-md border ${
                  isMergeMode
                    ? "bg-gray-600 border-gray-500"
                    : "bg-amber-600 border-amber-500"
                }`}
              >
                {isMergeMode ? (
                  <X color="white" size={20} />
                ) : (
                  <GitMerge color="white" size={20} />
                )}
                <Text className="text-lg font-bold text-white ml-2">
                  {isMergeMode ? "Cancel" : "Merge Tables"}
                </Text>
              </TouchableOpacity>

              {/* Edit Layout Button */}
              <TouchableOpacity
                onPress={() => router.push(`/tables/floor-plan` as Href)}
                className="py-2 px-4 flex-row items-center justify-center rounded-lg bg-blue-600 shadow-md border border-blue-500"
              >
                <Text className="text-lg font-bold text-white">
                  Edit Layout
                </Text>
              </TouchableOpacity>
            </View>

            {/* Merge Mode Action Bar */}
            {isMergeMode && selectedTableIds.length > 0 && (
              <View className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 flex-row items-center gap-3 p-3 rounded-xl bg-[#1c1c1c]/95 border border-gray-600">
                {/* Selected Count */}
                <View className="bg-gray-700 px-3 py-2 rounded-lg">
                  <Text className="text-white font-semibold">
                    {selectedTableIds.length} table
                    {selectedTableIds.length !== 1 ? "s" : ""} selected
                  </Text>
                </View>

                {/* Merge & Seat Button */}
                {canMergeAndSeat && (
                  <TouchableOpacity
                    onPress={handleMergeAndSeat}
                    className="py-2 px-4 bg-green-600 rounded-lg"
                  >
                    <Text className="text-white font-bold">Merge & Seat</Text>
                  </TouchableOpacity>
                )}

                {/* Add to Session Button */}
                {canAddToSession && (
                  <TouchableOpacity
                    onPress={handleAddToSession}
                    className="py-2 px-4 bg-blue-600 rounded-lg"
                  >
                    <Text className="text-white font-bold">Add to Session</Text>
                  </TouchableOpacity>
                )}

                {/* Unmerge Button */}
                {canUnmerge && (
                  <TouchableOpacity
                    onPress={handleUnmerge}
                    className="py-2 px-4 bg-red-600 rounded-lg"
                  >
                    <Text className="text-white font-bold">Unmerge</Text>
                  </TouchableOpacity>
                )}

                {/* Cancel Button */}
                <TouchableOpacity
                  onPress={handleCancelMerge}
                  className="py-2 px-4 bg-gray-600 rounded-lg"
                >
                  <Text className="text-white font-bold">Cancel</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Status Indicators (Bottom Left) */}
            <View className="absolute bottom-3 left-4 self-center flex-row items-center gap-4 p-2 rounded-full bg-[#1c1c1c]/90 border border-gray-600">
              <View className="flex-row items-center gap-2">
                <View className="w-3 h-3 rounded-full bg-green-500" />
                <Text className="text-base font-semibold text-gray-300">
                  Available
                </Text>
              </View>
              <View className="flex-row items-center gap-2">
                <View className="w-3 h-3 rounded-full bg-blue-500" />
                <Text className="text-base font-semibold text-gray-300">
                  In Use
                </Text>
              </View>
              <View className="flex-row items-center gap-2">
                <View className="w-3 h-3 rounded-full bg-red-500" />
                <Text className="text-base font-semibold text-gray-300">
                  Needs Cleaning
                </Text>
              </View>
              <View className="flex-row items-center gap-2">
                <View className="w-3 h-3 rounded-full bg-yellow-500" />
                <Text className="text-base font-semibold text-gray-300">
                  Overtime
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>
      <GuestCountModal
        isOpen={isGuestModalOpen}
        onClose={() => {
          setGuestModalOpen(false);
          clearSelection();
        }}
        onSubmit={handleGuestCountSubmit}
      />
    </View>
  );
};

export default TablesScreen;
