import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { getJSON, setJSON } from "@/lib/storage";
import { colors, spinnerColor } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { clearLocationData } from "@/services/cacheService";
import {
  SelectedLocation,
  useStoreSettingsStore,
} from "@/stores/useStoreSettingsStore";
import { useAuth, useClerk } from "@clerk/clerk-expo";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { LogOut, MapPin, Store } from "lucide-react-native";
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

const StoreSelectItem = ({ store, isSelected, onPress }: StoreSelectItemProps) => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  return (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.7}
    style={{
      backgroundColor: isSelected ? colors.teal + "10" : colors.card,
      borderWidth: 1,
      borderColor: isSelected ? colors.teal + "50" : colors.border,
      borderRadius: s(10),
      paddingHorizontal: s(14),
      paddingVertical: s(10),
      marginBottom: s(8),
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    }}
  >
    <View style={{ flexDirection: "row", alignItems: "center", flex: 1, gap: s(12) }}>
      <View
        style={{
          width: s(34),
          height: s(34),
          borderRadius: s(8),
          backgroundColor: isSelected ? colors.teal + "20" : colors.screen,
          borderWidth: 1,
          borderColor: isSelected ? colors.teal + "40" : colors.border,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Store size={s(16)} color={isSelected ? colors.teal : colors.muted} />
      </View>

      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: s(13),
            fontWeight: "600",
            color: isSelected ? colors.teal : colors.heading,
            marginBottom: s(2),
          }}
        >
          {store.name}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: s(4) }}>
          <MapPin size={s(10)} color={colors.muted} />
          <Text style={{ fontSize: s(11), color: colors.muted }}>
            {store.city}, {store.state}
          </Text>
        </View>
      </View>
    </View>

    <View style={{ alignItems: "flex-end", gap: s(4) }}>
      {store.code && (
        <Text style={{ fontSize: s(10), fontWeight: "600", color: colors.muted }}>
          {store.code}
        </Text>
      )}
      {store.is_active && (
        <View
          style={{
            backgroundColor: colors.success + "15",
            borderWidth: 1,
            borderColor: colors.success + "40",
            borderRadius: s(20),
            paddingHorizontal: s(8),
            paddingVertical: s(2),
          }}
        >
          <Text style={{ fontSize: s(10), fontWeight: "600", color: colors.success }}>
            Active
          </Text>
        </View>
      )}
    </View>
  </TouchableOpacity>
  );
};

const StoreSelectScreen = () => {
  const router = useRouter();
  const { userId } = useAuth();
  const { signOut } = useClerk();
  const supabase = useSupabaseClient();
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);

  const handleLogout = async () => {
    try {
      await signOut();
    } finally {
      router.replace("/login");
    }
  };
  const setSelectedStore = useStoreSettingsStore((state) => state.setSelectedStore);
  const setOrganizationLogoUrl = useStoreSettingsStore((state) => state.setOrganizationLogoUrl);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);

  const { data: queryResult, isLoading, error } = useQuery({
    queryKey: ["locations", userId],
    queryFn: async (): Promise<{ locations: Location[]; orgLogoUrl: string | null; merchantPricing: { pricing_strategy: string; dual_pricing_percentage: number } | null }> => {
      if (!userId) return { locations: [], orgLogoUrl: null, merchantPricing: null };

      const cacheKey = `accessible-locations:${userId}`;

      try {
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

        // Get only locations this user has access to
        const { data: accessibleLocations, error: accessError } = await supabase.rpc(
          "get_user_accessible_locations",
          { p_user_id: userId }
        );

        if (accessError) throw accessError;
        if (!accessibleLocations || accessibleLocations.length === 0) {
          return { locations: [], orgLogoUrl, merchantPricing: { pricing_strategy: merchant.pricing_strategy, dual_pricing_percentage: merchant.dual_pricing_percentage } };
        }

        const accessibleLocationIds = accessibleLocations.map((l: { location_id: string }) => l.location_id);

        const { data: locationsData, error: locationsError } = await supabase
          .from("locations")
          .select("*")
          .eq("merchant_id", merchant.id)
          .in("id", accessibleLocationIds)
          .order("created_at", { ascending: false });

        if (locationsError) throw locationsError;

        const result = {
          locations: (locationsData as Location[]) || [],
          orgLogoUrl,
          merchantPricing: { pricing_strategy: merchant.pricing_strategy, dual_pricing_percentage: merchant.dual_pricing_percentage },
        };

        // Cache successful result for offline fallback
        setJSON(cacheKey, result);

        return result;
      } catch (err) {
        // Offline fallback: return cached data if available
        const cached = getJSON<{ locations: Location[]; orgLogoUrl: string | null; merchantPricing: { pricing_strategy: string; dual_pricing_percentage: number } | null }>(cacheKey);
        if (cached) return cached;
        throw err;
      }
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

  const logoutButton = (
    <TouchableOpacity
      onPress={handleLogout}
      style={{
        marginTop: s(10),
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: s(6),
        paddingVertical: s(9),
        paddingHorizontal: s(14),
        borderRadius: s(10),
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
      }}
    >
      <LogOut size={s(13)} color={colors.muted} />
      <Text style={{ fontSize: s(12), fontWeight: "600", color: colors.muted }}>
        Log out
      </Text>
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <View style={{ width: "100%", alignItems: "center", justifyContent: "center", paddingVertical: s(60) }}>
        <ActivityIndicator size="small" color={spinnerColor} />
        <Text style={{ fontSize: s(12), color: colors.muted, marginTop: s(10) }}>
          Loading your locations...
        </Text>
        {logoutButton}
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ width: "100%", alignItems: "center", justifyContent: "center", paddingVertical: s(60), gap: s(6) }}>
        <Text style={{ fontSize: s(13), fontWeight: "600", color: colors.danger, textAlign: "center" }}>
          Failed to load locations
        </Text>
        <Text style={{ fontSize: s(12), color: colors.muted, textAlign: "center" }}>
          {(error as Error).message || "Please try again later"}
        </Text>
        {logoutButton}
      </View>
    );
  }

  if (!locations || locations.length === 0) {
    return (
      <View style={{ width: "100%", alignItems: "center", justifyContent: "center", paddingVertical: s(60), gap: s(6) }}>
        <Text style={{ fontSize: s(13), fontWeight: "600", color: colors.label, textAlign: "center" }}>
          No locations available
        </Text>
        <Text style={{ fontSize: s(12), color: colors.muted, textAlign: "center" }}>
          Contact your administrator for access
        </Text>
        {logoutButton}
      </View>
    );
  }

  return (
    <View style={{ width: "100%" }}>
      {/* Header */}
      <Text style={{ fontSize: s(15), fontWeight: "700", color: colors.heading, marginBottom: s(4) }}>
        Select Store
      </Text>
      <Text style={{ fontSize: s(11), color: colors.muted, marginBottom: s(14) }}>
        Choose a location to continue
      </Text>

      <ScrollView style={{ maxHeight: s(320) }} showsVerticalScrollIndicator={false}>
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
          marginTop: s(14),
          backgroundColor: selectedStoreId ? colors.teal : colors.teal + "30",
          borderRadius: s(10),
          paddingVertical: s(11),
          alignItems: "center",
        }}
      >
        <Text
          style={{
            fontSize: s(13),
            fontWeight: "700",
            color: selectedStoreId ? colors.onSolid : colors.muted,
          }}
        >
          Continue
        </Text>
      </TouchableOpacity>

      {logoutButton}
    </View>
  );
};

export default StoreSelectScreen;
