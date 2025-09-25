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
import { X } from "lucide-react-native";
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

  useEffect(() => {
    if (isOpen) {
      sheetRef.current?.expand();
    } else {
      sheetRef.current?.close();
    }
  }, [isOpen]);

  // Filter logic
  const filteredCustomers = useMemo(() => {
    const nameQuery = name.toLowerCase().trim();
    const phoneQuery = phone.trim();
    if (!nameQuery && !phoneQuery) {
      return customers; // Show all customers initially
    }
    return customers.filter(
      (c: Customer) =>
        c.name.toLowerCase().includes(nameQuery) &&
        c.phoneNumber.includes(phoneQuery)
    );
  }, [name, phone, customers]);

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
      closeSheet();
    }
  };

  const handleAddNewCustomer = () => {
    if (!name.trim() || !phone.trim()) {
      toast.error("Customer name and phone number are required.", {
        position: ToastPosition.BOTTOM,
      });
      return;
    }

    const newCustomer = addCustomer({ name, phoneNumber: phone, address });
    handleSelectCustomer(newCustomer); // Assign the newly created customer
  };

  const snapPoints = useMemo(() => ["85%", "90%"], []);

  return (
    <BottomSheet
      ref={sheetRef}
      index={isOpen ? 0 : -1}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={closeSheet}
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
        <View className="flex-row justify-between items-center p-6 border-b border-gray-700">
          <Text className="text-3xl font-bold text-white">Assign Customer</Text>
          <TouchableOpacity onPress={closeSheet} className="p-2">
            <X color="#9CA3AF" size={24} />
          </TouchableOpacity>
        </View>

        <View className="p-6 gap-y-4">
          <BottomSheetTextInput
            value={name}
            onChangeText={setName}
            placeholder="Customer Name"
            placeholderTextColor="#6B7280"
            className="bg-[#303030] border border-gray-600 rounded-lg h-20 px-4 py-3 text-white text-2xl"
          />
          <BottomSheetTextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="Phone Number"
            placeholderTextColor="#6B7280"
            keyboardType="phone-pad"
            className="bg-[#303030] border border-gray-600 rounded-lg h-20 px-4 py-3 text-white text-2xl"
          />
          <BottomSheetTextInput
            value={address}
            onChangeText={setAddress}
            placeholder="Delivery Address (Optional)"
            placeholderTextColor="#6B7280"
            className="bg-[#303030] border border-gray-600 rounded-lg h-20 px-4 py-3 text-white text-2xl"
          />
        </View>

        <BottomSheetFlatList
          data={filteredCustomers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 150 }}
          renderItem={({ item }: { item: Customer }) => (
            <TouchableOpacity
              onPress={() => handleSelectCustomer(item)}
              className="p-4 border-b border-gray-700"
            >
              <Text className="text-2xl font-semibold text-white">
                {item.name}
              </Text>
              <Text className="text-xl text-gray-400">{item.phoneNumber}</Text>
            </TouchableOpacity>
          )}
          ListHeaderComponent={
            <Text className="text-2xl font-semibold text-gray-300 px-4 pb-2">
              Existing Customers
            </Text>
          }
          ListEmptyComponent={
            <Text className="text-xl text-gray-500 text-center p-8">
              No customers found.
            </Text>
          }
        />

        <View className="absolute bottom-0 left-0 right-0 p-6 bg-[#212121] border-t border-gray-700">
          <TouchableOpacity
            onPress={handleAddNewCustomer}
            className="w-full py-4 bg-blue-600 rounded-xl items-center"
          >
            <Text className="text-2xl font-bold text-white">
              Add New Customer
            </Text>
          </TouchableOpacity>
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
};

export default CustomerSheet;
