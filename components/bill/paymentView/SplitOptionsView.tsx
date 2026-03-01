import { colors } from "@/lib/theme";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { ArrowLeft, ListChecks, Receipt, Split, Users } from "lucide-react-native";
import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

const SplitOptionsView: React.FC = () => {
  const setView = usePaymentStore((state) => state.setView);

  return (
    <View className="flex-1 bg-panel">
      {/* Header */}
      <View className="flex-row items-center p-4 border-b border-border">
        <TouchableOpacity
          onPress={() => setView("payment-method-selection")}
          className="p-2 bg-surface rounded-lg mr-4"
        >
          <ArrowLeft size={20} color="white" />
        </TouchableOpacity>
        <View>
          <Text className="text-2xl font-bold text-white">Split Bill</Text>
          <Text className="text-gray-400">
            Choose how to divide the payment.
          </Text>
        </View>
      </View>

      {/* Main Content */}
      <ScrollView
        className="flex-1 p-6"
        contentContainerStyle={{ alignItems: "center", justifyContent: "center", flexGrow: 1 }}
      >
        {/* First Row: Split by Item & Split Evenly */}
        <View className="flex-row gap-4 w-full max-w-4xl h-[220px] mb-4">
          {/* Option 1: Split by Item */}
          <TouchableOpacity
            className="flex-1 bg-surface rounded-2xl p-5 border border-border justify-between active:bg-surface"
            onPress={() => setView("split-by-item")}
          >
            <View className="w-14 h-14 rounded-full bg-sky-500/10 items-center justify-center mb-3">
              <ListChecks size={28} color={colors.info} />
            </View>
            <View>
              <Text className="text-lg font-bold text-white mb-1">
                Split by Item
              </Text>
              <Text className="text-gray-400 text-sm leading-5">
                Assign specific items to specific guests.
              </Text>
            </View>
          </TouchableOpacity>

          {/* Option 2: Split Evenly */}
          <TouchableOpacity
            className="flex-1 bg-surface rounded-2xl p-5 border border-border justify-between active:bg-surface"
            onPress={() => setView("split-evenly")}
          >
            <View className="w-14 h-14 rounded-full bg-green-500/10 items-center justify-center mb-3">
              <Users size={28} color={colors.success} />
            </View>
            <View>
              <Text className="text-lg font-bold text-white mb-1">
                Split Evenly
              </Text>
              <Text className="text-gray-400 text-sm leading-5">
                Divide the total equally among guests.
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Second Row: Custom Amount & Pay for Items */}
        <View className="flex-row gap-4 w-full max-w-4xl h-[220px]">
          {/* Option 3: Custom Amount */}
          <TouchableOpacity
            className="flex-1 bg-surface rounded-2xl p-5 border border-border justify-between active:bg-surface"
            onPress={() => setView("split-custom-amount")}
          >
            <View className="w-14 h-14 rounded-full bg-yellow-500/10 items-center justify-center mb-3">
              <Split size={28} color={colors.warning} />
            </View>
            <View>
              <Text className="text-lg font-bold text-white mb-1">
                Custom Amount
              </Text>
              <Text className="text-gray-400 text-sm leading-5">
                Type exactly how much each person pays.
              </Text>
            </View>
          </TouchableOpacity>

          {/* Option 4: Pay for Items (Split Review) */}
          <TouchableOpacity
            className="flex-1 bg-surface rounded-2xl p-5 border border-orange-600/50 justify-between active:bg-surface"
            onPress={() => setView("pay-for-items")}
          >
            <View className="w-14 h-14 rounded-full bg-orange-500/10 items-center justify-center mb-3">
              <Receipt size={28} color="#F97316" />
            </View>
            <View>
              <Text className="text-lg font-bold text-white mb-1">
                Pay for Items
              </Text>
              <Text className="text-gray-400 text-sm leading-5">
                Select items to pay now, leave rest for later. Manage payments.
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

export default SplitOptionsView;
