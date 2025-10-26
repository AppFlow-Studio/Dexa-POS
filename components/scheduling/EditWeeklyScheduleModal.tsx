import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import { Plus } from "lucide-react-native";
import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Calendar, DateData } from "react-native-calendars";

interface EditWeeklyScheduleModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (startDate: string) => void;
    initialDate: string;
}

const EditWeeklyScheduleModal: React.FC<EditWeeklyScheduleModalProps> = ({ isOpen, onClose, onSave, initialDate }) => {
    const [startDate, setStartDate] = useState(initialDate);

    const onDayPress = (day: DateData) => {
        setStartDate(day.dateString);
    };

    const calendarTheme = {
        calendarBackground: "#303030",
        monthTextColor: "#FFFFFF",
        dayTextColor: "#FFFFFF",
        textDisabledColor: "#6B7280",
        selectedDayBackgroundColor: "#3b82f6",
        selectedDayTextColor: "#FFFFFF",
        todayTextColor: "#60A5FA",
        arrowColor: "#3b82f6",
        textSectionTitleColor: "#9CA3AF",
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="w-[550px] max-w-lg bg-[#303030] rounded-2xl border-gray-700 p-0">
                <DialogHeader className="p-6 border-b border-gray-700">
                    <DialogTitle className="text-white text-xl font-bold">Edit Week Start Date</DialogTitle>
                </DialogHeader>
                <View className="p-6">
                    <Calendar
                        current={startDate}
                        onDayPress={onDayPress}
                        theme={calendarTheme}
                        markedDates={{
                            [startDate]: {
                                selected: true,
                                selectedColor: "#3b82f6",
                            },
                        }}
                    />
                    <TouchableOpacity
                        onPress={() => onSave(startDate)}
                        className="flex-row items-center justify-center gap-2 px-4 py-3 bg-blue-600 rounded-xl mt-6"
                    >
                        <Plus size={18} color="#FFFFFF" />
                        <Text className="text-white font-bold">Save Changes</Text>
                    </TouchableOpacity>
                </View>
            </DialogContent>
        </Dialog>
    )
}

export default EditWeeklyScheduleModal;