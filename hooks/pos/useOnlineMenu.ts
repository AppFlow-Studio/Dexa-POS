import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { useQuery } from "@tanstack/react-query";

/**
 * Resolves the merchant's DESIGNATED online (OrderOut) menu for a location so
 * the POS can surface an "Online" badge. Read-only: publishing/designating the
 * online menu requires server secrets and stays on the website/admin.
 *
 * The designated menu is `orderout_menu_links.is_primary = true` under the
 * location's `orderout_restaurants` row. Reads are best-effort — if the location
 * isn't onboarded to OrderOut or RLS blocks these tables from a POS token, we
 * return null and simply render no badge.
 *
 * (Follow-up if RLS is too strict: a tiny `get_location_online_menu(p_location_id)`
 * read RPC on the website repo.)
 */
export const useOnlineMenu = (
  locationId: string | null | undefined,
): { onlineMenuId: string | null; isLoading: boolean } => {
  const supabase = useSupabaseClient();

  const { data, isLoading } = useQuery({
    queryKey: ["online_menu", locationId],
    queryFn: async () => {
      if (!locationId) return null;
      const { data: restaurant, error: rErr } = await supabase
        .from("orderout_restaurants")
        .select("id")
        .eq("location_id", locationId)
        .maybeSingle();
      if (rErr || !restaurant?.id) return null;

      const { data: links, error: lErr } = await supabase
        .from("orderout_menu_links")
        .select("menu_id, is_primary")
        .eq("orderout_restaurant_id", restaurant.id)
        .eq("is_active", true);
      if (lErr || !links) return null;

      return (
        links.find((l: { menu_id: string; is_primary: boolean }) => l.is_primary)
          ?.menu_id ?? null
      );
    },
    enabled: !!locationId,
    networkMode: "offlineFirst",
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60,
  });

  return { onlineMenuId: (data as string | null) ?? null, isLoading };
};
