import TableListItem from "@/components/tables/TableListItem";
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { ensureOrderPrefetched } from "@/services/tableOrderPrefetch";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePendingTableOverlay } from "@/stores/usePendingTableOverlay";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";
import { FloorPlanObject } from "@/types/db-floor-plan-types";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    FlatList,
    RefreshControl,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

/**
 * Wave 3.3: memoized row that binds parent's stable callbacks to the row's
 * tableId. Keeps TableListItem's existing `() => void` API intact while
 * giving the FlatList render path stable child references so the row's own
 * React.memo can bail out on unrelated state changes.
 */
const TableListItemRow = React.memo(function TableListItemRow({
  table,
  isExpanded,
  onToggleExpand,
  onNavigateToOrder,
  handleTablePress,
}: {
  table: FloorPlanObject;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
  onNavigateToOrder: (id: string) => void;
  handleTablePress: (table: FloorPlanObject) => void;
}) {
  const toggle = useCallback(
    () => onToggleExpand(table.id),
    [onToggleExpand, table.id],
  );
  const navigate = useCallback(
    () => onNavigateToOrder(table.id),
    [onNavigateToOrder, table.id],
  );
  return (
    <TableListItem
      table={table}
      isExpanded={isExpanded}
      onToggleExpand={toggle}
      onNavigateToOrder={navigate}
      handleTablePress={handleTablePress}
    />
  );
});

interface SectionProps {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({
  title,
  isOpen,
  onToggle,
  children,
}) => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);

  return (
    <View style={{ flex: 1 }}>
      {/* Section header */}
      <TouchableOpacity
        onPress={onToggle}
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: s(14),
          paddingVertical: s(8),
          paddingTop: s(14),
        }}
      >
        {isOpen ? (
          <ChevronDown size={s(12)} color={colors.muted} />
        ) : (
          <ChevronRight size={s(12)} color={colors.muted} />
        )}
        <Text
          style={{
            fontSize: s(10),
            fontWeight: "600",
            color: colors.muted,
            textTransform: "uppercase",
            letterSpacing: 0.8,
            marginLeft: s(4),
          }}
        >
          {title}
        </Text>
      </TouchableOpacity>
      {/* Grouped card container — iOS Settings style */}
      {isOpen && (
        <View
          style={{
            flex: 1,
            marginHorizontal: s(8),
            backgroundColor: colors.panel,
            borderRadius: s(10),
            overflow: "hidden",
          }}
        >
          {children}
        </View>
      )}
    </View>
  );
};

interface InlineSelectProps<T extends string> {
  label: string;
  value: T | null;
  options: { value: T; label: string }[];
  onSelect: (value: T | null) => void;
  nullable?: boolean;
}

