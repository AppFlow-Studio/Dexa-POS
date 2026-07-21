import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { useMenuStore } from "@/stores/useMenuStore";
import type {
  ActiveModifierSnoozeSync,
  ActiveSnoozeSync,
} from "@/types/menu";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

/**
 * Keeps the POS menu's 86/out-of-stock state in sync with changes made
 * elsewhere — the merchant website, or another POS station.
 *
 * The main pos_sync query is `staleTime: Infinity` (a full get_pos_full_sync
 * rebuild is expensive and would clobber optimistic local 86s), so a website 86
 * would otherwise never reach an already-running POS until an app restart. This
 * hook does a cheap, surgical reconcile instead: it polls get_active_snoozes and
 * patches only the snooze flags into the store (no menu rebuild).
 *
 * Restores are detected by set difference — an id is cleared only if it was
 * active in the PREVIOUS fetch and is no longer active now. A just-applied local
 * optimistic 86 was never in a prior server fetch, so it can never be clobbered.
 */
export function useMenuSnoozeReconcile(locationId: string | undefined) {
  const supabase = useSupabaseClient();
  const reconcileSnoozes = useMenuStore((s) => s.reconcileSnoozes);
  const prevRef = useRef<{ items: Set<string>; mods: Set<string> }>({
    items: new Set(),
    mods: new Set(),
  });

  const { data } = useQuery({
    queryKey: ["menu_active_snoozes", locationId],
    enabled: !!locationId,
    // Cheap payload; poll so a 86 made mid-service on the website shows up
    // without waiting for an app restart. Also refetch on foreground/reconnect.
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    networkMode: "offlineFirst",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_active_snoozes", {
        p_location_id: locationId,
      });
      if (error) throw error;
      const raw =
        (data as {
          items?: ActiveSnoozeSync[];
          modifiers?: ActiveModifierSnoozeSync[];
        } | null) ?? {};
      return {
        items: (raw.items ?? []).filter((i) => i.snoozed_until),
        modifiers: (raw.modifiers ?? []).filter((m) => m.snoozed_until),
      };
    },
  });

  useEffect(() => {
    if (!data) return;
    const curItems = new Set(data.items.map((i) => i.menu_item_id));
    const curMods = new Set(data.modifiers.map((m) => m.modifier_group_item_id));

    const restoredItemIds = [...prevRef.current.items].filter(
      (id) => !curItems.has(id),
    );
    const restoredModifierIds = [...prevRef.current.mods].filter(
      (id) => !curMods.has(id),
    );

    reconcileSnoozes(
      data.items,
      data.modifiers,
      restoredItemIds,
      restoredModifierIds,
    );

    prevRef.current = { items: curItems, mods: curMods };
  }, [data, reconcileSnoozes]);
}
