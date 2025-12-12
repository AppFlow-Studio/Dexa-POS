import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { Clock, X } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface TimePickerBottomSheetProps {
  bottomSheetRef: React.RefObject<BottomSheet>;
  initialTime: string; // e.g., "9:00 AM"
  onDone: (time: string) => void;
  onClose: () => void;
  title: string;
}

export const TimePickerBottomSheet: React.FC<TimePickerBottomSheetProps> = ({
  bottomSheetRef,
  initialTime,
  onDone,
  onClose,
  title,
}) => {
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);
  const [ampm, setAmPm] = useState<"AM" | "PM">("AM");

  const snapPoints = useMemo(() => ["50%"], []);

  useEffect(() => {
    if (initialTime) {
      // Parse "09:00 AM" or similar
      const parts = initialTime.split(" ");
      if (parts.length >= 2) {
        const [timePart, periodPart] = parts;
        const [hStr, mStr] = timePart.split(":");
        const h = parseInt(hStr, 10);
        const m = parseInt(mStr, 10);

        if (!isNaN(h)) setHour(h);
        if (!isNaN(m)) setMinute(m);
        if (periodPart === "AM" || periodPart === "PM") {
          setAmPm(periodPart as "AM" | "PM");
        }
      }
    }
  }, [initialTime]);

  const changeHour = (delta: number) => {
    setHour((prev) => {
      let next = prev + delta;
      if (next > 12) next = 1;
      if (next < 1) next = 12;
      return next;
    });
  };

  const changeMinute = (delta: number) => {
    setMinute((prev) => {
      let next = prev + delta;
      if (next >= 60) next = 0;
      if (next < 0) next = 45; // Cycling back from 0 goes to 45 (assuming 15 min steps)
      return next;
    });
  };

  const toggleAmPm = () => {
    setAmPm((prev) => (prev === "AM" ? "PM" : "AM"));
  };

  const handleDone = () => {
    const minStr = String(minute).padStart(2, "0");
    const hourStr = String(hour).padStart(2, "0");
    onDone(`${hourStr}:${minStr} ${ampm}`);
    onClose();
  };

  const renderBackdrop = (props: any) => (
    <BottomSheetBackdrop
      {...props}
      disappearsOnIndex={-1}
      appearsOnIndex={0}
      opacity={0.7}
    />
  );

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={onClose}
      handleIndicatorStyle={{ backgroundColor: "#9CA3AF" }}
      backgroundStyle={{ backgroundColor: "#303030" }}
      backdropComponent={renderBackdrop}
    >
      <BottomSheetView className="p-5 flex-1 bg-[#303030]">
        {/* Header */}
        <View className="flex-row items-center justify-between mb-6">
          <View>
            <Text className="text-xl font-bold text-white max-w-[80%]">
              {title}
            </Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            className="p-2 bg-[#404040] rounded-full"
          >
            <X size={20} color="#9ca3af" />
          </TouchableOpacity>
        </View>

        {/* Current Time Context */}
        <View className="flex-row items-center justify-center mb-6">
          <Clock size={16} color="#3b82f6" />
          <Text className="text-blue-500 text-sm font-bold ml-2">
            SELECTED: {hour}:{String(minute).padStart(2, "0")} {ampm}
          </Text>
        </View>

        {/* Custom Time Picker UI */}
        <View className="flex-row items-center justify-center gap-2 p-4 bg-[#252525] border border-gray-700 rounded-xl self-center mb-8">
          {/* Hours */}
          <View className="flex-row items-center">
            <TouchableOpacity onPress={() => changeHour(-1)} className="p-3">
              <Text className="text-white text-2xl font-bold">-</Text>
            </TouchableOpacity>
            <Text className="text-white text-3xl font-bold w-16 text-center">
              {hour}
            </Text>
            <TouchableOpacity onPress={() => changeHour(1)} className="p-3">
              <Text className="text-white text-2xl font-bold">+</Text>
            </TouchableOpacity>
          </View>

          <Text className="text-gray-400 text-3xl font-bold pb-1">:</Text>

          {/* Minutes */}
          <View className="flex-row items-center">
            <TouchableOpacity onPress={() => changeMinute(-15)} className="p-3">
              <Text className="text-white text-2xl font-bold">-</Text>
            </TouchableOpacity>
            <Text className="text-white text-3xl font-bold w-16 text-center">
              {String(minute).padStart(2, "0")}
            </Text>
            <TouchableOpacity onPress={() => changeMinute(15)} className="p-3">
              <Text className="text-white text-2xl font-bold">+</Text>
            </TouchableOpacity>
          </View>

          {/* AM/PM */}
          <TouchableOpacity
            onPress={toggleAmPm}
            className="ml-4 px-4 py-3 rounded-lg bg-[#353535] border border-gray-600"
          >
            <Text className="text-white text-xl font-bold">{ampm}</Text>
          </TouchableOpacity>
        </View>

        {/* Save Button */}
        <TouchableOpacity
          onPress={handleDone}
          className="w-full bg-blue-600 py-4 rounded-xl items-center shadow-lg shadow-blue-900/50 mt-auto"
        >
          <Text className="text-white font-bold text-lg">Set Time</Text>
        </TouchableOpacity>
      </BottomSheetView>
    </BottomSheet>
  );
};
