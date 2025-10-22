import React from 'react';
import { View, Text } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Button } from '@/components/ui/button';

interface WeekSelectorProps {
  startDate: Date;
  onPrevious: () => void;
  onNext: () => void;
}

const WeekSelector: React.FC<WeekSelectorProps> = ({ startDate, onPrevious, onNext }) => {
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 6);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <View className="flex-row items-center gap-2">
      <Button variant="ghost" size="icon" onPress={onPrevious} className="h-8 w-8">
        <ChevronLeft size={16} color="#9CA3AF" />
      </Button>
      <View className="min-w-[180px] items-center">
        <Text className="text-sm font-medium text-white">
          {formatDate(startDate)} - {formatDate(endDate)}, {startDate.getFullYear()}
        </Text>
      </View>
      <Button variant="ghost" size="icon" onPress={onNext} className="h-8 w-8">
        <ChevronRight size={16} color="#9CA3AF" />
      </Button>
    </View>
  );
};

export default WeekSelector;
