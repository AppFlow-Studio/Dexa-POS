import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { CartItem } from '@/lib/types'; // Assuming CartItem type is available

interface ItemProgressTrackerProps {
  selectedCourse: number;
  itemsInSelectedCourse: CartItem[];
  onSendCourseToKitchen: (course: number) => void;
  onMarkAllReady: (itemIds: string[]) => void; // A function to mark multiple items ready
  isCourseSent: boolean; // To determine if "Send to Kitchen" should be disabled/hidden
}

const ItemProgressTracker: React.FC<ItemProgressTrackerProps> = ({
  selectedCourse,
  itemsInSelectedCourse,
  onSendCourseToKitchen,
  onMarkAllReady,
  isCourseSent,
}) => {
  const allItemsReady = itemsInSelectedCourse.every(item => item.item_status === 'Ready');
  const anyItemsPreparing = itemsInSelectedCourse.some(item => item.item_status === 'Preparing');

  const getStatusIndicator = (item: CartItem) => {
    switch (item.item_status) {
      case 'Ready':
        return <Text className="text-green-500">🟢 Ready</Text>;
      case 'Preparing':
        return <Text className="text-yellow-500">🟡 Preparing</Text>;
      default:
        return <Text className="text-red-500">🔴 Not Sent</Text>; // Assuming default is "Not Sent" before "Preparing"
    }
  };

  const handleMarkAllReady = () => {
    const preparingItemIds = itemsInSelectedCourse
      .filter(item => item.item_status === 'Preparing')
      .map(item => item.id);
    if (preparingItemIds.length > 0) {
      onMarkAllReady(preparingItemIds);
    }
  };

  return (
    <View className="bg-[#303030] border-t border-gray-700 p-3" style={{ height: 150 }}>
      <Text className="text-lg font-bold text-white mb-2">Selected: Course {selectedCourse}</Text>
      <ScrollView horizontal={true} showsHorizontalScrollIndicator={false} className="flex-1 mb-2">
        {itemsInSelectedCourse.length > 0 ? (
          itemsInSelectedCourse.map(item => (
            <View key={item.id} className="flex-row items-center bg-[#212121] rounded-lg px-3 py-1 mr-2 border border-gray-600">
              <Text className="text-white text-base mr-1">{item.name} x{item.quantity}</Text>
              {getStatusIndicator(item)}
            </View>
          ))
        ) : (
          <Text className="text-gray-400">No items in this course.</Text>
        )}
      </ScrollView>
      <View className="flex-row justify-end gap-2">
        {!isCourseSent && (
          <TouchableOpacity
            onPress={() => onSendCourseToKitchen(selectedCourse)}
            className="px-4 py-2 bg-blue-500 rounded-lg items-center"
          >
            <Text className="font-semibold text-white text-base">Send to Kitchen</Text>
          </TouchableOpacity>
        )}
        {!allItemsReady && anyItemsPreparing && (
          <TouchableOpacity
            onPress={handleMarkAllReady}
            className="px-4 py-2 bg-green-500 rounded-lg items-center"
          >
            <Text className="font-semibold text-white text-base">Mark All Ready</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

export default ItemProgressTracker;