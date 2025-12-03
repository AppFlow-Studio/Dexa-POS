import ExpandedTableDetails from "@/components/tables/ExpandedTableDetails";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import SortDropdown, {
  SortDirection,
  SortOption,
} from "@/components/ui/SortDropdown";
import { TableType } from "@/lib/types";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";

type TableWithLayoutId = TableType & { layoutId: string };

const SeatedPanel: React.FC = () => {
  const { layouts } = useFloorPlanStore();
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

  // FIX: Correctly type the useRef for TouchableOpacity
  const sortButtonRef = useRef<React.ElementRef<typeof TouchableOpacity>>(null);

  const getTableOrderData = useCallback(
    (tableId: string) => {
      const order = orders.find(
        (o) => o.service_location_id === tableId && o.order_status !== "Voided"
      );
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
    const allSeatedTables = layouts.flatMap((layout) =>
      layout.tables
        .filter((table) => table.status === "In Use")
        .map((table) => ({ ...table, layoutId: layout.id }))
    );

    return allSeatedTables.sort((a, b) => {
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
  }, [layouts, getTableOrderData, sortOption, sortDirection]);

  const serversWithTables = useMemo(() => {
    const serverTableMap: Record<string, TableWithLayoutId[]> = {};
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
                    <ExpandedTableDetails
                      table={table}
                      activeLayoutId={table.layoutId}
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
            <ExpandedTableDetails table={item} activeLayoutId={item.layoutId} />
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
