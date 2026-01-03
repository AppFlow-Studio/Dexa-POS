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
import { Search, X } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

const CustomerSheet: React.FC = () => {
  const sheetRef = useRef<BottomSheet>(null);
  const { isOpen, closeSheet } = useCustomerSheetStore();
  const { activeOrderId, updateActiveOrderDetails, ordersById } = useOrderStore();
  const order = ordersById[activeOrderId ?? ""];
  const selectedStore = useStoreSettingsStore((state) => state.selectedStore);
  const { show } = useToast();
  const supabase = useSupabaseClient();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [customers, setCustomers] = useState<CustomerWithMeta[]>([]);

  // --- NEW: State for the secondary search input ---
  const [secondarySearch, setSecondarySearch] = useState("");
  const isAssignDisabled = !activeOrderId;

  useEffect(() => {
    if (isOpen) {
      sheetRef.current?.expand();
    } else {
      sheetRef.current?.close();
    }
  }, [isOpen]);

  const refreshCustomers = useCallback(async () => {
    // Always start with cached customers (works offline)
    setCustomers(getCachedCustomers());

    // If online, refresh from backend and process any queued ops
    if (selectedStore && getIsOnline()) {
      try {
        const updated = await fetchAndCacheCustomers(
          supabase,
          selectedStore.merchant_id
        );
        setCustomers(updated);
        await processCustomerQueue(supabase);
      } catch (err) {
        console.warn("Failed to refresh customers:", err);
      }
    }
  }, [selectedStore, supabase]);

  useEffect(() => {
    if (isOpen) {
      refreshCustomers();
    }
  }, [isOpen, refreshCustomers]);

  const filteredCustomers = useMemo(() => {
    const nameQuery = name.toLowerCase().trim();
    const phoneQuery = phone.trim();
    const secondaryQuery = secondarySearch.toLowerCase().trim();

    // Start with all customers
    let filtered = customers;

    // Apply the main search/create fields first
    if (nameQuery || phoneQuery) {
      filtered = filtered.filter((c: CustomerWithMeta) => {
        const phoneValue = (c.phone ?? c.phoneNumber ?? "").toLowerCase();
        return (
          (c.name || "").toLowerCase().includes(nameQuery) &&
          phoneValue.includes(phoneQuery.toLowerCase())
        );
      });
    }

    // Then, apply the secondary search on the already filtered list
    if (secondaryQuery) {
      filtered = filtered.filter((c: CustomerWithMeta) => {
        const phoneValue = (c.phone ?? c.phoneNumber ?? "").toLowerCase();
        return (
          (c.name || "").toLowerCase().includes(secondaryQuery) ||
          phoneValue.includes(secondaryQuery)
        );
      });
    }

    return filtered;
  }, [name, phone, secondarySearch, customers]);

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

    // Optimistic UI update for order details
    console.log("[CustomerSheet] customer", customer);
    updateActiveOrderDetails({
      customer_name: customer.name || "",
      customer_phone: customer.phone ?? customer.phoneNumber ?? "",
      delivery_address: customer.address ?? "",
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

  const handleAddNewCustomer = async () => {
    if (!name.trim() || !phone.trim()) {
      show({
        title: "Missing Information",
        message:
          "Customer name and phone number are required to add a new customer.",
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

    const online = getIsOnline();

    try {
      const newCustomer = online
        ? await createCustomerOnline(supabase, {
          merchantId: selectedStore.merchant_id,
          name,
          phone,
          address,
        })
        : createCustomerOffline({
          merchantId: selectedStore.id,
          name,
          phone,
          address,
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
    setName("");
    setPhone("");
    setAddress("");
    setSecondarySearch(""); // Also clear the secondary search
  };

  const handleClose = () => {
    closeSheet();
    clearForm();
  };

  const snapPoints = useMemo(() => ["85%", "90%"], []);

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={handleClose}
      handleIndicatorStyle={{ backgroundColor: "#9CA3AF" }}
      backgroundStyle={{ backgroundColor: "#212121" }}
      backdropComponent={(props) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
        />
      )}
    >
      <BottomSheetView className="flex-1 bg-[#212121]">
        <View className="flex-row justify-between items-center p-4 border-b border-gray-700">
          <Text className="text-2xl font-bold text-white">Assign Customer</Text>

          <View className="flex-row gap-x-8 items-center justify-between">
            <TouchableOpacity
              disabled={isAssignDisabled}
              onPress={handleAddNewCustomer}
              className={`w-fit py-3 px-4 rounded-xl items-center ${isAssignDisabled ? "bg-blue-600/50" : "bg-blue-600"
                }`}
            >
              <Text className="text-lg font-bold text-white">
                Add New Customer
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleClose} className="p-2">
              <X color="#9CA3AF" size={24} />
            </TouchableOpacity>
          </View>
        </View>

        <View className="p-4 gap-y-3">
          {/* --- FIX: Renamed placeholder --- */}
          <BottomSheetTextInput
            value={name}
            onChangeText={setName}
            placeholder="Customer Name"
            placeholderTextColor="#6B7280"
            className="bg-[#303030] border border-gray-600 rounded-lg h-16 px-4 py-2 text-white text-lg"
          />
          {/* --- FIX: Added blue border --- */}
          <BottomSheetTextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="Phone Number"
            placeholderTextColor="#6B7280"
            keyboardType="phone-pad"
            className="bg-[#303030] border border-blue-500 rounded-lg h-16 px-4 py-2 text-white text-lg"
          />
          <BottomSheetTextInput
            value={address}
            onChangeText={setAddress}
            placeholder="Delivery Address (Optional)"
            placeholderTextColor="#6B7280"
            className="bg-[#303030] border border-gray-600 rounded-lg h-16 px-4 py-2 text-white text-lg"
          />
        </View>

        <BottomSheetFlatList
          data={filteredCustomers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
          renderItem={({ item }: { item: CustomerWithMeta }) => (
            <TouchableOpacity
              disabled={isAssignDisabled}
              onPress={() => handleSelectCustomer(item)}
              className={`p-3 border-b border-gray-700 ${isAssignDisabled ? "opacity-60" : ""
                }`}
            >
              <Text className="text-xl font-semibold text-white">
                {item.name}
              </Text>
              <View className="flex-row items-center gap-x-2">
                <Text className="text-lg text-gray-400">
                  {item.phone ?? item.phoneNumber}
                </Text>
                {item.is_offline && (
                  <Text className="text-xs text-yellow-400">Offline</Text>
                )}
              </View>
            </TouchableOpacity>
          )}
          ListHeaderComponent={
            <View className="px-3 pb-3 flex-row items-center justify-between gap-x-3">
              <Text className="text-xl font-semibold text-gray-300 mb-2">
                Existing Customers
              </Text>
              <View className="flex-row items-center bg-[#303030] border border-gray-600 rounded-lg px-3">
                <Search size={20} color="#9CA3AF" />
                <BottomSheetTextInput
                  value={secondarySearch}
                  onChangeText={setSecondarySearch}
                  placeholder="Search existing customers..."
                  placeholderTextColor="#6B7280"
                  className="h-12 ml-2 text-white text-base"
                />
              </View>
            </View>
          }
          ListEmptyComponent={
            <Text className="text-lg text-gray-500 text-center p-6">
              No customers found.
            </Text>
          }
        />
      </BottomSheetView>
    </BottomSheet>
  );
};

export default CustomerSheet;
