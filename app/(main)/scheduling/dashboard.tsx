import EditWeeklyScheduleModal from "@/components/scheduling/EditWeeklyScheduleModal";
import PeriodWizard, { PeriodData } from "@/components/scheduling/PeriodWizard";
import QuickScheduleModal from "@/components/scheduling/QuickScheduleModal";
import SchedulePeriodCard from "@/components/scheduling/SchedulePeriodCard";
import WeeklyScheduleCard from "@/components/scheduling/WeeklyScheduleCard";
import { SchedulePeriod, WeeklySchedule } from "@/lib/types";
import { useScheduleStore } from "@/stores/useScheduleStore";
import { addDays, format } from "date-fns";
import { useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import React, { useState } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const ScheduleManagerDashboard = () => {
  const router = useRouter();
  const {
    schedulePeriods,
    weeklySchedules,
    addWeeklySchedule,
    addSchedulePeriod,
    updateSchedulePeriod,
    updateWeeklySchedule,
  } = useScheduleStore();
  const [isWizardOpen, setWizardOpen] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState<PeriodData | null>(null);
  const [isQuickScheduleModalOpen, setIsQuickScheduleModalOpen] =
    useState(false);
  const [isEditWeeklyModalOpen, setIsEditWeeklyModalOpen] = useState(false);
  const [editingWeeklySchedule, setEditingWeeklySchedule] =
    useState<WeeklySchedule | null>(null);

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
      updateSchedulePeriod(editingPeriod.id!, data);
    } else {
      addSchedulePeriod(
        data as Omit<
          SchedulePeriod,
          "id" | "createdAt" | "updatedAt" | "shifts"
        >
      );
    }
    setWizardOpen(false);
    setEditingPeriod(null);
  };

  const handlePressSchedule = (periodId: string) => {
    router.push(`/scheduling/${periodId}`);
  };

  const handleCreateWeeklySchedule = (startDate: string) => {
    const endDate = format(addDays(new Date(startDate), 6), "yyyy-MM-dd");
    const name = `Week of ${format(new Date(startDate), "MMM dd")} - ${format(
      new Date(endDate),
      "MMM dd, yyyy"
    )}`;

    const newWeeklySchedule: Omit<
      WeeklySchedule,
      "id" | "createdAt" | "updatedAt" | "shifts"
    > = {
      name,
      startDate,
      endDate,
      status: "draft",
      createdBy: "Manager",
      type: "weekly",
    };

    const newId = addWeeklySchedule(newWeeklySchedule);
    router.push(`/scheduling/${newId}`);
    setIsQuickScheduleModalOpen(false);
  };

  const handleEditWeekly = (schedule: WeeklySchedule) => {
    setEditingWeeklySchedule(schedule);
    setIsEditWeeklyModalOpen(true);
  };

  const handleUpdateWeeklySchedule = (startDate: string) => {
    if (editingWeeklySchedule) {
      const endDate = format(addDays(new Date(startDate), 6), "yyyy-MM-dd");
      const name = `Week of ${format(new Date(startDate), "MMM dd")} - ${format(new Date(endDate), "MMM dd, yyyy")}`;
      updateWeeklySchedule(editingWeeklySchedule.id, {
        startDate,
        endDate,
        name,
      });
      setIsEditWeeklyModalOpen(false);
      setEditingWeeklySchedule(null);
    }
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-[#212121]">
      <View className="p-4 flex-1">
        {/* Header */}
        <View className="flex-row items-center justify-between mb-6">
          <Text className="text-2xl font-bold text-white">
            Schedule Manager
          </Text>
          <View className="flex-row items-center gap-2">
            <TouchableOpacity
              onPress={() => setIsQuickScheduleModalOpen(true)}
              className="flex-row items-center gap-2 px-4 py-2 bg-blue-600 rounded-xl"
            >
              <Plus size={18} color="#FFFFFF" />
              <Text className="text-white font-bold">New Week</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleAddNew}
              className="flex-row items-center gap-2 px-4 py-2 bg-blue-600 rounded-xl"
            >
              <Plus size={18} color="#FFFFFF" />
              <Text className="text-white font-bold">New Period</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Schedule Periods List (Top Section) */}
        <View className="mb-6">
          <Text className="text-xl font-bold text-white mb-4">
            Schedule Periods
          </Text>
          <FlatList
            horizontal
            data={schedulePeriods}
            keyExtractor={(item) => item.id!}
            renderItem={({ item }) => (
              <SchedulePeriodCard
                period={item as PeriodData} // Cast to PeriodData for now, will update PeriodWizard later
                onEdit={() => handleEdit(item as PeriodData)}
                onPressSchedule={() => handlePressSchedule(item.id!)}
              />
            )}
            ItemSeparatorComponent={() => <View className="w-4" />}
            showsHorizontalScrollIndicator={false}
            ListEmptyComponent={() => (
              <View className="h-24 justify-center items-center bg-[#303030] border border-gray-700 rounded-2xl p-4">
                <Text className="text-white">
                  No schedule periods created yet.
                </Text>
              </View>
            )}
          />
        </View>

        {/* Weekly Schedules List (Bottom Section) */}
        <View className="flex-1">
          <Text className="text-xl font-bold text-white mb-4">
            Weekly Schedules
          </Text>
          <FlatList
            data={weeklySchedules}
            keyExtractor={(item) => item.id!}
            renderItem={({ item }) => (
              <WeeklyScheduleCard
                schedule={item}
                onEdit={() => handleEditWeekly(item)}
                onPressSchedule={() => handlePressSchedule(item.id!)}
              />
            )}
            ItemSeparatorComponent={() => <View className="h-4" />}
            ListEmptyComponent={() => (
              <View className="flex-1 justify-center items-center bg-[#303030] border border-gray-700 rounded-2xl p-4">
                <Text className="text-white">
                  No weekly schedules created yet.
                </Text>
              </View>
            )}
          />
        </View>
      </View>

      <PeriodWizard
        isOpen={isWizardOpen}
        onClose={() => setWizardOpen(false)}
        onComplete={handleWizardComplete}
        periodToEdit={editingPeriod}
      />
      <QuickScheduleModal
        isOpen={isQuickScheduleModalOpen}
        onClose={() => setIsQuickScheduleModalOpen(false)}
        onCreate={handleCreateWeeklySchedule}
      />
      {editingWeeklySchedule && (
        <EditWeeklyScheduleModal
          isOpen={isEditWeeklyModalOpen}
          onClose={() => setIsEditWeeklyModalOpen(false)}
          onSave={handleUpdateWeeklySchedule}
          initialDate={editingWeeklySchedule.startDate}
        />
      )}
    </SafeAreaView>
  );
};

export default ScheduleManagerDashboard;
