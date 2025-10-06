import { useCustomerSheetStore } from "@/stores/useCustomerSheetStore";
import { Customer, useCustomerStore } from "@/stores/useCustomerStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { Search, X } from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

const CustomerSheet: React.FC = () => {
  const sheetRef = useRef<BottomSheet>(null);
  const { isOpen, closeSheet } = useCustomerSheetStore();
  const { customers, addCustomer } = useCustomerStore();
  const { activeOrderId, updateActiveOrderDetails } = useOrderStore();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  // --- NEW: State for the secondary search input ---
  const [secondarySearch, setSecondarySearch] = useState("");

  useEffect(() => {
    if (isOpen) {
      sheetRef.current?.expand();
    } else {
      sheetRef.current?.close();
    }
  }, [isOpen]);

  const filteredCustomers = useMemo(() => {
    const nameQuery = name.toLowerCase().trim();
    const phoneQuery = phone.trim();
    const secondaryQuery = secondarySearch.toLowerCase().trim();

    // Start with all customers
    let filtered = customers;

    // Apply the main search/create fields first
    if (nameQuery || phoneQuery) {
      filtered = filtered.filter(
        (c: Customer) =>
          c.name.toLowerCase().includes(nameQuery) &&
          c.phoneNumber.includes(phoneQuery)
      );
    }

    // Then, apply the secondary search on the already filtered list
    if (secondaryQuery) {
      filtered = filtered.filter(
        (c: Customer) =>
          c.name.toLowerCase().includes(secondaryQuery) ||
          c.phoneNumber.includes(secondaryQuery)
      );
    }

    return filtered;
  }, [name, phone, secondarySearch, customers]);

  const handleSelectCustomer = (customer: Customer) => {
    if (activeOrderId) {
      updateActiveOrderDetails({
        customer_name: customer.name,
        customer_phone: customer.phoneNumber,
        delivery_address: customer.address,
      });
      toast.success(`${customer.name} assigned to order.`, {
        position: ToastPosition.BOTTOM,
      });
      handleClose();
    }
  };

  const handleAddNewCustomer = () => {
    if (!name.trim() || !phone.trim()) {
      toast.error("Customer name and phone number are required.", {
        position: ToastPosition.BOTTOM,
      });
      return;
    }

    try {
      const newCustomer = addCustomer({ name, phoneNumber: phone, address });
      handleSelectCustomer(newCustomer);
    } catch (error: any) {
      toast.error(error.message, {
        position: ToastPosition.BOTTOM,
        duration: 4000,
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
          <TouchableOpacity onPress={handleClose} className="p-2">
            <X color="#9CA3AF" size={20} />
          </TouchableOpacity>
        </View>

        <View className="p-4 gap-y-3">
          {/* --- FIX: Renamed placeholder --- */}
          <BottomSheetTextInput
            value={name}
            onChangeText={setName}
            placeholder="Search Customer"
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
          renderItem={({ item }: { item: Customer }) => (
            <TouchableOpacity
              onPress={() => handleSelectCustomer(item)}
              className="p-3 border-b border-gray-700"
            >
              <Text className="text-xl font-semibold text-white">
                {item.name}
              </Text>
              <Text className="text-lg text-gray-400">{item.phoneNumber}</Text>
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

        <View className="absolute bottom-0 left-0 right-0 p-4 bg-[#212121] border-t border-gray-700">
          <TouchableOpacity
            onPress={handleAddNewCustomer}
            className="w-full py-3 bg-blue-600 rounded-xl items-center"
          >
            <Text className="text-lg font-bold text-white">
              Add New Customer
            </Text>
          </TouchableOpacity>
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
};

export default CustomerSheet;
