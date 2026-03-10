import TableListItem from "@/components/tables/TableListItem";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { colors } from "@/lib/theme";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { FloorPlanObject } from "@/types/db-floor-plan-types";
import React, { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  RefreshControl,
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
  const [sections, setSections] = useState<{ [key: string]: boolean }>({});

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

  // Deduplicate merged tables: when T1+T2 are merged, both have the same
  // session — only show the first one encountered per session id.
  const displayTables = useMemo(() => {
    const seenSessionIds = new Set<string>();
    return activeTables.filter((table) => {
      if (!isSeatable(table)) return false;
      // No merge — always show
      if (!table.session?.merged_tables?.length) return true;
      // For merged tables, only show first per session
      const sid = table.session.id;
      if (seenSessionIds.has(sid)) return false;
      seenSessionIds.add(sid);
      return true;
    });
  }, [activeTables]);

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

  const isSectionOpen = activeFloorPlanId
    ? (sections[activeFloorPlanId] ?? true)
    : true;

  const handleToggleSection = useCallback(() => {
    if (activeFloorPlanId) {
      setSections((s) => ({
        ...s,
        [activeFloorPlanId]: !s[activeFloorPlanId],
      }));
    }
  }, [activeFloorPlanId]);

  const noopFn = useCallback(() => {}, []);

  const renderTableItem = useCallback(
    ({ item }: { item: FloorPlanObject }) => (
      <TableListItem
        key={item.id}
        table={item}
        isExpanded={false}
        onToggleExpand={noopFn}
        onNavigateToOrder={noopFn}
        handleTablePress={noopFn}
      />
    ),
    [noopFn],
  );

  const keyExtractor = useCallback((item: FloorPlanObject) => item.id, []);

  const ListEmptyComponent = useMemo(
    () => (
      <Text className="text-gray-400 text-sm p-2 italic">
        No tables assigned
      </Text>
    ),
    [],
  );

  return (
    <View className="h-full flex-col bg-panel">
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

      <View className="flex-1 p-2">
        <Section
          title={activePlanName}
          isOpen={isSectionOpen}
          onToggle={handleToggleSection}
        >
          {isSectionOpen && (
            <FlatList
              data={displayTables}
              keyExtractor={keyExtractor}
              renderItem={renderTableItem}
              ListEmptyComponent={ListEmptyComponent}
              initialNumToRender={8}
              maxToRenderPerBatch={5}
              windowSize={3}
              removeClippedSubviews={true}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  tintColor="#ffffff"
                  title="Syncing..."
                  titleColor="#ffffff"
                />
              }
            />
          )}
        </Section>
      </View>
    </View>
  );
};

export default TablesPanel;
