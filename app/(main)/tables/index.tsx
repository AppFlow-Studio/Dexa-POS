import { GuestCountModal } from "@/components/tables/GuestCountModal";
import Sidebar from "@/components/tables/Sidebar"; // Import the new Sidebar
import TableLayoutView from "@/components/tables/TableLayoutView";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { FloorPlanObject } from "@/types/db-floor-plan-types";
import { Href, useRouter } from "expo-router";
import { Search } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
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
    tables, // active plan tables
    selectedTableIds,
    toggleTableSelection,
    clearSelection,
    // updateTableStatus removed
  } = useFloorPlanStore();
  const { startNewOrder, setActiveOrder } = useOrderStore();

  const [searchText, setSearchText] = useState("");
  const [isGuestModalOpen, setGuestModalOpen] = useState(false);

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

    let targetTable = table;
    // Check if merged (and not the "primary" visually, though FloorPlanObject doesn't store isPrimary on obj directly anymore, logic inferred by session)
    // Actually, if we tap a table that is part of a merge group, we should open the session for that group.

    // session.merged_tables contains IDs.
    // Simply check status.
    const status = (targetTable.session?.status || "available").toLowerCase();

    switch (status) {
      case "available":
        clearSelection();
        // Handle selection for merge later? Or just select single.
        // Legacy code selected merged group if primary.
        // New logic: just select the table. Merging is done in design mode or separate flow?
        // Or if we select multiple AVAILABLE tables, we can merge-seat them.

        // For now, simple selection.
        if (selectedTableIds.includes(targetTable.id)) {
          toggleTableSelection(targetTable.id);
        } else {
          // Single select mode for immediate seating usually clears others unless multi-select enabled.
          // Legacy toggleTableSelection allows multi.
          toggleTableSelection(targetTable.id);
        }

        setGuestModalOpen(true);
        break;
      case "seated":
      case "ordered":
      case "served":
      case "in use": // Legacy fallback
      case "check_presented":
      case "paid":
        router.push(`/tables/${targetTable.id}`);
        break;
      case "cleaning":
        router.push(`/tables/clean-table/${targetTable.id}`);
        break;
      default:
        // 'blocked', 'reserved' might need handling
        break;
    }
  };

  const handleGuestCountSubmit = (guestCount: number) => {
    const primaryTableId = selectedTableIds[0];
    if (!primaryTableId) return;

    // We assume backend handles session creation via OrderStore/FloorPlanService integration
    // OR we explicitly call seatGuests here.
    // Existing code uses startNewOrder.

    const newOrder = startNewOrder({ guestCount, tableId: primaryTableId });
    setActiveOrder(newOrder.id);

    // selectedTableIds.forEach((tableId) => {
    //   updateTableStatus(tableId, "In Use");
    // });
    // UPDATE STATUS REMOVED. Relies on OrderStore state to drive UI.

    setGuestModalOpen(false);
    clearSelection();
    router.push(`/tables/${primaryTableId}`);
  };
  console.log('[TablesScreen] tables', tables)

  return (
    <View className="flex-1 bg-[#212121] px-2 py-1">
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
            <TableLayoutView
              tables={tables || []}
              isSelectionMode={true}
              onTableSelect={handleTablePress}
              showConnections={true}
              layoutId={activeFloorPlanId || ""}
            />

            {/* NEW: Edit Layout Button (Top Right) */}
            <TouchableOpacity
              onPress={() => router.push(`/tables/floor-plan` as Href)}
              className="absolute top-4 right-4 z-10 py-2 px-4 flex-row items-center justify-center rounded-lg bg-blue-600 shadow-md border border-blue-500"
            >
              <Text className="text-lg font-bold text-white">Edit Layout</Text>
            </TouchableOpacity>

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
