import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { colors, spinnerColor } from "@/lib/theme";
import { clearLocationData } from "@/services/cacheService";
import {
  SelectedLocation,
  useStoreSettingsStore,
} from "@/stores/useStoreSettingsStore";
import { useAuth } from "@clerk/clerk-expo";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { MapPin, Store } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface Location {
  id: string;
  merchant_id: string;
  name: string;
  code: string | null;
  city: string;
  state: string;
  is_active: boolean;
  is_accepting_orders: boolean;
}

interface StoreSelectItemProps {
  store: Location;
  isSelected: boolean;
  onPress: () => void;
}

const StoreSelectItem = ({ store, isSelected, onPress }: StoreSelectItemProps) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.7}
    style={{
      backgroundColor: isSelected ? colors.teal + "10" : colors.card,
      borderWidth: 1,
      borderColor: isSelected ? colors.teal + "50" : colors.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginBottom: 8,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    }}
  >
    <View style={{ flexDirection: "row", alignItems: "center", flex: 1, gap: 12 }}>
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 8,
          backgroundColor: isSelected ? colors.teal + "20" : colors.screen,
          borderWidth: 1,
          borderColor: isSelected ? colors.teal + "40" : colors.border,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Store size={16} color={isSelected ? colors.teal : colors.muted} />
      </View>

      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 13,
            fontWeight: "600",
            color: isSelected ? colors.teal : colors.heading,
            marginBottom: 2,
          }}
        >
          {store.name}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <MapPin size={10} color={colors.muted} />
          <Text style={{ fontSize: 11, color: colors.muted }}>
            {store.city}, {store.state}
          </Text>
        </View>
      </View>
    </View>

    <View style={{ alignItems: "flex-end", gap: 4 }}>
      {store.code && (
        <Text style={{ fontSize: 10, fontWeight: "600", color: colors.muted }}>
          {store.code}
        </Text>
      )}
      {store.is_active && (
        <View
          style={{
            backgroundColor: colors.success + "15",
            borderWidth: 1,
            borderColor: colors.success + "40",
            borderRadius: 20,
            paddingHorizontal: 8,
            paddingVertical: 2,
          }}
        >
          <Text style={{ fontSize: 10, fontWeight: "600", color: colors.success }}>
            Active
          </Text>
        </View>
      )}
    </View>
  </TouchableOpacity>
);

