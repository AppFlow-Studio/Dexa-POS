import { useToast } from "@/contexts/ToastContext";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { isValidUUID } from "@/lib/offlineIdRegistry";
import {
    createCustomerOffline,
    createCustomerOnline,
    fetchAndCacheCustomers,
    getCachedCustomers,
    linkCustomerToOrder,
    processCustomerQueue,
} from "@/services/customer";
import { getIsOnline } from "@/services/offlineSyncService";
import { useActiveOrder } from "@/stores/selectors/orderSelectors";
import { useCustomerSheetStore } from "@/stores/useCustomerSheetStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import type { CustomerWithMeta } from "@/types/customer";
import BottomSheet, {
    BottomSheetBackdrop,
    BottomSheetFlatList,
    BottomSheetTextInput,
    BottomSheetView,
} from "@gorhom/bottom-sheet";
import { ArrowLeft, Search, X } from "lucide-react-native";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { bottomSheetTheme, colors } from "@/lib/theme";

// Helper to format address for display (handles JSON or string)
export const formatAddress = (address: string | null | undefined) => {
  if (!address) return "";
  try {
    const parsed = JSON.parse(address);
    if (parsed && typeof parsed === "object") {
      const parts = [
        parsed.street,
        parsed.city,
        parsed.state,
        parsed.zip,
      ].filter(Boolean);
      return parts.join(", ");
    }
    return address;
  } catch {
    return address;
  }
};

