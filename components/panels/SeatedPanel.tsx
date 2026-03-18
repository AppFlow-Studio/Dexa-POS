import TableListItem from "@/components/tables/TableListItem";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import SortDropdown, { SortDirection, SortOption } from "@/components/ui/SortDropdown";
import { colors } from "@/lib/theme";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { FloorPlanObject } from "@/types/db-floor-plan-types";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";

const SeatedPanel: React.FC = () => {
  const tables = useFloorPlanStore((s) => s.tables);
  const ordersById = useOrderStore((s) => s.ordersById);
  const liveSessions = useTableSessionStore((s) => s.sessions);
  const { activeEmployeeId } = useTimeclockStore();
  const { employees } = useEmployeeStore();

  const [activeFilter, setActiveFilter] = useState("All");
  const [expandedServers, setExpandedServers] = useState<Record<string, boolean>>({});
  const [sortOption, setSortOption] = useState<SortOption>("time");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const sortButtonRef = useRef<React.ElementRef<typeof TouchableOpacity>>(null);
  const [expandedTableIds, setExpandedTableIds] = useState<Record<string, boolean>>({});
  const toggleTableExpand = useCallback((tableId: string) => {
    setExpandedTableIds((prev) => ({ ...prev, [tableId]: !prev[tableId] }));
  }, []);

  const ordersByLocationId = useMemo(() => {
    const map: Record<string, (typeof ordersById)[string]> = {};
    for (const order of Object.values(ordersById)) {
      if (order.service_location_id && order.order_status !== "void") {
        map[order.service_location_id] = order;
      }
    }
    return map;
  }, [ordersById]);

  const getTableOrderData = useCallback((tableId: string) => {
    const order = ordersByLocationId[tableId];
    return {
      order,
      seatedTime: order?.opened_at ? new Date(order.opened_at).getTime() : 0,
      guestCount: order?.guest_count || 0,
      total: order?.items.reduce((sum, item) => sum + item.price * item.quantity, 0) || 0,
    };
  }, [ordersByLocationId]);

  const sortedSeatedTables = useMemo(() => {
    const activeStates = ["seated", "ordered", "served", "in use", "check_presented", "paid"];
    const seatedTables = tables.filter((table) => {
      if (table.category !== "table" && table.category !== "booth") return false;
      const session = liveSessions[table.id] ?? table.session;
      return activeStates.includes((session?.status || "available").toLowerCase());
    });
    return seatedTables.sort((a, b) => {
      const aData = getTableOrderData(a.id);
      const bData = getTableOrderData(b.id);
      let compare = 0;
      switch (sortOption) {
        case "time": compare = aData.seatedTime - bData.seatedTime; break;
        case "name": compare = a.name.localeCompare(b.name); break;
        case "guests": compare = aData.guestCount - bData.guestCount; break;
        case "total": compare = aData.total - bData.total; break;
      }
      return sortDirection === "asc" ? compare : -compare;
    });
  }, [tables, getTableOrderData, sortOption, sortDirection, liveSessions]);

  const serversWithTables = useMemo(() => {
    const serverTableMap: Record<string, FloorPlanObject[]> = {};
    sortedSeatedTables.forEach((table) => {
      const order = ordersByLocationId[table.id];
      const serverName = order?.server_name || "Unassigned";
      if (!serverTableMap[serverName]) serverTableMap[serverName] = [];
      serverTableMap[serverName].push(table);
    });
    return serverTableMap;
  }, [sortedSeatedTables, ordersByLocationId]);

  const filteredSeatedTables = useMemo(() => {
    if (activeFilter === "All") return sortedSeatedTables;
    if (activeFilter === "My Tables") {
      const currentUser = employees.find((e) => e.id === activeEmployeeId);
      if (!currentUser) return [];
      return sortedSeatedTables.filter((t) => ordersByLocationId[t.id]?.server_name === currentUser.fullName);
    }
    return [];
  }, [activeFilter, sortedSeatedTables, ordersByLocationId, activeEmployeeId, employees]);

  const toggleServerSection = (serverName: string) => {
    setExpandedServers((prev) => ({ ...prev, [serverName]: !prev[serverName] }));
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

  const FILTERS = ["All", "My Tables", "By Server"];

  const renderContent = () => {
    if (activeFilter === "By Server") {
      return (
        <FlatList
          data={Object.entries(serversWithTables)}
          keyExtractor={([serverName]) => serverName}
          renderItem={({ item: [serverName, serverTables] }) => (
            <Collapsible key={serverName} open={expandedServers[serverName] ?? true} onOpenChange={() => toggleServerSection(serverName)} style={{ marginBottom: 8 }}>
              <CollapsibleTrigger style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.card }}>
                {(expandedServers[serverName] ?? true)
                  ? <ChevronDown size={13} color={colors.muted} />
                  : <ChevronRight size={13} color={colors.muted} />}
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.label, marginLeft: 6 }}>{serverName}</Text>
              </CollapsibleTrigger>
              <CollapsibleContent style={{ paddingLeft: 4, paddingTop: 4 }}>
                {serverTables.map((table) => (
                  <View key={table.id} style={{ marginBottom: 4 }}>
                    <TableListItem table={table} isExpanded={expandedTableIds[table.id] || false} onToggleExpand={() => toggleTableExpand(table.id)} onNavigateToOrder={() => {}} handleTablePress={() => toggleTableExpand(table.id)} />
                  </View>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}
          contentContainerStyle={{ padding: 8 }}
          ListEmptyComponent={() => (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
              <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center' }}>No seated tables for this filter.</Text>
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
          <View style={{ marginBottom: 4 }}>
            <TableListItem table={item} isExpanded={expandedTableIds[item.id] || false} onToggleExpand={() => toggleTableExpand(item.id)} onNavigateToOrder={() => {}} handleTablePress={() => toggleTableExpand(item.id)} />
          </View>
        )}
        contentContainerStyle={{ padding: 8 }}
        ListEmptyComponent={() => (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center' }}>No seated tables for this filter.</Text>
          </View>
        )}
      />
    );
  };

  return (
    <View style={{ flex: 1, flexDirection: 'column', backgroundColor: colors.screen }}>
      {/* Filters + Sort */}
      <View style={{ paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 10 }}>
        {/* Filter pills */}
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {FILTERS.map((filter) => (
            <TouchableOpacity
              key={filter}
              onPress={() => setActiveFilter(filter)}
              style={{
                paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1,
                backgroundColor: activeFilter === filter ? colors.teal + '20' : colors.screen,
                borderColor: activeFilter === filter ? colors.teal + '50' : colors.border,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '600', color: activeFilter === filter ? colors.teal : colors.label }}>
                {filter}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Sort */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 11, color: colors.muted }}>Sort by</Text>
          <TouchableOpacity ref={sortButtonRef} onPress={openSortDropdown}>
            <SortDropdown isOpen={isSortDropdownOpen} setIsOpen={setIsSortDropdownOpen} sortOption={sortOption} sortDirection={sortDirection} onSortChange={handleSortChange} triggerPosition={dropdownPosition} />
          </TouchableOpacity>
        </View>
      </View>

      {renderContent()}
    </View>
  );
};

export default SeatedPanel;
