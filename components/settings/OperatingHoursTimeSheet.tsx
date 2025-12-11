import BottomSheet, {
    BottomSheetBackdrop,
    BottomSheetView,
} from "@gorhom/bottom-sheet";
import { Picker } from "@react-native-picker/picker";
import { Clock, X } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface OperatingHoursTimeSheetProps {
    bottomSheetRef: React.RefObject<BottomSheet | null>;
    initialTime: string; // e.g., "09:00 AM"
    day: string;
    type: "open" | "close";
    onSave: (time: string) => void;
    onClose: () => void;
}

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
const MINUTES = ["00", "15", "30", "45"];
const AMPM = ["AM", "PM"];

export const OperatingHoursTimeSheet: React.FC<OperatingHoursTimeSheetProps> = ({
    bottomSheetRef,
    initialTime,
    day,
    type,
    onSave,
    onClose,
}) => {
    const [selectedHour, setSelectedHour] = useState("09");
    const [selectedMinute, setSelectedMinute] = useState("00");
    const [selectedPeriod, setSelectedPeriod] = useState("AM");

    const snapPoints = useMemo(() => ["50%"], []);

    useEffect(() => {
        if (initialTime) {
            // Parse "09:00 AM"
            const [timePart, periodPart] = initialTime.split(" ");
            if (timePart && periodPart) {
                const [h, m] = timePart.split(":");
                setSelectedHour(h || "09");
                setSelectedMinute(m || "00");
                setSelectedPeriod(periodPart || "AM");
            }
        }
    }, [initialTime]);

    const handleSave = () => {
        onSave(`${selectedHour}:${selectedMinute} ${selectedPeriod}`);
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
            <BottomSheetView className="p-5 flex-1">
                {/* Header */}
                <View className="flex-row items-center justify-between mb-6">
                    <View>
                        <Text className="text-xl font-bold text-white">
                            Set {type === "open" ? "Opening" : "Closing"} Time
                        </Text>
                        <Text className="text-gray-400 text-sm mt-1">{day}</Text>
                    </View>
                    <TouchableOpacity onPress={onClose} className="p-2 bg-[#404040] rounded-full">
                        <X size={20} color="#9ca3af" />
                    </TouchableOpacity>
                </View>

                {/* Quick Selections */}


                {/* Current Time Context */}
                <View className="flex-row items-center justify-center mb-2">
                    <Clock size={14} color="#f97316" />
                    <Text className="text-orange-500 text-xs font-bold ml-1">
                        SELECTED: {selectedHour}:{selectedMinute} {selectedPeriod}
                    </Text>
                </View>

                {/* Picker Wheels */}
                <View className="flex-row flex-1 bg-[#252525] rounded-xl overflow-hidden mb-6 border border-gray-700">
                    <Picker
                        selectedValue={selectedHour}
                        onValueChange={(itemValue) => setSelectedHour(itemValue)}
                        style={{ flex: 1, color: "white" }}
                        dropdownIconColor="white"
                        mode="dropdown"
                    >
                        {HOURS.map((h) => (
                            <Picker.Item key={h} label={h} value={h} color="white" style={{ backgroundColor: "#252525" }} />
                        ))}
                    </Picker>
                    <Picker
                        selectedValue={selectedMinute}
                        onValueChange={(itemValue) => setSelectedMinute(itemValue)}
                        style={{ flex: 1, color: "white" }}
                        dropdownIconColor="white"
                        mode="dropdown"
                    >
                        {MINUTES.map((m) => (
                            <Picker.Item key={m} label={m} value={m} color="white" style={{ backgroundColor: "#252525" }} />
                        ))}
                    </Picker>
                    <Picker
                        selectedValue={selectedPeriod}
                        onValueChange={(itemValue) => setSelectedPeriod(itemValue)}
                        style={{ flex: 1, color: "white" }}
                        dropdownIconColor="white"
                        mode="dropdown"
                    >
                        {AMPM.map((p) => (
                            <Picker.Item key={p} label={p} value={p} color="white" style={{ backgroundColor: "#252525" }} />
                        ))}
                    </Picker>
                </View>

                {/* Save Button */}
                <TouchableOpacity
                    onPress={handleSave}
                    className="w-full bg-orange-600 py-4 rounded-xl items-center shadow-lg shadow-orange-900/50"
                >
                    <Text className="text-white font-bold text-lg">Set Time</Text>
                </TouchableOpacity>
            </BottomSheetView>
        </BottomSheet>
    );
};
