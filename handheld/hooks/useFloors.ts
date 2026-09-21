import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import type { FloorPlanObject, ServerSection } from "@/types/db-floor-plan-types";
import { useEffect, useMemo } from "react";
import { InteractionManager } from "react-native";
import { ALL_FLOORS, useTablesFilter } from "../lib/tablesFilterStore";
import type { Chip } from "../primitives";

export interface FloorTables {
  tables: FloorPlanObject[];
  sectionsById: Record<string, ServerSection>;
}

/** A table on any floor: the active plan first, then the prefetched plans. */
export function findTableAnywhere(tableId: string): FloorPlanObject | null {
  const s = useFloorPlanStore.getState();
  if (s.tablesById[tableId]) return s.tablesById[tableId];
  for (const plan of Object.values(s.floorPlanCache)) {
    const hit = plan.tables.find((t) => t.id === tableId);
    if (hit) return hit;
  }
  return null;
}

/** Reactive `findTableAnywhere`, plus the names of its floor's tables for merged titles. */
export function useTableAnywhere(tableId: string): { table: FloorPlanObject | null; floorTables: FloorPlanObject[] } {
  const active = useFloorPlanStore((s) => s.tablesById[tableId] ?? null);
  const activeTables = useFloorPlanStore((s) => s.tables);
  const cache = useFloorPlanStore((s) => s.floorPlanCache);
  return useMemo(() => {
    if (active) return { table: active, floorTables: activeTables };
    for (const plan of Object.values(cache)) {
      const hit = plan.tables.find((t) => t.id === tableId);
      if (hit) return { table: hit, floorTables: plan.tables };
    }
    return { table: null, floorTables: [] };
  }, [active, activeTables, cache, tableId]);
}

/**
 * Every floor's tables for the Tables tab and the table picker. The boot
 * diet loads only the default plan; the others are fetched here after the
 * first paint through the register's own `prefetchFloorPlans` (the store
 * keeps each plan ≤30 s fresh, and live status comes from the session store
 * regardless). The chosen floor lives in `useTablesFilter` so it survives
 * the tab unmounting.
 */
export function useFloors(): {
  chips: Chip[];
  floorId: string;
  setFloorId: (id: string) => void;
  floorName: string;
  floor: FloorTables;
} {
  const plans = useFloorPlanStore((s) => s.floorPlans);
  const activeId = useFloorPlanStore((s) => s.activeFloorPlanId);
  const activeTables = useFloorPlanStore((s) => s.tables);
  const activeSections = useFloorPlanStore((s) => s.sectionsById);
  const cache = useFloorPlanStore((s) => s.floorPlanCache);
  const floorId = useTablesFilter((s) => s.floorId);
  const setFloorId = useTablesFilter((s) => s.setFloorId);

  useEffect(() => {
    const others = plans.filter((p) => p.is_active !== false && p.id !== activeId).map((p) => p.id);
    if (others.length === 0) return;
    const task = InteractionManager.runAfterInteractions(() => {
      useFloorPlanStore.getState().prefetchFloorPlans(others).catch(() => {});
    });
    return () => task.cancel();
  }, [plans, activeId]);

  return useMemo(() => {
    const active = plans.filter((p) => p.is_active !== false);
    const one = (id: string): FloorTables =>
      id === activeId
        ? { tables: activeTables, sectionsById: activeSections }
        : { tables: cache[id]?.tables ?? [], sectionsById: cache[id]?.sectionsById ?? {} };
    const chips: Chip[] =
      active.length > 1
        ? [{ key: ALL_FLOORS, label: "All" }, ...active.map((p) => ({ key: p.id, label: p.name }))]
        : [];
    const selected = active.some((p) => p.id === floorId) ? floorId : ALL_FLOORS;
    const floor: FloorTables =
      selected === ALL_FLOORS
        ? active.reduce<FloorTables>(
            (acc, p) => {
              const f = one(p.id);
              return { tables: acc.tables.concat(f.tables), sectionsById: { ...acc.sectionsById, ...f.sectionsById } };
            },
            { tables: [], sectionsById: {} },
          )
        : one(selected);
    // Never the word "floor" on screen: restaurants name their plans
    // (rooms, patios, sections), so show the plan's own name or nothing.
    const floorName =
      selected === ALL_FLOORS
        ? active.length > 1
          ? ""
          : (active[0]?.name ?? "")
        : (active.find((p) => p.id === selected)?.name ?? "");
    return { chips, floorId: selected, setFloorId, floorName, floor };
  }, [plans, activeId, activeTables, activeSections, cache, floorId, setFloorId]);
}
