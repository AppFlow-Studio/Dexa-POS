import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetFlatListMethods,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Text,
  TouchableOpacity,
  View
} from "react-native";


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

const ITEM_HEIGHT = 60;
const VISIBLE_ITEMS = 3;

interface WheelPickerProps {
  items: string[];
  value: string;
  onChange: (val: string) => void;
}

const WheelPicker: React.FC<WheelPickerProps> = ({
  items,
  value,
  onChange,
}) => {
  const flatListRef = useRef<BottomSheetFlatListMethods>(null);

  // 1. Calculate initial index
  const initialIndex = useMemo(() => {
    const idx = items.indexOf(value);
    return idx === -1 ? 0 : idx;
  }, []);

  // 2. Handle Scroll End (Snapping)
  const onMomentumScrollEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>
  ) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    const index = Math.round(offsetY / ITEM_HEIGHT);
    const clampedIndex = Math.max(0, Math.min(index, items.length - 1));
    onChange(items[clampedIndex]);
  };

  return (
    <View style={{ height: ITEM_HEIGHT * VISIBLE_ITEMS, width: 70 }}>
      <BottomSheetFlatList
        ref={flatListRef}
        data={items}
        keyExtractor={(item) => item}
        // Layout Config
        getItemLayout={(_, index) => ({
          length: ITEM_HEIGHT,
          offset: ITEM_HEIGHT * index,
          index,
        })}
        initialScrollIndex={initialIndex}
        // Physics Config - The "Secret Sauce" for Wheel Pickers
        snapToInterval={ITEM_HEIGHT}
        // @ts-ignore
        decelerationRate="fast"
        bounces={false}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled={true}
        // Events
        onMomentumScrollEnd={onMomentumScrollEnd}
        // Padding: 1 item height on top, 1 on bottom
        // This ensures offset 0 places the first item in the middle slot
        contentContainerStyle={{
          paddingVertical: ITEM_HEIGHT,
        }}
        renderItem={({ item }) => {
          const isSelected = item === value;
          return (
            <View
              style={{ height: ITEM_HEIGHT }}
              className="items-center justify-center"
            >
              <Text
                style={{
                  fontSize: isSelected ? 22 : 18,
                  fontWeight: isSelected ? "700" : "500",
                  color: isSelected ? "#FFFFFF" : "#6B7280",
                  opacity: isSelected ? 1 : 0.4,
                }}
              >
                {item}
              </Text>
            </View>
          );
        }}
      />
    </View>
  );
};

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

  const snapPoints = useMemo(() => ["45%"], []);

  useEffect(() => {
    if (initialTime) {
      const [time, period] = initialTime.split(" ");
      if (time && period) {
        let [hour, minute] = time.split(":");
        if (hour.startsWith("0") && hour.length > 1) hour = hour.substring(1);

        if (hours.includes(hour)) setSelectedHour(hour);
        if (minutes.includes(minute)) setSelectedMinute(minute);
        if (ampm.includes(period)) setSelectedAmPm(period);
      }
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
      enableContentPanningGesture={false}
      handleIndicatorStyle={{ backgroundColor: "#4B5563", width: 40 }}
      backgroundStyle={{ backgroundColor: "#1C1C1E" }}
      backdropComponent={(props) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={0.7}
        />
      )}
    >
      <BottomSheetView className="p-5 flex-1 items-center">
        <Text className="text-white text-lg font-semibold mb-8 tracking-wide">
          {title}
        </Text>

        <View className="flex-row items-center justify-center w-full mb-8 relative">
          {/* 1. Highlight Lens (Background) */}
          <View
            className="absolute w-full bg-[#303030] rounded-xl"
            style={{
              height: ITEM_HEIGHT,
              top: ITEM_HEIGHT, // Exactly centered (60px from top)
              opacity: 1,
            }}
          />

          {/* 2. Pickers */}
          <View className="flex-row items-center justify-center gap-x-2 z-10">
            {/* Keys allow re-mount on initialTime change to fix positioning */}
            <WheelPicker
              key={`h-${initialTime}`}
              items={hours}
              value={selectedHour}
              onChange={setSelectedHour}
            />
            <Text className="text-white text-2xl font-bold pb-1 text-center w-4">
              :
            </Text>
            <WheelPicker
              key={`m-${initialTime}`}
              items={minutes}
              value={selectedMinute}
              onChange={setSelectedMinute}
            />
            <View className="w-2" />
            <WheelPicker
              key={`p-${initialTime}`}
              items={ampm}
              value={selectedAmPm}
              onChange={setSelectedAmPm}
            />
          </View>

          {/* 3. Gradient Overlays */}
          <View
            className="absolute top-0 w-full bg-[#1C1C1E]"
            style={{ height: ITEM_HEIGHT, opacity: 0.9 }}
            pointerEvents="none"
          />
          <View
            className="absolute bottom-0 w-full bg-[#1C1C1E]"
            style={{ height: ITEM_HEIGHT, opacity: 0.9 }}
            pointerEvents="none"
          />
        </View>

        <TouchableOpacity
          onPress={handleDone}
          className="w-full py-3.5 bg-blue-600 rounded-xl items-center shadow-lg shadow-blue-900/20"
          activeOpacity={0.8}
        >
          <Text className="font-bold text-white text-lg tracking-wide">
            Done
          </Text>
        </TouchableOpacity>
      </BottomSheetView>
    </BottomSheet>
  );
};
