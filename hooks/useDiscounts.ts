import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import {
    DiscountRecord,
    getLocalDiscounts,
    syncDiscounts,
} from "@/services/discountSync";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useQuery } from "@tanstack/react-query";

export function useDiscounts() {
    const supabase = useSupabaseClient();
    const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
    const merchantId = selectedStore?.merchant_id;

    return useQuery({
        queryKey: ["discounts", merchantId],
        queryFn: async (): Promise<DiscountRecord[]> => {
            if (merchantId) {
                await syncDiscounts(supabase, merchantId);
            }
            return getLocalDiscounts();
        },
        placeholderData: () => getLocalDiscounts(),
        staleTime: 5 * 60 * 1000,
        gcTime: Infinity,
        networkMode: "offlineFirst",
        enabled: !!merchantId,
    });
}

