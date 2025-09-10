import { ShiftHistoryEntry } from "@/lib/types";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import React from "react";
import { FlatList, Text, View } from "react-native";

// --- Reusable Components for the Table ---

const TABLE_HEADERS = [
  "Clock In",
  "Break Initiated",
  "Break Ended",
  "Clock Out",
  "Duration",
];

const HistoryTableHeader = () => (
  <View className="flex-row p-4 bg-background-100 rounded-t-lg border-b border-gray-200">
    {TABLE_HEADERS.map((header) => (
      <Text key={header} className="flex-1 font-bold text-sm text-gray-500">
        {header}
      </Text>
    ))}
  </View>
);

const HistoryTableRow = ({ item }: { item: ShiftHistoryEntry }) => (
  <View className="flex-row p-4 border-b border-gray-100">
    <View className="flex-1">
      <Text className="text-sm text-gray-500">{item.date}</Text>
      <Text className="font-semibold text-gray-800">{item.clockIn}</Text>
    </View>
    {item.breakInitiated !== "N/A" ? (
      <>
        <View className="flex-1">
          <Text className="text-sm text-primary-400">{item.date}</Text>
          <Text className="font-semibold text-primary-400">
            {item.breakInitiated}
          </Text>
        </View>
        <View className="flex-1">
          <Text className="text-sm text-primary-400">{item.date}</Text>
          <Text className="font-semibold text-primary-400">{item.breakEnded}</Text>
        </View>
      </>
    ) : (
      <>
        <View className="flex-1 items-start justify-start">
          <Text className="text-sm text-gray-400 italic">No break initiated</Text>
        </View>
        <View className="flex-1 items-start justify-start">
          <Text className="text-sm text-gray-400 italic">No break initiated</Text>
        </View>
      </>
    )}
    <View className="flex-1">
      <Text className="text-sm text-gray-500">{item.date}</Text>
      <Text className="font-semibold text-gray-800">{item.clockOut}</Text>
    </View>
    <View className="flex-1">
      <Text className="text-sm text-gray-500 invisible">Duration</Text>
      <Text className="font-semibold text-gray-800">{item.duration}</Text>
    </View>
  </View>
);

// --- Main HistoryTab Component ---

const HistoryTab = () => {
  const { shiftHistory } = useTimeclockStore();

  return (
    // The FlatList component is perfect for rendering tabular data
    <View className="flex-1 rounded-lg">
      <FlatList
        data={shiftHistory}
        keyExtractor={(item) => item.id}
        // The ListHeaderComponent renders our custom table header once
        ListHeaderComponent={<HistoryTableHeader />}
        // renderItem renders each row of the table
        renderItem={({ item }) => <HistoryTableRow item={item} />}
      />
    </View>
  );
};

export default HistoryTab;
