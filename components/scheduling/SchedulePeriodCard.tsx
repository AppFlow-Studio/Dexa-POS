import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Calendar, Pencil } from 'lucide-react-native';
import { PeriodData } from './PeriodWizard';

interface SchedulePeriodCardProps {
  period: PeriodData;
  onEdit: () => void;
  onPressSchedule: () => void;
}

const statusStyles = {
  draft: 'bg-yellow-500/20 text-yellow-400',
  active: 'bg-green-500/20 text-green-400',
  completed: 'bg-gray-500/20 text-gray-400',
};

const SchedulePeriodCard: React.FC<SchedulePeriodCardProps> = ({ period, onEdit, onPressSchedule }) => {
  const statusStyle = statusStyles[period.status] || statusStyles.draft;

  return (
    <View className="bg-[#303030] border border-gray-700 rounded-2xl p-4">
      <View className="flex-row justify-between items-start mb-4">
        <View className="flex-row items-center gap-3">
          <View className="p-2 bg-blue-600/20 rounded-lg">
            <Calendar className="text-blue-400" size={20} />
          </View>
          <View>
            <Text className="text-white font-bold text-lg">{period.name}</Text>
            <Text className="text-gray-400 text-sm">
              {period.startDate} - {period.endDate}
            </Text>
          </View>
        </View>
        <View className={`px-2 py-1 rounded-full ${statusStyle}`}>
          <Text className={`text-xs font-bold ${statusStyle}`}>{period.status}</Text>
        </View>
      </View>

      <View className="flex-row justify-between items-center">
        <TouchableOpacity
          onPress={onEdit}
          className="flex-row items-center gap-2 px-4 py-2 bg-gray-700/80 rounded-lg"
        >
          <Pencil size={16} className="text-gray-300" />
          <Text className="text-white font-semibold">Edit</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onPressSchedule}
          className="px-4 py-2 bg-blue-600 rounded-lg"
        >
          <Text className="text-white font-bold text-base">
            {period.isScheduled ? 'View Schedule' : 'Create Schedule'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default SchedulePeriodCard;
