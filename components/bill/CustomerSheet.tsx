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
import React, {
    useCallback,
    useEffect,
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
  const sheetRef = useRef<BottomSheet>(null);
  const { isOpen, closeSheet } = useCustomerSheetStore();
  const activeOrderId = useOrderStore((s) => s.activeOrderId);
  const updateActiveOrderDetails = useOrderStore((s) => s.updateActiveOrderDetails);
  const order = useActiveOrder();
  const selectedStore = useStoreSettingsStore((state) => state.selectedStore);
  const { show } = useToast();
  const supabase = useSupabaseClient();

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

  useEffect(() => {
    if (isOpen) {
      sheetRef.current?.expand();
    } else {
      sheetRef.current?.close();
    }
  }, [isOpen]);

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
      <BottomSheetView className="flex-1 bg-panel">
        {/* Header */}
        <View className="flex-row justify-between items-center p-4 border-b border-gray-700">
          <View className="flex-row items-center gap-x-3">
            {viewMode === "add" && (
              <TouchableOpacity onPress={() => setViewMode("search")}>
                <ArrowLeft color="white" size={24} />
              </TouchableOpacity>
            )}
            <Text className="text-2xl font-bold text-white">
              {viewMode === "search" ? "Assign Customer" : "Add New Customer"}
            </Text>
          </View>

          <View className="flex-row gap-x-4 items-center">
            {viewMode === "search" && (
              <TouchableOpacity
                disabled={isAssignDisabled}
                onPress={() => setViewMode("add")}
                className={`py-2 px-4 rounded-xl items-center ${
                  isAssignDisabled ? "bg-blue-600/50" : "bg-blue-600"
                }`}
              >
                <Text className="text-lg font-bold text-white">+ Add New</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={handleClose} className="p-2">
              <X color={colors.label} size={24} />
            </TouchableOpacity>
          </View>
        </View>

        {viewMode === "search" ? (
          <View className="flex-1">
            {/* Unified Search Bar */}
            <View className="p-4">
              <View className="flex-row items-center bg-surface border border-gray-600 rounded-lg px-3 h-14">
                <Search size={22} color={colors.label} />
                <BottomSheetTextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search by Name, Phone, or Address..."
                  placeholderTextColor={colors.muted}
                  className="flex-1 ml-3 text-white text-lg"
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery("")}>
                    <X size={20} color={colors.muted} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <BottomSheetFlatList
              data={filteredCustomers}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingBottom: 120,
              }}
              renderItem={({ item }: { item: CustomerWithMeta }) => (
                <TouchableOpacity
                  disabled={isAssignDisabled}
                  onPress={() => handleSelectCustomer(item)}
                  className={`p-4 border-b border-gray-700 ${
                    isAssignDisabled ? "opacity-60" : ""
                  }`}
                >
                  <View className="flex-row justify-between items-start">
                    <View>
                      <Text className="text-xl font-semibold text-white">
                        {item.name || "Unknown Name"}
                      </Text>
                      <Text className="text-lg text-gray-400 mt-1">
                        {item.phone ?? item.phoneNumber}
                      </Text>
                      {item.address ? (
                        <Text
                          className="text-sm text-gray-500 mt-1 max-w-[300px]"
                          numberOfLines={1}
                        >
                          {formatAddress(item.address)}
                        </Text>
                      ) : null}
                    </View>
                    {item.is_offline && (
                      <Text className="text-xs text-yellow-400 font-medium">
                        Offline
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text className="text-lg text-gray-500 text-center p-6">
                  No customers found.
                </Text>
              }
            />
          </View>
        ) : (
          <View className="p-6">
            <Text className="text-gray-400 mb-6">
              Enter the customer's details below. Address fields are optional.
            </Text>

            <View className="gap-y-4">
              <View>
                <Text className="text-gray-300 mb-2 font-medium">
                  Full Name *
                </Text>
                <BottomSheetTextInput
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="e.g. John Doe"
                  placeholderTextColor={colors.muted}
                  className="bg-surface border border-gray-600 rounded-lg h-14 px-4 text-white text-lg"
                />
              </View>

              <View>
                <Text className="text-gray-300 mb-2 font-medium">
                  Phone Number *
                </Text>
                <BottomSheetTextInput
                  value={newPhone}
                  onChangeText={handlePhoneChange}
                  placeholder="(555) - 555 - 5555"
                  maxLength={20}
                  keyboardType="phone-pad"
                  placeholderTextColor={colors.muted}
                  className="bg-surface border border-blue-500 rounded-lg h-14 px-4 text-white text-lg"
                />
              </View>

              <View className="mt-2">
                <Text className="text-gray-300 mb-2 font-medium">
                  Delivery Address
                </Text>

                <BottomSheetTextInput
                  value={street}
                  onChangeText={setStreet}
                  placeholder="Street Address"
                  placeholderTextColor={colors.muted}
                  className="bg-surface border border-gray-600 rounded-lg h-14 px-4 text-white text-lg mb-3"
                />

                <View className="flex-row gap-x-3 mb-3">
                  <BottomSheetTextInput
                    value={city}
                    onChangeText={setCity}
                    placeholder="City"
                    placeholderTextColor={colors.muted}
                    className="flex-[2] bg-surface border border-gray-600 rounded-lg h-14 px-4 text-white text-lg"
                  />
                  <BottomSheetTextInput
                    value={stateCode}
                    onChangeText={setStateCode}
                    placeholder="State"
                    placeholderTextColor={colors.muted}
                    className="flex-[1] bg-surface border border-gray-600 rounded-lg h-14 px-4 text-white text-lg"
                  />
                </View>

                <BottomSheetTextInput
                  value={zip}
                  onChangeText={setZip}
                  placeholder="Zip Code"
                  keyboardType="numeric"
                  placeholderTextColor={colors.muted}
                  className="w-1/2 bg-surface border border-gray-600 rounded-lg h-14 px-4 text-white text-lg"
                />
              </View>

              <TouchableOpacity
                onPress={handleSaveNewCustomer}
                className="mt-6 bg-blue-600 rounded-xl h-14 items-center justify-center"
              >
                <Text className="text-white text-xl font-bold">
                  Save Customer
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </BottomSheetView>
    </BottomSheet>
  );
};

export default CustomerSheet;