const StoreSelectScreen = () => {
  const router = useRouter();
  const { userId } = useAuth();
  const supabase = useSupabaseClient();
  const setSelectedStore = useStoreSettingsStore((state) => state.setSelectedStore);
  const setOrganizationLogoUrl = useStoreSettingsStore((state) => state.setOrganizationLogoUrl);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);

  const { data: queryResult, isLoading, error } = useQuery({
    queryKey: ["locations", userId],
    queryFn: async (): Promise<{ locations: Location[]; orgLogoUrl: string | null; merchantPricing: { pricing_strategy: string; dual_pricing_percentage: number } | null }> => {
      if (!userId) return { locations: [], orgLogoUrl: null, merchantPricing: null };

      const { data: userData, error: userError } = await supabase
        .from("users")
        .select(`*, members(*, organizations(id, name, imageURL))`)
        .eq("id", userId)
        .single();

      if (userError) throw userError;

      const orgLogoUrl = userData?.members?.[0]?.organizations?.imageURL ?? null;
      const clerkOrgId = userData?.members?.[0]?.organizations?.id;

      if (!clerkOrgId) return { locations: [], orgLogoUrl, merchantPricing: null };

      const { data: merchant, error: merchantError } = await supabase
        .from("merchants")
        .select("id, pricing_strategy, dual_pricing_percentage")
        .eq("clerk_org_id", clerkOrgId)
        .single();

      if (merchantError) throw merchantError;
      if (!merchant) return { locations: [], orgLogoUrl, merchantPricing: null };

      const { data: locationsData, error: locationsError } = await supabase
        .from("locations")
        .select("*")
        .eq("merchant_id", merchant.id)
        .order("created_at", { ascending: false });

      if (locationsError) throw locationsError;

      return {
        locations: (locationsData as Location[]) || [],
        orgLogoUrl,
        merchantPricing: { pricing_strategy: merchant.pricing_strategy, dual_pricing_percentage: merchant.dual_pricing_percentage },
      };
    },
    enabled: !!userId,
  });

  const locations = queryResult?.locations;
  const orgLogoUrl = queryResult?.orgLogoUrl ?? null;
  const merchantPricing = queryResult?.merchantPricing ?? null;

  useEffect(() => {
    if (locations && locations.length > 0 && !selectedStoreId) {
      const activeLocation = locations.find((l) => l.is_active);
      setSelectedStoreId(activeLocation?.id || locations[0].id);
    }
  }, [locations, selectedStoreId]);

  const currentStoreId = useStoreSettingsStore((s) => s.selectedStore?.id);

  const handleContinue = () => {
    if (!selectedStoreId || !locations) return;
    if (currentStoreId && currentStoreId !== selectedStoreId) clearLocationData();
    const storeToSave = locations.find((l) => l.id === selectedStoreId);
    if (storeToSave) {
      const resolved = { ...storeToSave } as any;
      // Resolve effective pricing: merchant defaults unless location overrides
      if (resolved.use_merchant_pricing_defaults && merchantPricing) {
        resolved.pricing_strategy = merchantPricing.pricing_strategy;
        resolved.dual_pricing_percentage = parseFloat(merchantPricing.dual_pricing_percentage);
      }
      setSelectedStore(resolved as SelectedLocation);
    }
    setOrganizationLogoUrl(orgLogoUrl);
    router.replace("/station-select");
  };

  if (isLoading) {
    return (
      <View style={{ width: "100%", alignItems: "center", justifyContent: "center", paddingVertical: 60 }}>
        <ActivityIndicator size="small" color={spinnerColor} />
        <Text style={{ fontSize: 12, color: colors.muted, marginTop: 10 }}>
          Loading your locations...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ width: "100%", alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 6 }}>
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.danger, textAlign: "center" }}>
          Failed to load locations
        </Text>
        <Text style={{ fontSize: 12, color: colors.muted, textAlign: "center" }}>
          {(error as Error).message || "Please try again later"}
        </Text>
      </View>
    );
  }

  if (!locations || locations.length === 0) {
    return (
      <View style={{ width: "100%", alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 6 }}>
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.label, textAlign: "center" }}>
          No locations available
        </Text>
        <Text style={{ fontSize: 12, color: colors.muted, textAlign: "center" }}>
          Contact your administrator for access
        </Text>
      </View>
    );
  }

  return (
    <View style={{ width: "100%" }}>
      {/* Header */}
      <Text style={{ fontSize: 15, fontWeight: "700", color: colors.heading, marginBottom: 4 }}>
        Select Store
      </Text>
      <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 14 }}>
        Choose a location to continue
      </Text>

      <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
        {locations.map((store) => (
          <StoreSelectItem
            key={store.id}
            store={store}
            isSelected={selectedStoreId === store.id}
            onPress={() => setSelectedStoreId(store.id)}
          />
        ))}
      </ScrollView>

      <TouchableOpacity
        onPress={handleContinue}
        disabled={!selectedStoreId}
        style={{
          marginTop: 14,
          backgroundColor: selectedStoreId ? colors.teal : colors.teal + "30",
          borderRadius: 10,
          paddingVertical: 11,
          alignItems: "center",
        }}
      >
        <Text
          style={{
            fontSize: 13,
            fontWeight: "700",
            color: selectedStoreId ? colors.onSolid : colors.muted,
          }}
        >
          Continue
        </Text>
      </TouchableOpacity>
    </View>
  );
};

export default StoreSelectScreen;
