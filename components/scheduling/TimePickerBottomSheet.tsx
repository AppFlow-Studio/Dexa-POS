import { Picker } from "@react-native-picker/picker";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import React, { useEffect, useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface TimePickerBottomSheetProps {
  bottomSheetRef: React.RefObject<BottomSheet>;
  initialTime: string; // e.g., "9:00 AM"
  onDone: (time: string) => void;
  onClose: () => void;
  title: string;
}

const hours = Array.from({ length: 12 }, (_, i) => String(i + 1));
const minutes = ["00", "30"];
const ampm = ["AM", "PM"];

export const TimePickerBottomSheet: React.FC<TimePickerBottomSheetProps> = ({
  bottomSheetRef,
  initialTime,
  onDone,
  onClose,
  title,
}) => {
  const [selectedHour, setSelectedHour] = useState("9");
  const [selectedMinute, setSelectedMinute] = useState("00");
  const [selectedAmPm, setSelectedAmPm] = useState("AM");

  const snapPoints = useMemo(() => ["40%"], []);

  useEffect(() => {
    if (initialTime) {
      const [time, period] = initialTime.split(" ");
      const [hour, minute] = time.split(":");
      setSelectedHour(hour);
      setSelectedMinute(minute);
      setSelectedAmPm(period);
    }
  }, [initialTime]);

  const handleDone = () => {
    const newTime = `${selectedHour}:${selectedMinute} ${selectedAmPm}`;
    onDone(newTime);
  };

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={onClose}
      handleIndicatorStyle={{ backgroundColor: "#9CA3AF" }}
      backgroundStyle={{ backgroundColor: "#212121" }}
      backdropComponent={(props) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
        />
      )}
    >
      <BottomSheetView className="p-4 flex-1">
        <Text className="text-white text-xl font-bold mb-4">{title}</Text>
        <View className="flex-row">
          <Picker
            selectedValue={selectedHour}
            onValueChange={(itemValue) => setSelectedHour(itemValue)}
            style={{ flex: 1 }}
          >
            {hours.map((h) => (
              <Picker.Item key={h} label={h} value={h} color="white" />
            ))}
          </Picker>
          <Picker
            selectedValue={selectedMinute}
            onValueChange={(itemValue) => setSelectedMinute(itemValue)}
            style={{ flex: 1 }}
          >
            {minutes.map((m) => (
              <Picker.Item key={m} label={m} value={m} color="white" />
            ))}
          </Picker>
          <Picker
            selectedValue={selectedAmPm}
            onValueChange={(itemValue) => setSelectedAmPm(itemValue)}
            style={{ flex: 1 }}
          >
            {ampm.map((p) => (
              <Picker.Item key={p} label={p} value={p} color="white" />
            ))}
          </Picker>
        </View>
        <TouchableOpacity
          onPress={handleDone}
          className="mt-auto py-3 bg-blue-600 rounded-lg items-center"
        >
          <Text className="font-bold text-white">Done</Text>
        </TouchableOpacity>
      </BottomSheetView>
    </BottomSheet>
  );
};
