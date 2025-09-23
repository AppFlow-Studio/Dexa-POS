import { Calendar, X } from 'lucide-react-native';
import React, { useState } from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';

interface DateRangePickerProps {
    startDate: string;
    endDate: string;
    onDateRangeChange: (startDate: string, endDate: string) => void;
    placeholder?: string;
    className?: string;
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
    startDate,
    endDate,
    onDateRangeChange,
    placeholder = "Select date range",
    className = "",
}) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [tempStartDate, setTempStartDate] = useState(startDate);
    const [tempEndDate, setTempEndDate] = useState(endDate);

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const getDisplayText = () => {
        if (startDate && endDate) {
            return `${formatDate(startDate)} - ${formatDate(endDate)}`;
        } else if (startDate) {
            return `From ${formatDate(startDate)}`;
        } else if (endDate) {
            return `Until ${formatDate(endDate)}`;
        }
        return placeholder;
    };

    const handleSave = () => {
        onDateRangeChange(tempStartDate, tempEndDate);
        setIsModalOpen(false);
    };

    const handleClear = () => {
        setTempStartDate('');
        setTempEndDate('');
        onDateRangeChange('', '');
        setIsModalOpen(false);
    };

    const generateCalendarDays = () => {
        const today = new Date();
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();

        const firstDay = new Date(currentYear, currentMonth, 1);
        const lastDay = new Date(currentYear, currentMonth + 1, 0);
        const startDateObj = tempStartDate ? new Date(tempStartDate) : null;
        const endDateObj = tempEndDate ? new Date(tempEndDate) : null;

        const days = [];
        const startWeekday = firstDay.getDay();

        // Add empty cells for days before the first day of the month
        for (let i = 0; i < startWeekday; i++) {
            days.push(null);
        }

        // Add days of the month
        for (let day = 1; day <= lastDay.getDate(); day++) {
            const date = new Date(currentYear, currentMonth, day);
            const dateStr = date.toISOString().split('T')[0];

            let isSelected = false;
            let isInRange = false;

            if (startDateObj && endDateObj) {
                isSelected = dateStr === tempStartDate || dateStr === tempEndDate;
                isInRange = date >= startDateObj && date <= endDateObj;
            } else if (startDateObj) {
                isSelected = dateStr === tempStartDate;
            }

            days.push({
                day,
                dateStr,
                isSelected,
                isInRange,
                isToday: date.toDateString() === today.toDateString(),
            });
        }

        return days;
    };

    const handleDateSelect = (dateStr: string) => {
        if (!tempStartDate || (tempStartDate && tempEndDate)) {
            // Start new selection
            setTempStartDate(dateStr);
            setTempEndDate('');
        } else if (tempStartDate && !tempEndDate) {
            // Complete the range
            if (dateStr >= tempStartDate) {
                setTempEndDate(dateStr);
            } else {
                setTempEndDate(tempStartDate);
                setTempStartDate(dateStr);
            }
        }
    };

    const calendarDays = generateCalendarDays();
    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const today = new Date();
    const currentMonth = monthNames[today.getMonth()];
    const currentYear = today.getFullYear();

    return (
        <>
            <TouchableOpacity
                onPress={() => setIsModalOpen(true)}
                className={`flex-row items-center w-[33%] justify-between bg-[#212121] border border-gray-700 rounded-lg px-3 py-3 ${className}`}
            >
                <Text className={`text-lg ${startDate || endDate ? 'text-white' : 'text-gray-400'}`}>
                    {getDisplayText()}
                </Text>
                <Calendar color="#9CA3AF" size={20} />
            </TouchableOpacity>

            <Modal
                visible={isModalOpen}
                transparent
                animationType="fade"
                onRequestClose={() => setIsModalOpen(false)}
            >
                <View className="flex-1 bg-black/50 justify-center items-center px-4">
                    <View className="bg-[#303030] rounded-2xl p-6 w-full max-w-sm">
                        {/* Header */}
                        <View className="flex-row items-center justify-between mb-6">
                            <Text className="text-2xl font-bold text-white">Select Date Range</Text>
                            <TouchableOpacity onPress={() => setIsModalOpen(false)}>
                                <X color="#9CA3AF" size={24} />
                            </TouchableOpacity>
                        </View>

                        {/* Month/Year */}
                        <Text className="text-xl font-semibold text-white text-center mb-4">
                            {currentMonth} {currentYear}
                        </Text>

                        {/* Calendar Grid */}
                        <View className="mb-6">
                            {/* Day headers */}
                            <View className="flex-row mb-2">
                                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                                    <View key={day} className="flex-1 items-center py-2">
                                        <Text className="text-gray-400 text-sm font-medium">{day}</Text>
                                    </View>
                                ))}
                            </View>

                            {/* Calendar days */}
                            <View className="flex-row flex-wrap">
                                {calendarDays.map((dayData, index) => {
                                    if (!dayData) {
                                        return <View key={index} className="w-[14.28%] h-10" />;
                                    }

                                    const { day, dateStr, isSelected, isInRange, isToday } = dayData;

                                    return (
                                        <TouchableOpacity
                                            key={index}
                                            onPress={() => handleDateSelect(dateStr)}
                                            className={`w-[14.28%] h-10 items-center justify-center ${isSelected
                                                ? 'bg-blue-600 rounded-full'
                                                : isInRange
                                                    ? 'bg-blue-600/30'
                                                    : isToday
                                                        ? 'bg-gray-600 rounded-full'
                                                        : ''
                                                }`}
                                        >
                                            <Text
                                                className={`text-sm ${isSelected
                                                    ? 'text-white font-bold'
                                                    : isInRange
                                                        ? 'text-blue-200'
                                                        : isToday
                                                            ? 'text-white font-semibold'
                                                            : 'text-gray-300'
                                                    }`}
                                            >
                                                {day}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>

                        {/* Action buttons */}
                        <View className="flex-row gap-3">
                            <TouchableOpacity
                                onPress={handleClear}
                                className="flex-1 py-3 rounded-lg border border-gray-600 items-center"
                            >
                                <Text className="text-gray-300 text-lg">Clear</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={handleSave}
                                className="flex-1 py-3 rounded-lg bg-blue-600 items-center"
                            >
                                <Text className="text-white text-lg font-semibold">Save</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </>
    );
};
