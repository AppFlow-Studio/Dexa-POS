import TableListItem from "@/components/tables/TableListItem";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { colors } from "@/lib/theme";
import { ChevronDown, ChevronRight, Filter } from "lucide-react-native";
import { FloorPlanObject } from "@/types/db-floor-plan-types";
import React, { useMemo, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { Easing, Layout } from "react-native-reanimated";

interface SectionProps {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

// Local Section component for collapsible dining areas
const Section: React.FC<SectionProps> = ({
  title,
  isOpen,
  onToggle,
  children,
}) => {
  return (
    <Animated.View
      layout={Layout.easing(Easing.inOut(Easing.ease)).duration(200)}
      className="space-y-1"
    >
      <TouchableOpacity
        onPress={onToggle}
        className="flex-row items-center w-full p-2 text-sm font-semibold text-white hover:bg-gray-800 rounded-md"
      >
        {isOpen ? (
          <ChevronDown size={16} color={colors.label} className="mr-2" />
        ) : (
          <ChevronRight size={16} color={colors.label} className="mr-2" />
        )}
        <Text className="text-white text-base font-semibold">{title}</Text>
      </TouchableOpacity>
      {isOpen && (
        <Animated.View
          layout={Layout.easing(Easing.inOut(Easing.ease)).duration(200)}
          className="pl-2"
        >
          {children}
        </Animated.View>
      )}
    </Animated.View>
  );
};

const TablesPanel: React.FC = () => {
  // Use floorPlans and tables (for active plan only)
  const floorPlans = useFloorPlanStore((s) => s.floorPlans);
  const tables = useFloorPlanStore((s) => s.tables);
  const activeFloorPlanId = useFloorPlanStore((s) => s.activeFloorPlanId);
  const sectionsById = useFloorPlanStore((s) => s.sectionsById);
  const [sections, setSections] = useState<{ [key: string]: boolean }>({});
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);

  const activePlanName = useMemo(() => {
    return (
      floorPlans.find((p) => p.id === activeFloorPlanId)?.name || "Dining Area"
    );
  }, [floorPlans, activeFloorPlanId]);

  // Init sections
  useMemo(() => {
    if (activeFloorPlanId && sections[activeFloorPlanId] === undefined) {
      setSections((prev) => ({ ...prev, [activeFloorPlanId]: true }));
    }
  }, [activeFloorPlanId]);

  const activeTables = tables; // These are already the tables for the active floor plan.

  const isSeatable = (t: FloorPlanObject) =>
    t.category === "table" || t.category === "booth";

  // Get unique sections and servers from tables
  const getEmployeeByStaffId = useEmployeeStore((s) => s.getEmployeeByStaffId);

  const { uniqueSections, uniqueServers, serverNames } = useMemo(() => {
    const sectionSet = new Set<string>();
    const serverSet = new Set<string>();
    const nameMap: Record<string, string> = {};

    activeTables.forEach((table) => {
      if (table.section_id) sectionSet.add(table.section_id);
      if (table.session?.server_staff_id) {
        const staffId = table.session.server_staff_id;
        serverSet.add(staffId);
        // Get server name if not already cached
        if (!nameMap[staffId]) {
          const employee = getEmployeeByStaffId(staffId);
          nameMap[staffId] = employee?.fullName || staffId.substring(0, 8);
        }
      }
    });

    return {
      uniqueSections: Array.from(sectionSet),
      uniqueServers: Array.from(serverSet),
      serverNames: nameMap,
    };
  }, [activeTables, getEmployeeByStaffId]);

  // Deduplicate merged tables: when T1+T2 are merged, both have the same
  // session — only show the first one encountered per session id.
  const displayTables = useMemo(() => {
    const seenSessionIds = new Set<string>();
    let filtered = activeTables.filter((table) => {
      if (!isSeatable(table)) return false;
      // No merge — always show
      if (!table.session?.merged_tables?.length) return true;
      // For merged tables, only show first per session
      const sid = table.session.id;
      if (seenSessionIds.has(sid)) return false;
      seenSessionIds.add(sid);
      return true;
    });

    // Apply section filter
    if (selectedSectionId) {
      filtered = filtered.filter((table) => table.section_id === selectedSectionId);
    }

    // Apply server filter
    if (selectedServerId) {
      filtered = filtered.filter((table) => table.session?.server_staff_id === selectedServerId);
    }

    return filtered;
  }, [activeTables, selectedSectionId, selectedServerId]);

  const occupiedTables = useMemo(() => {
    // Active session statuses (Phase 4.1: Include paid but not closed tables)
    const activeSessionStatuses = [
      "seated",
      "ordered",
      "served",
      "check_presented",
      "paid", // Include paid tables (not yet cleared/closed)
    ];

    return displayTables.filter((table) =>
      activeSessionStatuses.includes(
        table.session?.status?.toLowerCase() || "",
      ),
    );
  }, [displayTables]);

  // Also include cleaning?
  // Previous logic: 'In Use' or 'Needs Cleaning'.

  const totalTables = displayTables.length;

  const capacityPercentage = useMemo(
    () =>
      totalTables > 0
        ? Math.floor((occupiedTables.length / totalTables) * 100)
        : 0,
    [occupiedTables.length, totalTables],
  );

  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const locationId = useStoreSettingsStore.getState().selectedStore?.id;
      const { loadFloorPlanStatus } = useFloorPlanStore.getState();

      // 1. Refresh Floor Plan Status (Waitlist, Tables, etc.)
      await loadFloorPlanStatus();

      // 2. Refresh Orders (Full sync)
      if (locationId) {
        await useOrderStore.getState().initializeOrders(locationId, true);
      }
    } catch (error) {
      console.error("Failed to refresh sidebar:", error);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <View className="h-full flex-col bg-panel">
      {/* Capacity Info */}
      <View className="p-4 border-b border-gray-700">
        <View className="flex-row items-center justify-between text-xs text-gray-400 font-medium">
          <Text className="text-gray-400">
            {occupiedTables.length}/{totalTables} tables
          </Text>
          <Text className="text-gray-400">{capacityPercentage}% capacity</Text>
        </View>
        <View className="mt-2 h-2 bg-gray-700 rounded-full overflow-hidden">
          <View
            style={{ width: `${capacityPercentage}%` }}
            className="h-full bg-blue-500"
          />
        </View>
      </View>

      {/* Filters */}
      <View className="p-3 border-b border-gray-700">
        {/* Section Filter */}
        {uniqueSections.length > 0 && (
          <View className="mb-3">
            <Text className="text-xs text-gray-500 font-semibold mb-2">Section</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => setSelectedSectionId(null)}
                className={`px-3 py-1.5 rounded-full ${
                  selectedSectionId === null ? "bg-teal" : "bg-gray-700"
                }`}
              >
                <Text className={`text-xs font-semibold ${selectedSectionId === null ? "text-white" : "text-gray-300"}`}>
                  All
                </Text>
              </TouchableOpacity>
              {uniqueSections.map((sectionId) => {
                const section = sectionsById[sectionId];
                return (
                  <TouchableOpacity
                    key={sectionId}
                    onPress={() => setSelectedSectionId(sectionId)}
                    className={`px-3 py-1.5 rounded-full border ${
                      selectedSectionId === sectionId
                        ? "bg-teal border-teal"
                        : "bg-gray-700 border-gray-600"
                    }`}
                  >
                    <Text
                      className={`text-xs font-semibold ${
                        selectedSectionId === sectionId ? "text-white" : "text-gray-300"
                      }`}
                      numberOfLines={1}
                    >
                      {section?.name || sectionId.substring(0, 6)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Server Filter */}
        {uniqueServers.length > 0 && (
          <View>
            <Text className="text-xs text-gray-500 font-semibold mb-2">Server</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => setSelectedServerId(null)}
                className={`px-3 py-1.5 rounded-full ${
                  selectedServerId === null ? "bg-teal" : "bg-gray-700"
                }`}
              >
                <Text className={`text-xs font-semibold ${selectedServerId === null ? "text-white" : "text-gray-300"}`}>
                  All
                </Text>
              </TouchableOpacity>
              {uniqueServers.map((serverId) => (
                <TouchableOpacity
                  key={serverId}
                  onPress={() => setSelectedServerId(serverId)}
                  className={`px-3 py-1.5 rounded-full border ${
                    selectedServerId === serverId
                      ? "bg-teal border-teal"
                      : "bg-gray-700 border-gray-600"
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      selectedServerId === serverId ? "text-white" : "text-gray-300"
                    }`}
                    numberOfLines={1}
                  >
                    {serverNames[serverId] || serverId.substring(0, 8)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      {/* Table Sections (Just one for active plan now) */}
      <ScrollView
        className="flex-1 p-2"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#ffffff"
            title="Syncing..."
            titleColor="#ffffff"
          />
        }
      >
        <Section
          title={activePlanName}
          isOpen={
            activeFloorPlanId ? (sections[activeFloorPlanId] ?? true) : true
          }
          onToggle={() =>
            activeFloorPlanId &&
            setSections((s) => ({
              ...s,
              [activeFloorPlanId]: !s[activeFloorPlanId],
            }))
          }
        >
          {displayTables.length > 0 ? (
            displayTables.map((table) => (
                <TableListItem
                  key={table.id}
                  table={table}
                  isExpanded={false}
                  onToggleExpand={() => {}}
                  onNavigateToOrder={() => {}}
                  // activeLayoutId removed
                  handleTablePress={() => {}}
                />
              ))
          ) : (
            <Text className="text-gray-400 text-sm p-2 italic">
              No tables assigned
            </Text>
          )}
        </Section>
      </ScrollView>
    </View>
  );
};

export default TablesPanel;
