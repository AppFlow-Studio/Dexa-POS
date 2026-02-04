import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { clearLocationData } from "@/services/cacheService";
import {
  SelectedLocation,
  useStoreSettingsStore,
} from "@/stores/useStoreSettingsStore";
import { useAuth } from "@clerk/clerk-expo";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// Type for location from database
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

const StoreSelectItem = ({
  store,
  isSelected,
  onPress,
}: StoreSelectItemProps) => (
  <TouchableOpacity
    onPress={onPress}
    className={`p-4 border rounded-lg mb-3 ${isSelected
      ? "border-blue-500 bg-blue-900/30"
      : "border-gray-700 bg-[#303030]"
      }`}
  >
    <View className="flex-row items-center justify-between">
      <View className="flex-1">
        <Text
          className={`text-xl font-medium ${isSelected ? "text-blue-400" : "text-white"
            }`}
        >
          {store.name}
        </Text>
        <Text
          className={`text-lg mt-1 ${isSelected ? "text-blue-300" : "text-gray-400"
            }`}
        >
          {store.city}, {store.state}
        </Text>
      </View>
      <View className="items-end">
        {store.code && (
          <Text className="text-sm text-gray-400">{store.code}</Text>
        )}
        {store.is_active && (
          <View className="bg-green-600 px-2 py-1 rounded mt-1">
            <Text className="text-white text-xs">Active</Text>
          </View>
        )}
      </View>
    </View>
  </TouchableOpacity>
);

const StoreSelectScreen = () => {
  const router = useRouter();
  const { userId } = useAuth();
  const supabase = useSupabaseClient();
  const setSelectedStore = useStoreSettingsStore(
    (state) => state.setSelectedStore
  );
  const setOrganizationLogoUrl = useStoreSettingsStore(
    (state) => state.setOrganizationLogoUrl
  );
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);

  // Fetch locations using same approach as website:
  // users → members → organizations → merchants → locations
  const {
    data: queryResult,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["locations", userId],
    queryFn: async (): Promise<{ locations: Location[]; orgLogoUrl: string | null }> => {
      if (!userId) return { locations: [], orgLogoUrl: null };

      console.log("Fetching locations for user:", userId);

      // Step 1: Get user with members and organizations
      // Note: organizations.id IS the clerk_org_id (Clerk's organization ID)
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select(
          `
          *,
          members(
            *,
            organizations(
              id,
              name,
              imageURL
            )
          )
        `
        )
        .eq("id", userId)
        .single();

      if (userError) {
        console.error("Error getting user info:", userError);
        throw userError;
      }

      console.log("User data:", JSON.stringify(userData, null, 2));

      // Extract organization logo URL
      const orgLogoUrl = userData?.members?.[0]?.organizations?.imageURL ?? null;
      // Step 2: Get organization ID - this IS the clerk_org_id
      // The organizations.id from Clerk is stored as clerk_org_id in merchants table
      const clerkOrgId = userData?.members?.[0]?.organizations?.id;

      if (!clerkOrgId) {
        console.log("No organization found for user");
        return { locations: [], orgLogoUrl };
      }

      console.log("Found clerkOrgId (organizations.id):", clerkOrgId);

      // Step 3: Get merchant by clerk_org_id
      const { data: merchant, error: merchantError } = await supabase
        .from("merchants")
        .select("id")
        .eq("clerk_org_id", clerkOrgId)
        .single();

      if (merchantError) {
        console.error("Error getting merchant:", merchantError);
        throw merchantError;
      }

      if (!merchant) {
        console.log("No merchant found for org:", clerkOrgId);
        return { locations: [], orgLogoUrl };
      }

      console.log("Found merchant:", merchant.id);

      // Step 4: Get locations for this merchant
      const { data: locationsData, error: locationsError } = await supabase
        .from("locations")
        .select("*")
        .eq("merchant_id", merchant.id)
        .order("created_at", { ascending: false });

      if (locationsError) {
        console.error("Error getting locations:", locationsError);
        throw locationsError;
      }

      console.log("Found locations:", locationsData[0]);

      return {
        locations: (locationsData as Location[]) || [],
        orgLogoUrl,
      };
    },
    enabled: !!userId,
  });

  const locations = queryResult?.locations;
  const orgLogoUrl = queryResult?.orgLogoUrl ?? null;

  // Auto-select first location
  useEffect(() => {
    if (locations && locations.length > 0 && !selectedStoreId) {
      const activeLocation = locations.find((l) => l.is_active);
      setSelectedStoreId(activeLocation?.id || locations[0].id);
    }
  }, [locations, selectedStoreId]);

  const currentStoreId = useStoreSettingsStore((s) => s.selectedStore?.id);

  const handleContinue = () => {
    if (!selectedStoreId || !locations) return;

    // Clear location-specific data if switching to a different store
    if (currentStoreId && currentStoreId !== selectedStoreId) {
      clearLocationData();
    }

    // Find the full location object
    const storeToSave = locations.find((l) => l.id === selectedStoreId);
    if (storeToSave) {
      // Save to store (persisted to MMKV)
      setSelectedStore(storeToSave as SelectedLocation);
    }

    // Persist organization logo URL if available
    setOrganizationLogoUrl(orgLogoUrl);

    // Navigate to station select instead of pin-login
    router.replace("/station-select");
  };

  // Loading state
  if (isLoading) {
    return (
      <View className="w-full items-center justify-center py-20">
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text className="text-gray-400 mt-4">Loading your locations...</Text>
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View className="w-full items-center justify-center py-20">
        <Text className="text-red-400 text-lg text-center">
          Failed to load locations
        </Text>
        <Text className="text-gray-400 mt-2 text-center">
          {(error as Error).message || "Please try again later"}
        </Text>
      </View>
    );
  }

  // No locations state
  if (!locations || locations.length === 0) {
    return (
      <View className="w-full items-center justify-center py-20">
        <Text className="text-gray-400 text-lg text-center">
          No locations available
        </Text>
        <Text className="text-gray-500 mt-2 text-center">
          Contact your administrator for access
        </Text>
      </View>
    );
  }

  return (
    <View className="w-full">
      <Text className="text-3xl font-semibold text-white text-center mb-6">
        Select Store
      </Text>

      <ScrollView className="h-80 mb-6">
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
        className={`w-full p-4 rounded-xl items-center ${selectedStoreId ? "bg-blue-600" : "bg-blue-400"
          }`}
      >
        <Text className="text-white text-xl font-bold">Continue</Text>
      </TouchableOpacity>
    </View>
  );
};

export default StoreSelectScreen;
