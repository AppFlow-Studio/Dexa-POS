import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { colors } from "@/lib/theme";
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
        calendarBackground: colors.panel,
        monthTextColor: colors.heading,
        dayTextColor: colors.heading,
        textDisabledColor: colors.muted,
        selectedDayBackgroundColor: colors.info,
        selectedDayTextColor: colors.heading,
        todayTextColor: colors.info,
        arrowColor: colors.info,
        textSectionTitleColor: colors.label,
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="w-[550px] max-w-lg bg-panel rounded-2xl border-border p-0">
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
                                selectedColor: colors.info,
                            },
                        }}
                    />
                    <TouchableOpacity
                        onPress={() => onSave(startDate)}
                        className="flex-row items-center justify-center gap-2 px-4 py-3 bg-blue-600 rounded-xl mt-6"
                    >
                        <Plus size={18} color={colors.heading} />
                        <Text className="text-white font-bold">Save Changes</Text>
                    </TouchableOpacity>
                </View>
            </DialogContent>
        </Dialog>
    )
}

export default EditWeeklyScheduleModal;