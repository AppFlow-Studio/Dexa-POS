import PeriodWizard, { PeriodData } from "@/components/scheduling/PeriodWizard";
import SchedulePeriodCard from "@/components/scheduling/SchedulePeriodCard";
import { useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import React, { useState } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Mock data - in a real app, this would come from a store or API
const MOCK_PERIODS: PeriodData[] = [
  {
    id: "1",
    name: "Q2 2025 Spring Schedule",
    startDate: "04/01/2025",
    endDate: "06/30/2025",
    status: "draft",
    isScheduled: false,
  },
  {
    id: "2",
    name: "Q1 2025 Schedule",
    startDate: "01/01/2025",
    endDate: "03/31/2025",
    status: "active",
    isScheduled: true,
  },
  {
    id: "3",
    name: "Q4 2024 Schedule",
    startDate: "10/01/2024",
    endDate: "12/31/2024",
    status: "completed",
    isScheduled: true,
  },
];

const ScheduleManagerDashboard = () => {
  const router = useRouter();
  const [periods, setPeriods] = useState<PeriodData[]>(MOCK_PERIODS);
  const [isWizardOpen, setWizardOpen] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState<PeriodData | null>(null);

  const handleAddNew = () => {
    setEditingPeriod(null);
    setWizardOpen(true);
  };

  const handleEdit = (period: PeriodData) => {
    setEditingPeriod(period);
    setWizardOpen(true);
  };

  const handleWizardComplete = (data: PeriodData) => {
    if (editingPeriod) {
      // Update existing period
      setPeriods(
        periods.map((p) => (p.id === editingPeriod.id ? { ...p, ...data } : p))
      );
    } else {
      // Add new period
      setPeriods([...periods, { ...data, id: Date.now().toString() }]);
    }
    setWizardOpen(false);
    setEditingPeriod(null);
  };

  const handlePressSchedule = (period: PeriodData) => {
    if (period.isScheduled) {
      // Navigate to the schedule view
      router.push(`/scheduling/${period.id}`);
    } else {
      // Here you might navigate to a schedule creation screen
      // For now, we'll just log it.
      console.log("Navigate to create schedule for", period.name);
      router.push(`/scheduling/${period.id}`);
    }
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-[#212121]">
      <View className="p-4 flex-1">
        {/* Header */}
        <View className="flex-row items-center justify-between mb-6">
          <Text className="text-2xl font-bold text-white"></Text>
          <View className="flex-row items-center gap-2">
            <TouchableOpacity
              onPress={handleAddNew}
              className="flex-row items-center gap-2 px-4 py-2 bg-blue-600 rounded-xl"
            >
              <Plus size={18} color="#FFFFFF" />
              <Text className="text-white font-bold">New Period</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Periods List */}
        <FlatList
          data={periods}
          keyExtractor={(item) => item.id!}
          renderItem={({ item }) => (
            <SchedulePeriodCard
              period={item}
              onEdit={() => handleEdit(item)}
              onPressSchedule={() => handlePressSchedule(item)}
            />
          )}
          ItemSeparatorComponent={() => <View className="h-4" />}
        />
      </View>

      <PeriodWizard
        isOpen={isWizardOpen}
        onClose={() => setWizardOpen(false)}
        onComplete={handleWizardComplete}
        periodToEdit={editingPeriod}
      />
    </SafeAreaView>
  );
};

export default ScheduleManagerDashboard;
