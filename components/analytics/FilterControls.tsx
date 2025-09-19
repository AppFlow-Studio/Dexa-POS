import { useAnalyticsStore } from "@/stores/useAnalyticsStore";
import { Calendar, ChevronDown, MapPin, User } from "lucide-react-native";
import React, { useState } from "react";
import { Modal, ScrollView, Text, TouchableOpacity, View } from "react-native";
import DatePicker from 'react-native-date-picker';

interface FilterChipProps {
    label: string;
    value: string;
    icon: React.ReactNode;
    onPress: () => void;
}

const FilterChip: React.FC<FilterChipProps> = ({ label, value, icon, onPress }) => (
    <TouchableOpacity
        onPress={onPress}
        className="flex-row items-center bg-[#303030] border border-gray-600 rounded-xl px-4 py-3 mr-3"
        activeOpacity={0.8}
    >
        {icon}
        <Text className="text-white font-medium ml-2 mr-2">{label}:</Text>
        <Text className="text-blue-400 font-semibold">{value}</Text>
        <ChevronDown color="#9CA3AF" size={16} className="ml-2" />
    </TouchableOpacity>
);

const FilterControls = () => {
    const {
        filters,
        setDateRange,
        setLocation,
        setEmployee,
        resetFilters
    } = useAnalyticsStore();

    const [showDateModal, setShowDateModal] = useState(false);
    const [showLocationModal, setShowLocationModal] = useState(false);
    const [showEmployeeModal, setShowEmployeeModal] = useState(false);
    const [tempDateRange, setTempDateRange] = useState(filters.dateRange);

    // Mock data - replace with actual data from your store
    const locations = [
        { id: 'all', name: 'All Stores' },
        { id: 'store1', name: 'Downtown Store' },
        { id: 'store2', name: 'Mall Location' },
        { id: 'store3', name: 'Airport Store' },
    ];

    const employees = [
        { id: 'all', name: 'All Employees' },
        { id: 'emp1', name: 'John Smith' },
        { id: 'emp2', name: 'Sarah Johnson' },
        { id: 'emp3', name: 'Mike Davis' },
        { id: 'emp4', name: 'Lisa Wilson' },
    ];

    const datePresets = [
        { label: 'Today', days: 0 },
        { label: 'Yesterday', days: -1 },
        { label: 'This Week', days: -7 },
        { label: 'Last Week', days: -14 },
        { label: 'This Month', days: -30 },
        { label: 'Last Month', days: -60 },
    ];

    const formatDateRange = () => {
        const from = new Date(filters.dateRange.from);
        const to = new Date(filters.dateRange.to);

        if (from.toDateString() === to.toDateString()) {
            return from.toLocaleDateString();
        }

        return `${from.toLocaleDateString()} - ${to.toLocaleDateString()}`;
    };

    const getLocationName = () => {
        const location = locations.find(l => l.id === filters.locationId);
        return location?.name || 'All Stores';
    };

    const getEmployeeName = () => {
        const employee = employees.find(e => e.id === filters.employeeId);
        return employee?.name || 'All Employees';
    };

    const handleDatePreset = (days: number) => {
        const today = new Date();
        const fromDate = new Date(today);
        fromDate.setDate(today.getDate() + days);

        const newDateRange = {
            from: fromDate.toISOString().split('T')[0],
            to: today.toISOString().split('T')[0],
        };

        setDateRange(newDateRange);
        setShowDateModal(false);
    };

    const handleDateConfirm = () => {
        setDateRange(tempDateRange);
        setShowDateModal(false);
    };

    return (
        <View className="mb-6">
            <View className="flex-row items-center justify-between mb-4">
                <Text className="text-xl font-bold text-white">Filters</Text>
                <TouchableOpacity
                    onPress={resetFilters}
                    className="px-4 py-2 bg-gray-600 rounded-xl"
                >
                    <Text className="text-white text-sm">Reset</Text>
                </TouchableOpacity>
            </View>

            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="pb-2"
            >
                <FilterChip
                    label="Date Range"
                    value={formatDateRange()}
                    icon={<Calendar color="#9CA3AF" size={16} />}
                    onPress={() => setShowDateModal(true)}
                />

                <FilterChip
                    label="Location"
                    value={getLocationName()}
                    icon={<MapPin color="#9CA3AF" size={16} />}
                    onPress={() => setShowLocationModal(true)}
                />

                <FilterChip
                    label="Employee"
                    value={getEmployeeName()}
                    icon={<User color="#9CA3AF" size={16} />}
                    onPress={() => setShowEmployeeModal(true)}
                />
            </ScrollView>

            {/* Date Range Modal */}
            <Modal
                visible={showDateModal}
                transparent
                animationType="slide"
                onRequestClose={() => setShowDateModal(false)}
            >
                <View className="flex-1 bg-black/50 justify-end">
                    <View className="bg-[#303030] rounded-t-3xl p-6 max-h-[80%]">
                        <View className="flex-row items-center justify-between mb-6">
                            <Text className="text-2xl font-bold text-white">Select Date Range</Text>
                            <TouchableOpacity
                                onPress={() => setShowDateModal(false)}
                                className="p-2"
                            >
                                <Text className="text-blue-400 text-lg">Cancel</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Date Presets */}
                        <View className="mb-6">
                            <Text className="text-lg font-semibold text-white mb-3">Quick Select</Text>
                            <View className="flex-row flex-wrap gap-2">
                                {datePresets.map((preset) => (
                                    <TouchableOpacity
                                        key={preset.label}
                                        onPress={() => handleDatePreset(preset.days)}
                                        className="px-4 py-2 bg-[#212121] border border-gray-600 rounded-xl"
                                    >
                                        <Text className="text-white">{preset.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* Custom Date Range */}
                        <View className="mb-6">
                            <Text className="text-lg font-semibold text-white mb-3">Custom Range</Text>
                            <View className="space-y-4">
                                <View>
                                    <Text className="text-gray-400 mb-2">From Date</Text>
                                    <DatePicker
                                        date={new Date(tempDateRange.from)}
                                        mode="date"
                                        onDateChange={(date) => setTempDateRange(prev => ({
                                            ...prev,
                                            from: date.toISOString().split('T')[0]
                                        }))}
                                        style={{ backgroundColor: '#212121' }}
                                        textColor="#ffffff"
                                    />
                                </View>
                                <View>
                                    <Text className="text-gray-400 mb-2">To Date</Text>
                                    <DatePicker
                                        date={new Date(tempDateRange.to)}
                                        mode="date"
                                        onDateChange={(date) => setTempDateRange(prev => ({
                                            ...prev,
                                            to: date.toISOString().split('T')[0]
                                        }))}
                                        style={{ backgroundColor: '#212121' }}
                                        textColor="#ffffff"
                                    />
                                </View>
                            </View>
                        </View>

                        <TouchableOpacity
                            onPress={handleDateConfirm}
                            className="bg-blue-600 py-4 rounded-xl items-center"
                        >
                            <Text className="text-white text-lg font-semibold">Apply</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Location Modal */}
            <Modal
                visible={showLocationModal}
                transparent
                animationType="slide"
                onRequestClose={() => setShowLocationModal(false)}
            >
                <View className="flex-1 bg-black/50 justify-end">
                    <View className="bg-[#303030] rounded-t-3xl p-6 max-h-[60%]">
                        <View className="flex-row items-center justify-between mb-6">
                            <Text className="text-2xl font-bold text-white">Select Location</Text>
                            <TouchableOpacity
                                onPress={() => setShowLocationModal(false)}
                                className="p-2"
                            >
                                <Text className="text-blue-400 text-lg">Cancel</Text>
                            </TouchableOpacity>
                        </View>

                        <ScrollView>
                            {locations.map((location) => (
                                <TouchableOpacity
                                    key={location.id}
                                    onPress={() => {
                                        setLocation(location.id);
                                        setShowLocationModal(false);
                                    }}
                                    className={`p-4 rounded-xl mb-2 ${filters.locationId === location.id
                                        ? 'bg-blue-900/30 border border-blue-500'
                                        : 'bg-[#212121] border border-gray-600'
                                        }`}
                                >
                                    <Text className={`text-lg ${filters.locationId === location.id ? 'text-blue-400' : 'text-white'
                                        }`}>
                                        {location.name}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Employee Modal */}
            <Modal
                visible={showEmployeeModal}
                transparent
                animationType="slide"
                onRequestClose={() => setShowEmployeeModal(false)}
            >
                <View className="flex-1 bg-black/50 justify-end">
                    <View className="bg-[#303030] rounded-t-3xl p-6 max-h-[60%]">
                        <View className="flex-row items-center justify-between mb-6">
                            <Text className="text-2xl font-bold text-white">Select Employee</Text>
                            <TouchableOpacity
                                onPress={() => setShowEmployeeModal(false)}
                                className="p-2"
                            >
                                <Text className="text-blue-400 text-lg">Cancel</Text>
                            </TouchableOpacity>
                        </View>

                        <ScrollView>
                            {employees.map((employee) => (
                                <TouchableOpacity
                                    key={employee.id}
                                    onPress={() => {
                                        setEmployee(employee.id);
                                        setShowEmployeeModal(false);
                                    }}
                                    className={`p-4 rounded-xl mb-2 ${filters.employeeId === employee.id
                                        ? 'bg-blue-900/30 border border-blue-500'
                                        : 'bg-[#212121] border border-gray-600'
                                        }`}
                                >
                                    <Text className={`text-lg ${filters.employeeId === employee.id ? 'text-blue-400' : 'text-white'
                                        }`}>
                                        {employee.name}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

export default FilterControls;
