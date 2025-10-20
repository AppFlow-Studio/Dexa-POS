import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Calendar } from 'lucide-react-native';
import { format, addDays } from 'date-fns';

interface ScheduleNotLiveProps {
  weekStartDate: Date;
  onViewLastWeek: () => void;
  onViewNextPublishedWeek: () => void;
}

const ScheduleNotLive: React.FC<ScheduleNotLiveProps> = ({ weekStartDate, onViewLastWeek, onViewNextPublishedWeek }) => {
  const weekEndDate = addDays(weekStartDate, 6);
  const weekRange = `${format(weekStartDate, 'MMM d')} - ${format(weekEndDate, 'd')}`;

  return (
    <View className="items-center mt-4">
      <View className="p-8 bg-[#212121] rounded-2xl items-center w-full max-w-sm border border-gray-700">
        <View className="p-5 bg-gray-800 rounded-full mb-4">
          <Calendar size={32} color="#9CA3AF" />
        </View>
        <Text className="text-2xl font-bold text-white text-center mb-2">
          Your schedule for {weekRange} isn't live yet.
        </Text>
        <Text className="text-gray-400 text-center mb-6">
          Managers are finishing the puzzle. Check back after Wed 4:00 pm.
        </Text>
        <TouchableOpacity className="w-full py-3 bg-blue-600 rounded-lg mb-3">
          <Text className="text-white font-bold text-center text-base">Set Availability</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onViewLastWeek} className="w-full py-3 border border-gray-600 rounded-lg mb-3">
          <Text className="text-gray-300 font-bold text-center text-base">View Last Week</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onViewNextPublishedWeek} className="w-full py-3 border border-gray-600 rounded-lg">
          <Text className="text-gray-300 font-bold text-center text-base">View Next Published Week</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default ScheduleNotLive;
