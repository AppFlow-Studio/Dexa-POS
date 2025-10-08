import { DayHours } from "@/lib/types";
import { StoreSettings } from "@/stores/useStoreSettingsStore";
import React from "react";
import { Switch, Text, TextInput, View } from "react-native";

const DayRow = ({
  day,
  onUpdate,
  isEditable,
}: {
  day: DayHours;
  onUpdate: (field: keyof DayHours, value: any) => void;
  isEditable: boolean;
}) => (
  <View className="flex-row items-center gap-3 py-2 border-b border-gray-700">
    <View className="w-28">
      <Text className="text-lg text-white font-semibold">{day.day}</Text>
    </View>
    <View className="flex-1">
      <TextInput
        value={day.open}
        onChangeText={(val) => onUpdate("open", val)}
        editable={isEditable && day.enabled}
        className={`h-12 p-3 rounded-lg border text-base text-center ${
          isEditable && day.enabled
            ? "bg-[#212121] border-gray-600 text-white"
            : "bg-gray-800 border-gray-700 text-gray-400"
        }`}
      />
    </View>
    <View className="flex-1">
      <TextInput
        value={day.close}
        onChangeText={(val) => onUpdate("close", val)}
        editable={isEditable && day.enabled}
        className={`h-12 p-3 rounded-lg border text-base text-center ${
          isEditable && day.enabled
            ? "bg-[#212121] border-gray-600 text-white"
            : "bg-gray-800 border-gray-700 text-gray-400"
        }`}
      />
    </View>
    <Switch
      value={day.enabled}
      onValueChange={(val) => onUpdate("enabled", val)}
      disabled={!isEditable}
      trackColor={{ false: "#767577", true: "#81b0ff" }}
      thumbColor={day.enabled ? "#3b82f6" : "#f4f3f4"}
    />
  </View>
);

interface HoursOfOperationFormProps {
  hours: DayHours[];
  onUpdate: <K extends keyof StoreSettings>(
    field: K,
    value: StoreSettings[K]
  ) => void;

  isEditable: boolean;
}

const HoursOfOperationForm = ({
  hours,
  onUpdate,
  isEditable,
}: HoursOfOperationFormProps) => {
  const handleDayUpdate = (
    dayIndex: number,
    field: keyof DayHours,
    value: any
  ) => {
    const newHours = [...hours];
    newHours[dayIndex] = { ...newHours[dayIndex], [field]: value };
    onUpdate("hours", newHours);
  };

  return (
    <View className="gap-y-1">
      <View className="flex-row items-center gap-3 py-2">
        <Text className="w-28 text-base text-gray-400">Day</Text>
        <Text className="flex-1 text-base text-gray-400 text-center">
          Open Time
        </Text>
        <Text className="flex-1 text-base text-gray-400 text-center">
          Close Time
        </Text>
        <Text className="text-base text-gray-400 w-12">Open</Text>
      </View>
      {hours.map((day, index) => (
        <DayRow
          key={day.day}
          day={day}
          onUpdate={(field, value) => handleDayUpdate(index, field, value)}
          isEditable={isEditable}
        />
      ))}
    </View>
  );
};

export default HoursOfOperationForm;
