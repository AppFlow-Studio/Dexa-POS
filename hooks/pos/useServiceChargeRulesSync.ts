import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { isServiceChargeEnabled } from "@/lib/serviceCharge";
import {
  ServiceChargeRule,
  useServiceChargeRulesStore,
} from "@/stores/useServiceChargeRulesStore";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

interface SyncArgs {
  merchantId: string | null;
  locationId: string | null;
}

export const useServiceChargeRulesSync = ({
  merchantId,
  locationId,
}: SyncArgs) => {
  const supabase = useSupabaseClient();
  const setRules = useServiceChargeRulesStore((s) => s.setRules);
  const setLastFetchError = useServiceChargeRulesStore(
    (s) => s.setLastFetchError,
  );

  const enabled =
    isServiceChargeEnabled && !!supabase && !!merchantId && !!locationId;

  const query = useQuery({
    queryKey: ["service_charge_rules", merchantId, locationId],
    queryFn: async (): Promise<ServiceChargeRule[]> => {
      if (!merchantId) throw new Error("merchant_id required");

      const { data, error } = await supabase!
        .from("service_charge_rules")
        .select(
          "id, merchant_id, location_id, name, rate_percent, min_party_size, applies_to_order_types, applies_on, is_taxable, auto_apply, is_active, updated_at",
        )
        .eq("merchant_id", merchantId)
        .or(
          locationId
            ? `location_id.eq.${locationId},location_id.is.null`
            : "location_id.is.null",
        );

      if (error) throw error;
      return (data ?? []) as unknown as ServiceChargeRule[];
    },
    enabled,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  useEffect(() => {
    if (query.data) {
      setRules(query.data);
    }
  }, [query.data, setRules]);

  useEffect(() => {
    if (query.error) {
      const msg =
        query.error instanceof Error ? query.error.message : String(query.error);
      console.warn("[service_charge_rules] fetch failed", msg);
      setLastFetchError(msg);
    } else if (query.isSuccess) {
      setLastFetchError(null);
    }
  }, [query.error, query.isSuccess, setLastFetchError]);

  return query;
};
