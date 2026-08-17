import type { SupabaseClient } from "@supabase/supabase-js";

type AccessibleLocationRow = {
  location_id: string;
};

/**
 * Resolve whether the current identity can reach exactly one active location.
 * Merchant admins are not guaranteed to have location_members rows, so they
 * must count the merchant's locations instead of the accessible-locations RPC.
 */
export async function resolveIsSingleLocation(
  supabase: SupabaseClient,
  userId: string,
  merchantId: string,
): Promise<boolean> {
  const { data: isMerchantAdmin, error: adminError } = await supabase.rpc(
    "is_merchant_admin",
    { p_merchant_id: merchantId },
  );

  if (adminError) throw adminError;

  let activeLocationsQuery = supabase
    .from("locations")
    .select("id")
    .eq("merchant_id", merchantId)
    .eq("is_active", true);

  if (!isMerchantAdmin) {
    const { data: accessibleLocations, error: accessibleError } =
      await supabase.rpc("get_user_accessible_locations", {
        p_user_id: userId,
      });

    if (accessibleError) throw accessibleError;

    const accessibleLocationIds = [
      ...new Set(
        ((accessibleLocations ?? []) as AccessibleLocationRow[]).map(
          (location) => location.location_id,
        ),
      ),
    ];

    if (accessibleLocationIds.length === 0) return false;
    activeLocationsQuery = activeLocationsQuery.in(
      "id",
      accessibleLocationIds,
    );
  }

  const { data: activeLocations, error: locationsError } =
    await activeLocationsQuery;

  if (locationsError) throw locationsError;
  return activeLocations?.length === 1;
}