const CustomerSheet: React.FC = () => {
  const sheetRef = useRef<BottomSheetMethods>(null);
  const { isOpen, closeSheet, setSheetRef } = useCustomerSheetStore();
  const activeOrderId = useOrderStore((s) => s.activeOrderId);
  const updateActiveOrderDetails = useOrderStore((s) => s.updateActiveOrderDetails);
  const order = useActiveOrder();
  const selectedStore = useStoreSettingsStore((state) => state.selectedStore);
  const { show } = useToast();
  const supabase = useSupabaseClient();

  // Register ref with store so openSheet()/closeSheet() can call expand()/close() directly
  useLayoutEffect(() => {
    setSheetRef(sheetRef as React.RefObject<BottomSheetMethods>);
  }, [setSheetRef]);

  // Mode: "search" or "add"
  const [viewMode, setViewMode] = useState<"search" | "add">("search");

  // Search State
  const [searchQuery, setSearchQuery] = useState("");

  // Add Customer State
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  // Address Fields
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [zip, setZip] = useState("");

  const [customers, setCustomers] = useState<CustomerWithMeta[]>([]);
  const isAssignDisabled = !activeOrderId;

  // Use ref to access latest values without causing re-renders
  const storeRef = useRef({ selectedStore, supabase });
  storeRef.current = { selectedStore, supabase };

  const refreshCustomers = useCallback(async () => {
    // Always start with cached customers (works offline)
    setCustomers(getCachedCustomers());

    const { selectedStore: store, supabase: client } = storeRef.current;

    // If online, refresh from backend and process any queued ops
    if (store && getIsOnline()) {
      try {
        const updated = await fetchAndCacheCustomers(client, store.merchant_id);
        setCustomers(updated);
        await processCustomerQueue(client);
      } catch (err) {
        console.warn("Failed to refresh customers:", err);
      }
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      refreshCustomers();
      // Reset state on open
      setViewMode("search");
      setSearchQuery("");
      clearForm();
    }
  }, [isOpen, refreshCustomers]);

  const filteredCustomers = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return customers;

    return customers.filter((c: CustomerWithMeta) => {
      const nameMatch = (c.name || "").toLowerCase().includes(query);
      const phoneRaw = (c.phone ?? c.phoneNumber ?? "").toLowerCase();
      const phoneMatch = phoneRaw.includes(query);

      // Address matching - simplified
      // If address is JSON, we stringify it to search, or just check the raw string
      const addressMatch = (c.address || "").toLowerCase().includes(query);

      return nameMatch || phoneMatch || addressMatch;
    });
  }, [searchQuery, customers]);

  const handleSelectCustomer = async (customer: CustomerWithMeta) => {
    if (!activeOrderId) return;
    if (!selectedStore) {
      show({
        title: "No Store Selected",
        message: "Please select a store before assigning a customer.",
        type: "error",
      });
      return;
    }

    // Format address if it's JSON
    const displayAddress = formatAddress(customer.address);

    // Optimistic UI update for order details
    console.log("[CustomerSheet] customer", customer);
    updateActiveOrderDetails({
      customer_name: customer.name || "",
      customer_phone: customer.phone ?? customer.phoneNumber ?? "",
      customer_email: customer.email || "",
      delivery_address: displayAddress,
      customer_id: customer.id,
    });

    const sanitizedDbOrderId =
      order?.db_order_id && isValidUUID(order.db_order_id)
        ? order.db_order_id
        : null;

    try {
      console.log("[CustomerSheet] order", order?.db_order_id);
      await linkCustomerToOrder(supabase, {
        orderId: activeOrderId,
        dbOrderId: sanitizedDbOrderId,
        customerId: customer.id,
        merchantId: selectedStore.id,
      });

      show({
        title: customer.is_offline ? "Customer Queued" : "Customer Assigned",
        message: customer.is_offline
          ? `${customer.name || "Customer"} will sync when online.`
          : `${customer.name || "Customer"} has been assigned to the order.`,
        type: customer.is_offline ? "warning" : "success",
      });
      handleClose();
    } catch (error: any) {
      show({
        title: "Could Not Assign Customer",
        message: error.message || "An unexpected error occurred.",
        type: "error",
      });
    }
  };

  const handlePhoneChange = (text: string) => {
    // Strip non-numeric characters
    const cleaned = text.replace(/\D/g, "");

    // Format as (###) - ### - ####
    let formatted = cleaned;
    if (cleaned.length > 6) {
      formatted = `(${cleaned.slice(0, 3)}) - ${cleaned.slice(3, 6)} - ${cleaned.slice(6, 10)}`;
    } else if (cleaned.length > 3) {
      formatted = `(${cleaned.slice(0, 3)}) - ${cleaned.slice(3)}`;
    } else if (cleaned.length > 0) {
      formatted = `(${cleaned}`;
    }

    setNewPhone(formatted);
  };

  const handleSaveNewCustomer = async () => {
    // Validate
    const rawPhone = newPhone.replace(/\D/g, "");
    if (!newName.trim() || rawPhone.length < 10) {
      show({
        title: "Missing Information",
        message: "Please enter a valid name and a 10-digit phone number.",
        type: "error",
      });
      return;
    }

    if (!selectedStore) {
      show({
        title: "No Store Selected",
        message: "Please select a store before adding a customer.",
        type: "error",
      });
      return;
    }

    // Construct address JSON
    const addressObj = {
      street: street.trim(),
      city: city.trim(),
      state: stateCode.trim(),
      zip: zip.trim(),
    };
    // Only save address if at least one field is filled
    const hasAddress = Object.values(addressObj).some((val) => val.length > 0);
    const addressString = hasAddress ? JSON.stringify(addressObj) : "";

    const online = getIsOnline();

    try {
      const newCustomer = online
        ? await createCustomerOnline(supabase, {
            merchantId: selectedStore.merchant_id,
            name: newName.trim(),
            phone: newPhone.trim(), // Save formatted or raw? Usually raw is better for search, but user wants format. Saving formatted for consistency with request.
            address: addressString,
          })
        : createCustomerOffline({
            merchantId: selectedStore.id,
            name: newName.trim(),
            phone: newPhone.trim(),
            address: addressString,
          });

      setCustomers(getCachedCustomers());
      await handleSelectCustomer(newCustomer);
    } catch (error: any) {
      show({
        title: "Could Not Add Customer",
        message: error.message,
        type: "error",
      });
    }
  };

  const clearForm = () => {
    setNewName("");
    setNewPhone("");
    setStreet("");
    setCity("");
    setStateCode("");
    setZip("");
  };

  const handleClose = () => {
    closeSheet();
    clearForm();
    setViewMode("search");
  };

  const snapPoints = useMemo(() => ["85%", "90%"], []);

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={handleClose}
      {...bottomSheetTheme}
      backdropComponent={(props) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
        />
      )}
    >
      <BottomSheetView className="flex-1" style={{ backgroundColor: colors.screen }}>
        {/* Header */}
        <View className="flex-row justify-between items-center px-5 py-4 border-b" style={{ borderColor: colors.border }}>
          <View className="flex-row items-center gap-x-3">
            {viewMode === "add" && (
              <TouchableOpacity onPress={() => setViewMode("search")} className="mr-1">
                <ArrowLeft color={colors.label} size={20} />
              </TouchableOpacity>
            )}
            <Text className="text-base font-bold" style={{ color: colors.heading }}>
              {viewMode === "search" ? "Assign Customer" : "Add Customer"}
            </Text>
          </View>
          <View className="flex-row gap-x-3 items-center">
            {viewMode === "search" && (
              <TouchableOpacity
                disabled={isAssignDisabled}
                onPress={() => setViewMode("add")}
                className="px-4 py-2 rounded-xl"
                style={{ backgroundColor: isAssignDisabled ? colors.teal + "60" : colors.teal }}
              >
                <Text className="text-sm font-semibold" style={{ color: colors.onSolid }}>+ New</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={handleClose} className="p-1.5 rounded-lg" style={{ backgroundColor: colors.panel }}>
              <X color={colors.label} size={18} />
            </TouchableOpacity>
          </View>
        </View>

        {viewMode === "search" ? (
          <View className="flex-1">
            <View className="px-4 pt-4 pb-2">
              <View className="flex-row items-center rounded-xl px-3 h-12 border" style={{ backgroundColor: colors.panel, borderColor: colors.border }}>
                <Search size={16} color={colors.label} />
                <BottomSheetTextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search name, phone, address..."
                  placeholderTextColor={colors.muted}
                  style={{ flex: 1, marginLeft: 10, color: colors.heading, fontSize: 14 }}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery("")}>
                    <X size={16} color={colors.muted} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <BottomSheetFlatList
              data={filteredCustomers}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
              renderItem={({ item }: { item: CustomerWithMeta }) => (
                <TouchableOpacity
                  disabled={isAssignDisabled}
                  onPress={() => handleSelectCustomer(item)}
                  className="flex-row items-center px-4 py-3 rounded-xl border mb-2"
                  style={{
                    backgroundColor: colors.panel,
                    borderColor: colors.border,
                    opacity: isAssignDisabled ? 0.6 : 1,
                  }}
                >
                  <View className="w-9 h-9 rounded-full items-center justify-center mr-3" style={{ backgroundColor: colors.teal + "20" }}>
                    <Text className="text-sm font-bold" style={{ color: colors.teal }}>
                      {(item.name || "?")[0].toUpperCase()}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-semibold" style={{ color: colors.heading }}>{item.name || "Unknown"}</Text>
                    <Text className="text-xs mt-0.5" style={{ color: colors.label }}>{item.phone ?? item.phoneNumber}</Text>
                    {item.address ? (
                      <Text className="text-xs mt-0.5" style={{ color: colors.muted }} numberOfLines={1}>{formatAddress(item.address)}</Text>
                    ) : null}
                  </View>
                  {item.is_offline && (
                    <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: colors.warning + "20" }}>
                      <Text className="text-xs" style={{ color: colors.warning }}>Offline</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text className="text-sm text-center py-10" style={{ color: colors.muted }}>No customers found.</Text>
              }
            />
          </View>
        ) : (
          <View className="p-5 gap-y-4">
            <Text className="text-xs" style={{ color: colors.muted }}>Address fields are optional.</Text>

            <View className="gap-y-1.5">
              <Text className="text-xs font-semibold uppercase tracking-wider" style={{ color: colors.label }}>Full Name *</Text>
              <BottomSheetTextInput
                value={newName}
                onChangeText={setNewName}
                placeholder="e.g. John Doe"
                placeholderTextColor={colors.muted}
                style={{ backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 12, height: 48, paddingHorizontal: 16, color: colors.heading, fontSize: 14 }}
              />
            </View>

            <View className="gap-y-1.5">
              <Text className="text-xs font-semibold uppercase tracking-wider" style={{ color: colors.label }}>Phone Number *</Text>
              <BottomSheetTextInput
                value={newPhone}
                onChangeText={handlePhoneChange}
                placeholder="(555) - 555 - 5555"
                maxLength={20}
                keyboardType="phone-pad"
                placeholderTextColor={colors.muted}
                style={{ backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.teal, borderRadius: 12, height: 48, paddingHorizontal: 16, color: colors.heading, fontSize: 14 }}
              />
            </View>

            <View className="gap-y-1.5">
              <Text className="text-xs font-semibold uppercase tracking-wider" style={{ color: colors.label }}>Delivery Address</Text>
              <BottomSheetTextInput
                value={street}
                onChangeText={setStreet}
                placeholder="Street Address"
                placeholderTextColor={colors.muted}
                style={{ backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 12, height: 48, paddingHorizontal: 16, color: colors.heading, fontSize: 14 }}
              />
              <View className="flex-row gap-x-2">
                <BottomSheetTextInput
                  value={city}
                  onChangeText={setCity}
                  placeholder="City"
                  placeholderTextColor={colors.muted}
                  style={{ flex: 2, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 12, height: 48, paddingHorizontal: 16, color: colors.heading, fontSize: 14 }}
                />
                <BottomSheetTextInput
                  value={stateCode}
                  onChangeText={setStateCode}
                  placeholder="State"
                  placeholderTextColor={colors.muted}
                  style={{ flex: 1, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 12, height: 48, paddingHorizontal: 16, color: colors.heading, fontSize: 14 }}
                />
              </View>
              <BottomSheetTextInput
                value={zip}
                onChangeText={setZip}
                placeholder="Zip Code"
                keyboardType="numeric"
                placeholderTextColor={colors.muted}
                style={{ width: '50%', backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 12, height: 48, paddingHorizontal: 16, color: colors.heading, fontSize: 14 }}
              />
            </View>

            <TouchableOpacity
              onPress={handleSaveNewCustomer}
              className="rounded-xl h-12 items-center justify-center mt-2"
              style={{ backgroundColor: colors.teal }}
            >
              <Text className="text-sm font-bold" style={{ color: colors.onSolid }}>Save Customer</Text>
            </TouchableOpacity>
          </View>
        )}
      </BottomSheetView>
    </BottomSheet>
  );
};

export default CustomerSheet;
