import TableListItem from "@/components/tables/TableListItem";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import SortDropdown, {
  SortDirection,
  SortOption,
} from "@/components/ui/SortDropdown";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { FloorPlanObject } from "@/types/db-floor-plan-types";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";

const SeatedPanel: React.FC = () => {
  const { tables } = useFloorPlanStore();
  const { orders } = useOrderStore();
  const { activeEmployeeId } = useTimeclockStore();
  const { employees } = useEmployeeStore();

  const [activeFilter, setActiveFilter] = useState("All");
  const [expandedServers, setExpandedServers] = useState<
    Record<string, boolean>
  >({});
  const [sortOption, setSortOption] = useState<SortOption>("time");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });

  const sortButtonRef = useRef<React.ElementRef<typeof TouchableOpacity>>(null);

  // Track expanded state for TableListItems managed by this panel
  const [expandedTableIds, setExpandedTableIds] = useState<
    Record<string, boolean>
  >({});

  const toggleTableExpand = (tableId: string) => {
    setExpandedTableIds((prev) => ({ ...prev, [tableId]: !prev[tableId] }));
  };

  const getTableOrderData = useCallback(
    (tableId: string) => {
      // Logic mirrors useTableData but simplified for sorting
      // Check if table is merged
      // We rely on service_location_id matching tableId for primary.
      const order = orders.find(
        (o) => o.service_location_id === tableId && o.order_status !== "void"
      );

      // If table is part of merge group, we might want aggregate.
      // But for sorting, primary order data is okay approximation.

      return {
        order,
        seatedTime: order?.opened_at ? new Date(order.opened_at).getTime() : 0,
        guestCount: order?.guest_count || 0,
        total:
          order?.items.reduce(
            (sum, item) => sum + item.price * item.quantity,
            0
          ) || 0,
      };
    },
    [orders]
  );

  const sortedSeatedTables = useMemo(() => {
    // Only consider tables in active plan that are seated/active
    const activeStates = [
      "seated",
      "ordered",
      "served",
      "in use",
      "check_presented",
      "paid",
    ];

    const seatedTables = tables.filter((table) => {
      const status = (table.session?.status || "available").toLowerCase();
      // Also check 'In Use' for legacy compatibility if DB not updated
      return activeStates.includes(status);
    });

    return seatedTables.sort((a, b) => {
      const aData = getTableOrderData(a.id);
      const bData = getTableOrderData(b.id);

      let compare = 0;
      switch (sortOption) {
        case "time":
          compare = aData.seatedTime - bData.seatedTime;
          break;
        case "name":
          compare = a.name.localeCompare(b.name);
          break;
        case "guests":
          compare = aData.guestCount - bData.guestCount;
          break;
        case "total":
          compare = aData.total - bData.total;
          break;
      }

      return sortDirection === "asc" ? compare : -compare;
    });
  }, [tables, getTableOrderData, sortOption, sortDirection]);

  const serversWithTables = useMemo(() => {
    const serverTableMap: Record<string, FloorPlanObject[]> = {};
    sortedSeatedTables.forEach((table) => {
      const order = orders.find((o) => o.service_location_id === table.id);
      const serverName = order?.server_name || "Unassigned";
      if (!serverTableMap[serverName]) {
        serverTableMap[serverName] = [];
      }
      serverTableMap[serverName].push(table);
    });
    return serverTableMap;
  }, [sortedSeatedTables, orders]);

  const filteredSeatedTables = useMemo(() => {
    if (activeFilter === "All") {
      return sortedSeatedTables;
    }
    if (activeFilter === "My Tables") {
      const currentUser = employees.find((e) => e.id === activeEmployeeId);
      if (!currentUser) return [];

      const myOrders = orders.filter(
        (o) => o.server_name === currentUser.fullName
      );
      const myTableIds = new Set(myOrders.map((o) => o.service_location_id));
      // This strict check assumes order.service_location_id is the table ID (it is).
      // Merged tables: secondary IDs might not have orders directly, but we only list PRIMARY tables or tables with orders here usually.
      return sortedSeatedTables.filter((t) => myTableIds.has(t.id));
    }
    return [];
  }, [activeFilter, sortedSeatedTables, orders, activeEmployeeId, employees]);

  const toggleServerSection = (serverName: string) => {
    setExpandedServers((prev) => ({
      ...prev,
      [serverName]: !prev[serverName],
    }));
  };

  const handleSortChange = (option: SortOption, direction: SortDirection) => {
    setSortOption(option);
    setSortDirection(direction);
  };

  const openSortDropdown = () => {
    sortButtonRef.current?.measure((_fx, _fy, width, height, px, py) => {
      setDropdownPosition({ x: px, y: py, width, height });
      setIsSortDropdownOpen(true);
    });
  };

  const renderContent = () => {
    if (activeFilter === "By Server") {
      return (
        <FlatList
          data={Object.entries(serversWithTables)}
          keyExtractor={([serverName]) => serverName}
          renderItem={({ item: [serverName, tables] }) => (
            <Collapsible
              key={serverName}
              open={expandedServers[serverName] ?? true}
              onOpenChange={() => toggleServerSection(serverName)}
              className="space-y-1 mb-2"
            >
              <CollapsibleTrigger className="flex flex-row items-center w-full p-2 text-sm font-semibold rounded-md bg-gray-800">
                {(expandedServers[serverName] ?? true) ? (
                  <ChevronDown className="w-4 h-4 mr-2 text-slate-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 mr-2 text-slate-400" />
                )}
                <Text className="text-white font-semibold">{serverName}</Text>
              </CollapsibleTrigger>
              <CollapsibleContent className="pl-2 pt-2">
                {tables.map((table) => (
                  <View key={table.id} className="mb-4">
                    <TableListItem
                      table={table}
                      isExpanded={expandedTableIds[table.id] || false}
                      onToggleExpand={() => toggleTableExpand(table.id)}
                      onNavigateToOrder={() => {}} // Navigation handled usually by tap if collapsed, or button if expanded
                      handleTablePress={() => toggleTableExpand(table.id)} // In Seated panel, tap expands
                    />
                  </View>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}
          contentContainerStyle={{ padding: 12 }}
          ListEmptyComponent={() => (
            <View className="flex-1 items-center justify-center p-8">
              <Text className="text-gray-400 text-center">
                No seated tables for this filter.
              </Text>
            </View>
          )}
        />
      );
    }

    return (
      <FlatList
        data={filteredSeatedTables}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View className="mb-4">
            <TableListItem
              table={item}
              isExpanded={expandedTableIds[item.id] || false}
              onToggleExpand={() => toggleTableExpand(item.id)}
              onNavigateToOrder={() => {}}
              handleTablePress={() => toggleTableExpand(item.id)}
            />
          </View>
        )}
        contentContainerStyle={{ padding: 12 }}
        ListEmptyComponent={() => (
          <View className="flex-1 items-center justify-center p-8">
            <Text className="text-gray-400 text-center">
              No seated tables for this filter.
            </Text>
          </View>
        )}
      />
    );
  };

  return (
    <View className="h-full flex-col bg-[#292929]">
      <View className="p-4 border-b border-gray-700 space-y-3">
        <View className="flex-row gap-2">
          {["All", "My Tables", "By Server"].map((filter) => (
            <TouchableOpacity
              key={filter}
              onPress={() => setActiveFilter(filter)}
              className={`py-2 px-4 rounded-full ${
                activeFilter === filter ? "bg-blue-600" : "bg-gray-700"
              }`}
            >
              <Text
                className={`text-xs font-bold ${
                  activeFilter === filter ? "text-white" : "text-gray-300"
                }`}
              >
                {filter}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View className="flex-row justify-between items-center text-xs text-gray-400 mt-3">
          <Text className="text-gray-400">Sort by</Text>
          <TouchableOpacity
            ref={sortButtonRef}
            onPress={openSortDropdown}
            className="flex-row items-center gap-1"
          >
            <SortDropdown
              isOpen={isSortDropdownOpen}
              setIsOpen={setIsSortDropdownOpen}
              sortOption={sortOption}
              sortDirection={sortDirection}
              onSortChange={handleSortChange}
              triggerPosition={dropdownPosition}
            />
          </TouchableOpacity>
        </View>
      </View>

      {renderContent()}
    </View>
  );
};

export default SeatedPanel;
