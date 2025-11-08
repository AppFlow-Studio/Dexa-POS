import PTOBalanceCard from "@/components/profile/PTOBalanceCard";
import PTOHistoryCard from "@/components/profile/PTOHistoryCard";
import PTORequestForm from "@/components/profile/PTORequestForm";
import { MOCK_PTO_BALANCE } from "@/lib/mockData";
import { useScheduleStore } from "@/stores/useScheduleStore";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  TrendingUp,
} from "lucide-react-native";
import React, { useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

const PTOPage = () => {
  const ptoRequests = useScheduleStore(state => state.ptoRequests);
  const addPTORequest = useScheduleStore(state => state.addPTORequest);
  const cancelPTORequest = useScheduleStore(state => state.cancelPTORequest);
  const [showRequestForm, setShowRequestForm] = useState(false);

  return (
    <View className="flex-1 bg-[#212121] p-4">
      <View className="flex-row items-center justify-between mb-6">
        <View></View>
        {!showRequestForm && (
          <TouchableOpacity
            onPress={() => setShowRequestForm(true)}
            className="flex-row items-center gap-2 bg-blue-600 px-4 py-2 rounded-lg"
          >
            <Calendar color="white" size={16} />
            <Text className="text-white font-semibold">Request PTO</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {showRequestForm && (
          <Animated.View entering={FadeIn} exiting={FadeOut}>
            <PTORequestForm onClose={() => setShowRequestForm(false)} onAddRequest={addPTORequest} />
          </Animated.View>
        )}

        <View className="flex-row gap-4 mb-6">
          <PTOBalanceCard
            label="Available"
            value={`${MOCK_PTO_BALANCE.available}h`}
            icon={<Clock size={20} color="#22c55e" />}
            variant="success"
          />
          <PTOBalanceCard
            label="Total Accrued"
            value={`${MOCK_PTO_BALANCE.accrued}h`}
            icon={<TrendingUp size={20} color="#9CA3AF" />}
            variant="default"
          />
          <PTOBalanceCard
            label="Used This Year"
            value={`${MOCK_PTO_BALANCE.used}h`}
            icon={<CheckCircle2 size={20} color="#9CA3AF" />}
            variant="default"
          />
          <PTOBalanceCard
            label="Pending Approval"
            value={`${MOCK_PTO_BALANCE.pending}h`}
            icon={<AlertCircle size={20} color="#f59e0b" />}
            variant="warning"
          />
        </View>

        <View className="p-4 bg-blue-600/10 border border-blue-500/20 rounded-2xl mb-6">
          <Text className="text-lg font-semibold text-white mb-2">
            Accrual Information
          </Text>
          <View className="flex-row justify-between">
            <View>
              <Text className="text-sm text-gray-400 mb-1">Accrual Rate</Text>
              <Text className="text-xl font-bold text-white">
                {MOCK_PTO_BALANCE.accrualRate} hours per hour worked
              </Text>
            </View>
            <View>
              <Text className="text-sm text-gray-400 mb-1">Next Accrual</Text>
              <Text className="text-xl font-bold text-white">
                ~1.5h after next shift
              </Text>
            </View>
          </View>
        </View>

        <View>
          <Text className="text-xl font-semibold text-white mb-4">
            Request History
          </Text>
          <View className="gap-y-3">
            {ptoRequests.map((request) => (
              <PTOHistoryCard key={request.id} request={request} onCancelRequest={cancelPTORequest} />
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

export default PTOPage;