function InlineSelect<T extends string>({
  label,
  value,
  options,
  onSelect,
  nullable = true,
}: InlineSelectProps<T>) {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const [open, setOpen] = useState(false);
  const selectedLabel = value
    ? (options.find((o) => o.value === value)?.label ?? value)
    : null;

  return (
    <View style={{ flex: 1 }}>
      <TouchableOpacity
        onPress={() => setOpen((o) => !o)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: s(8),
          paddingVertical: s(7),
          borderRadius: s(6),
          backgroundColor: colors.screen,
        }}
      >
        <Text
          style={{
            fontSize: s(11),
            fontWeight: "600",
            color: value ? colors.heading : colors.muted,
            flex: 1,
          }}
          numberOfLines={1}
        >
          {selectedLabel ?? label}
        </Text>
        <ChevronDown
          size={s(11)}
          color={colors.muted}
          style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}
        />
      </TouchableOpacity>

      {open && (
        <View
          style={{
            position: "absolute",
            top: s(36),
            left: 0,
            right: 0,
            zIndex: 100,
            backgroundColor: colors.panel,
            borderRadius: s(10),
            overflow: "hidden",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 12,
            elevation: 8,
          }}
        >
          {nullable && (
            <TouchableOpacity
              onPress={() => {
                onSelect(null);
                setOpen(false);
              }}
              style={{
                paddingHorizontal: s(14),
                paddingVertical: s(9),
              }}
            >
              <Text
                style={{
                  fontSize: s(12),
                  fontWeight: "500",
                  color: !value ? colors.teal : colors.label,
                }}
              >
                All
              </Text>
            </TouchableOpacity>
          )}
          {options.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              onPress={() => {
                onSelect(opt.value);
                setOpen(false);
              }}
              style={{
                paddingHorizontal: s(14),
                paddingVertical: s(9),
              }}
            >
              <Text
                style={{
                  fontSize: s(12),
                  fontWeight: "500",
                  color: value === opt.value ? colors.teal : colors.label,
                }}
                numberOfLines={1}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const TablesPanel: React.FC<{ onFocusTable?: (tableId: string) => void }> = ({
  onFocusTable,
}) => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);

  const floorPlans = useFloorPlanStore((s) => s.floorPlans);
  const tables = useFloorPlanStore((s) => s.tables);
  const activeFloorPlanId = useFloorPlanStore((s) => s.activeFloorPlanId);
  const liveSessions = useTableSessionStore((s) => s.sessions);
  const [sections, setSections] = useState<{ [key: string]: boolean }>({});
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [expandedTableIds, setExpandedTableIds] = useState<
    Record<string, boolean>
  >({});
  type SortMode = "name" | "status" | "duration";
  const [sortMode, setSortMode] = useState<SortMode>("status");

  const activePlanName = useMemo(() => {
    return (
      floorPlans.find((p) => p.id === activeFloorPlanId)?.name || "Dining Area"
    );
  }, [floorPlans, activeFloorPlanId]);

  useEffect(() => {
    if (activeFloorPlanId && sections[activeFloorPlanId] === undefined) {
      setSections((prev) => ({ ...prev, [activeFloorPlanId]: true }));
    }
  }, [activeFloorPlanId, sections]);

  const activeTables = tables;

  useEffect(() => {
    const validIds = new Set(activeTables.map((t) => t.id));
    setExpandedTableIds((prev) => {
      let changed = false;
      const next: Record<string, boolean> = {};
      for (const [tableId, expanded] of Object.entries(prev)) {
        if (validIds.has(tableId)) {
          next[tableId] = expanded;
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [activeTables]);

  // Collapse the expanded/"selected" state for any table that is no longer in an
  // active status (e.g. after Close Table → available/cleaning). Otherwise the
  // row keeps the teal selected background/border even though it's now closed —
  // the "row still marked as selected after closing" bug.
  useEffect(() => {
    setExpandedTableIds((prev) => {
      let changed = false;
      const next: Record<string, boolean> = {};
      for (const [tableId, expanded] of Object.entries(prev)) {
        const status = (liveSessions[tableId]?.status ?? "").toLowerCase();
        if (expanded && !ACTIVE_STATUSES.has(status)) {
          changed = true; // drop it — no longer expandable/selected
        } else {
          next[tableId] = expanded;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveSessions]);
  const isSeatable = (t: FloorPlanObject) =>
    t.category === "table" || t.category === "booth";
  const getEmployeeByStaffId = useEmployeeStore((s) => s.getEmployeeByStaffId);

  const STATUS_ORDER: Record<string, number> = {
    ordered: 0,
    seated: 1,
    served: 2,
    check_presented: 3,
    paid: 4,
    cleaning: 5,
    available: 6,
  };

  const ACTIVE_STATUSES = new Set([
    "seated",
    "ordered",
    "served",
    "check_presented",
    "paid",
  ]);

  const {
    uniqueServers,
    serverNames,
    displayTables,
    occupiedCount,
    capacityPercentage,
  } = useMemo(() => {
    const serverSet = new Set<string>();
    const nameMap: Record<string, string> = {};
    const seenSessionIds = new Set<string>();
    const filtered: typeof activeTables = [];
    let occupied = 0;

    for (const table of activeTables) {
      const session = liveSessions[table.id] ?? table.session;

      // Collect server info in same pass
      if (session?.server_staff_id) {
        const staffId = session.server_staff_id;
        serverSet.add(staffId);
        if (!nameMap[staffId]) {
          const employee = getEmployeeByStaffId(staffId);
          nameMap[staffId] = employee?.fullName || staffId.substring(0, 8);
        }
      }

      // Filter: must be seatable and dedupe merged sessions
      if (!isSeatable(table)) continue;
      if (session?.merged_tables?.length) {
        const sid = session.id;
        if (seenSessionIds.has(sid)) continue;
        seenSessionIds.add(sid);
      }

      // Filter by selected server
      if (selectedServerId && session?.server_staff_id !== selectedServerId)
        continue;

      filtered.push(table);
      if (ACTIVE_STATUSES.has(session?.status?.toLowerCase() || "")) occupied++;
    }

    filtered.sort((a, b) => {
      const sessionA = liveSessions[a.id] ?? a.session;
      const sessionB = liveSessions[b.id] ?? b.session;
      if (sortMode === "name") return a.name.localeCompare(b.name);
      if (sortMode === "status") {
        const sa = STATUS_ORDER[sessionA?.status?.toLowerCase() ?? ""] ?? 99;
        const sb = STATUS_ORDER[sessionB?.status?.toLowerCase() ?? ""] ?? 99;
        // Stable tiebreaker by name so tables of equal status keep a fixed
        // relative order instead of shuffling when a single status flips.
        if (sa !== sb) return sa - sb;
        return a.name.localeCompare(b.name);
      }
      if (sortMode === "duration") {
        const ta = sessionA?.seated_at
          ? new Date(sessionA.seated_at).getTime()
          : Infinity;
        const tb = sessionB?.seated_at
          ? new Date(sessionB.seated_at).getTime()
          : Infinity;
        return ta - tb;
      }
      return 0;
    });

    return {
      uniqueServers: Array.from(serverSet),
      serverNames: nameMap,
      displayTables: filtered,
      occupiedCount: occupied,
      capacityPercentage:
        filtered.length > 0
          ? Math.floor((occupied / filtered.length) * 100)
          : 0,
    };
  }, [
    activeTables,
    getEmployeeByStaffId,
    liveSessions,
    selectedServerId,
    sortMode,
  ]);

  const totalTables = displayTables.length;

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const locationId = useStoreSettingsStore.getState().selectedStore?.id;
      await useFloorPlanStore.getState().loadFloorPlanStatus();
      if (locationId)
        await useOrderStore.getState().initializeOrders(locationId, true);
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
    if (activeFloorPlanId)
      setSections((s) => ({
        ...s,
        [activeFloorPlanId]: !s[activeFloorPlanId],
      }));
  }, [activeFloorPlanId]);

  const handleFocusTable = useCallback(
    (table: FloorPlanObject) => {
      onFocusTable?.(table.id);
    },
    [onFocusTable],
  );

  const toggleTableExpand = useCallback((tableId: string) => {
    setExpandedTableIds((prev) => ({ ...prev, [tableId]: !prev[tableId] }));
  }, []);
  const navigateToTableOrder = useCallback((tableId: string) => {
    const orderId = useTableSessionStore.getState().sessions[tableId]?.order_id;
    if (orderId) {
      ensureOrderPrefetched(orderId).catch(() => {});
    }
    usePendingTableOverlay.getState().openTable(tableId);
  }, []);
  // Wave 3.3: row wrapper memoized on stable props. Without this, the inline
  // `() => toggleTableExpand(item.id)` arrow was a fresh function on every
  // parent render, busting React.memo on TableListItem and re-rendering every
  // row whenever any single row's expand state changed.
  const renderTableItem = useCallback(
    ({ item }: { item: FloorPlanObject }) => (
      <TableListItemRow
        table={item}
        isExpanded={!!expandedTableIds[item.id]}
        onToggleExpand={toggleTableExpand}
        onNavigateToOrder={navigateToTableOrder}
        handleTablePress={handleFocusTable}
      />
    ),
    [
      expandedTableIds,
      navigateToTableOrder,
      handleFocusTable,
      toggleTableExpand,
    ],
  );
  const keyExtractor = useCallback((item: FloorPlanObject) => item.id, []);

  return (
    <View
      style={{
        flex: 1,
        flexDirection: "column",
        backgroundColor: colors.screen,
      }}
    >
      {/* Capacity bar — iOS-style group card */}
      <View
        style={{
          marginHorizontal: s(8),
          marginTop: s(10),
          marginBottom: s(4),
          backgroundColor: colors.panel,
          borderRadius: s(10),
          paddingHorizontal: s(14),
          paddingVertical: s(12),
          overflow: "hidden",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            marginBottom: s(5),
          }}
        >
          <Text
            style={{
              fontSize: s(10),
              fontWeight: "600",
              color: colors.muted,
              letterSpacing: 0.5,
              textTransform: "uppercase",
            }}
          >
            Capacity
          </Text>
          <Text
            style={{
              fontSize: s(11),
              fontWeight: "700",
              color: colors.heading,
              fontVariant: ["tabular-nums"],
            }}
          >
            {occupiedCount}/{totalTables} · {capacityPercentage}%
          </Text>
        </View>
        <View
          style={{
            height: s(3),
            backgroundColor: colors.border + "50",
            borderRadius: s(2),
            overflow: "hidden",
          }}
        >
          <View
            style={{
              width: `${capacityPercentage}%`,
              height: "100%",
              backgroundColor: colors.teal,
              borderRadius: s(2),
            }}
          />
        </View>
      </View>

      {/* Filters — iOS-style group card */}
      <View
        style={{
          marginHorizontal: s(8),
          marginBottom: s(4),
          backgroundColor: colors.panel,
          borderRadius: s(10),
          paddingHorizontal: s(10),
          paddingVertical: s(8),
          zIndex: 10,
          overflow: "visible",
        }}
      >
        <View style={{ flexDirection: "row", gap: s(6) }}>
          <InlineSelect
            label="Server"
            value={selectedServerId}
            options={uniqueServers.map((id) => ({
              value: id,
              label: serverNames[id] || id.substring(0, 8),
            }))}
            onSelect={setSelectedServerId}
          />
          <InlineSelect
            label="Sort"
            value={sortMode}
            options={[
              { value: "name", label: "Name" },
              { value: "status", label: "Status" },
              { value: "duration", label: "Duration" },
            ]}
            onSelect={(v) => v && setSortMode(v)}
            nullable={false}
          />
        </View>
      </View>

      {/* Table list */}
      <View style={{ flex: 1 }}>
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
              extraData={expandedTableIds}
              ListEmptyComponent={
                <Text
                  style={{
                    fontSize: s(12),
                    color: colors.muted,
                    padding: s(8),
                    fontStyle: "italic",
                  }}
                >
                  No tables assigned
                </Text>
              }
              initialNumToRender={8}
              maxToRenderPerBatch={5}
              windowSize={3}
              removeClippedSubviews={true}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  tintColor={colors.teal}
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
