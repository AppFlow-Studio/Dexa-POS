import StatCard from "@/components/settings/end-of-day/StatCard";
import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRouter } from "expo-router";
import { Calendar } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Mock data for the select dropdown
const MOCK_REGISTERS = [
  { label: "Main Counter", value: "main" },
  { label: "Bar Register", value: "bar" },
  { label: "Patio Register", value: "patio" },
];
const MOCK_TOTAL_CASH = 9856.0;

const AddCashToRegisterScreen = () => {
  const router = useRouter();

  // Form State
  const [amountToAdd, setAmountToAdd] = useState("");
  const [depositDate, setDepositDate] = useState("02/03/2001");
  const [slipNumber, setSlipNumber] = useState("98745");
  const [selectedRegister, setSelectedRegister] = useState<any>();
  const [notes, setNotes] = useState("");

  // Modal State
  const [isConfirmModalOpen, setConfirmModalOpen] = useState(false);

  // Derived state for the top card
  const newTotal = useMemo(() => {
    return MOCK_TOTAL_CASH + (parseFloat(amountToAdd) || 0);
  }, [amountToAdd]);

  const insets = useSafeAreaInsets();
  const contentInsets = {
    top: insets.top,
    bottom: insets.bottom,
    left: 12,
    right: 12,
  };

  const handleAddCash = () => {
    // In a real app, you would submit the form data here
    console.log("Adding cash to register...");
    setConfirmModalOpen(false);
    router.back(); // Navigate back after success
  };

  return (
    <View className="flex-1 bg-background-300 p-4">
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Stat Cards */}
        <View className="flex-row gap-4 h-full w-full">
          <StatCard title="Total Cash in Register" value={MOCK_TOTAL_CASH} />
          <StatCard
            title="Amount to Add"
            value={parseFloat(amountToAdd) || 0}
          />
          <StatCard title="New Total After Adding" value={newTotal} />
        </View>

        {/* Deposit Details Form */}
        <View className="bg-white p-4 mt-4 rounded-2xl border border-gray-200">
          <Text className="text-2xl font-bold text-gray-800 mb-4">
            Deposit Details
          </Text>
          <View className="gap-y-3">
            <View>
              <Text className="text-xl font-semibold text-gray-700 mb-1.5">
                Deposit Date
              </Text>
              <TouchableOpacity className="flex-row justify-between items-center p-4 bg-gray-100 rounded-lg border border-gray-200">
                <Text className="text-xl">{depositDate}</Text>
                <Calendar color="#6b7280" size={20} />
              </TouchableOpacity>
            </View>
            <View>
              <Text className="text-xl font-semibold text-gray-700 mb-1.5">
                Slip Number
              </Text>
              <TextInput
                value={slipNumber}
                onChangeText={setSlipNumber}
                className="px-4 py-3 bg-gray-100 rounded-lg border border-gray-200 text-xl h-16"
              />
            </View>
            <View>
              <Text className="text-xl font-semibold text-gray-700 mb-1.5">
                Register
              </Text>
              <Select
                value={selectedRegister}
                onValueChange={setSelectedRegister}
              >
                <SelectTrigger className="w-full p-4 bg-gray-100 rounded-lg flex-row justify-between items-center border border-gray-200">
                  <SelectValue
                    placeholder="Select"
                    className="text-xl text-gray-800"
                  />
                </SelectTrigger>
                <SelectContent insets={contentInsets}>
                  <SelectGroup>
                    {MOCK_REGISTERS.map((opt) => (
                      <SelectItem
                        key={opt.value}
                        label={opt.label}
                        value={opt.value}
                      >
                        <Text className="text-xl">{opt.label}</Text>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </View>
            <View>
              <Text className="text-xl font-semibold text-gray-700 mb-1.5">
                Notes
              </Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                multiline
                placeholder="Write a note..."
                className="px-4 py-3 bg-gray-100 rounded-lg border border-gray-200 text-xl h-28"
              />
            </View>
          </View>
          {/* Footer */}
          <View className="flex-row gap-2 pt-3 mt-4 border-t border-gray-200">
            <TouchableOpacity
              onPress={() => router.back()}
              className="flex-1 px-6 py-3 rounded-lg border border-gray-300 bg-white"
            >
              <Text className="text-xl font-bold text-gray-700 text-center">
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setConfirmModalOpen(true)}
              className="flex-1 px-6 py-3 rounded-lg bg-primary-400"
            >
              <Text className="text-xl font-bold text-white text-center">
                Add Cash
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={isConfirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        onConfirm={handleAddCash}
        title="Add Cash"
        description="Are you sure you want to add cash to the register?"
        confirmText="Yes"
        variant="default"
      />
    </View>
  );
};

export default AddCashToRegisterScreen;
