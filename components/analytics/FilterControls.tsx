import { colors } from "@/lib/theme";
import { useAnalyticsStore } from "@/stores/useAnalyticsStore";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Calendar, ChevronDown, MapPin, User } from "lucide-react-native";
import React, { useState } from "react";
import {
  Modal,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface FilterChipProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  onPress: () => void;
}

const FilterChip: React.FC<FilterChipProps> = ({
  label,
  value,
  icon,
  onPress,
}) => (
  <TouchableOpacity
    onPress={onPress}
    style={{
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.panel,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 6,
      marginRight: 8
    }}
    activeOpacity={0.8}
  >
    {icon}
    <Text style={{ fontSize: 12, color: colors.label, marginLeft: 6, marginRight: 4 }}>{label}:</Text>
    <Text style={{ fontSize: 12, color: colors.teal, fontWeight: '600' }}>{value}</Text>
    <ChevronDown color={colors.label} size={14} style={{ marginLeft: 4 }} />
  </TouchableOpacity>
);

interface FilterControlsProps {
  onFilterChange?: () => void;
}

const FilterControls: React.FC<FilterControlsProps> = ({ onFilterChange }) => {
  const {
    filters,
    setDateRange,
    setLocation,
    setEmployee,
    resetFilters,
    fetchReportData,
  } = useAnalyticsStore();

  const [showDateModal, setShowDateModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [tempDateRange, setTempDateRange] = useState(filters.dateRange);
  const [showFromDatePicker, setShowFromDatePicker] = useState(false);
  const [showToDatePicker, setShowToDatePicker] = useState(false);

  // Mock data - replace with actual data from your store
  const locations = [
    { id: "all", name: "All Stores" },
    { id: "store1", name: "Downtown Store" },
    { id: "store2", name: "Mall Location" },
    { id: "store3", name: "Airport Store" },
  ];

  const employees = [
    { id: "all", name: "All Employees" },
    { id: "emp1", name: "John Smith" },
    { id: "emp2", name: "Sarah Johnson" },
    { id: "emp3", name: "Mike Davis" },
    { id: "emp4", name: "Lisa Wilson" },
  ];

  const datePresets = [
    { label: "Today", days: 0 },
    { label: "Yesterday", days: -1 },
    { label: "This Week", days: -7 },
    { label: "Last Week", days: -14 },
    { label: "This Month", days: -30 },
    { label: "Last Month", days: -60 },
  ];

  const formatDateRange = () => {
    const from = new Date(filters.dateRange.start);
    const to = new Date(filters.dateRange.end);

    if (from.toDateString() === to.toDateString()) {
      return from.toLocaleDateString();
    }

    return `${from.toLocaleDateString()} - ${to.toLocaleDateString()}`;
  };

  const getLocationName = () => {
    const location = locations.find((l) => l.id === filters.location);
    return location?.name || "All Stores";
  };

  const getEmployeeName = () => {
    const employee = employees.find((e) => e.id === filters.employee);
    return employee?.name || "All Employees";
  };

  const handleDatePreset = (days: number) => {
    const today = new Date();
    const fromDate = new Date(today);
    fromDate.setDate(today.getDate() + days);

    const newDateRange = {
      start: fromDate,
      end: today,
    };

    setDateRange(newDateRange);
    setShowDateModal(false);
    // Trigger a refresh of the current report
    setTimeout(() => {
      if (onFilterChange) {
        onFilterChange();
      } else {
        fetchReportData({ type: "overview" });
      }
    }, 100);
  };

  const handleDateConfirm = () => {
    setDateRange(tempDateRange);
    setShowDateModal(false);
    // Trigger a refresh of the current report
    setTimeout(() => {
      if (onFilterChange) {
        onFilterChange();
      } else {
        fetchReportData({ type: "overview" });
      }
    }, 100);
  };

  const handleFromDateChange = (event: any, selectedDate?: Date) => {
    setShowFromDatePicker(Platform.OS === "ios");
    if (selectedDate) {
      setTempDateRange((prev) => ({
        ...prev,
        start: selectedDate,
      }));
    }
  };

  const handleToDateChange = (event: any, selectedDate?: Date) => {
    setShowToDatePicker(Platform.OS === "ios");
    if (selectedDate) {
      setTempDateRange((prev) => ({
        ...prev,
        end: selectedDate,
      }));
    }
  };

  return (
    <View style={{ marginBottom: 12 }}>
      <View className="flex-row items-center justify-between mb-3">
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.heading }}>Filters</Text>
        <TouchableOpacity
          onPress={resetFilters}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 4,
            backgroundColor: 'transparent',
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 8
          }}
        >
          <Text style={{ fontSize: 12, color: colors.label }}>Reset</Text>
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
          icon={<Calendar color={colors.label} size={14} />}
          onPress={() => setShowDateModal(true)}
        />

        <FilterChip
          label="Location"
          value={getLocationName()}
          icon={<MapPin color={colors.label} size={14} />}
          onPress={() => setShowLocationModal(true)}
        />

        <FilterChip
          label="Employee"
          value={getEmployeeName()}
          icon={<User color={colors.label} size={14} />}
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
          <View
            style={{
              backgroundColor: colors.panel,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 16,
              maxHeight: '80%'
            }}
          >
            <View className="flex-row items-center justify-between mb-4">
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.heading }}>
                Select Date Range
              </Text>
              <TouchableOpacity
                onPress={() => setShowDateModal(false)}
                style={{ padding: 4 }}
              >
                <Text style={{ color: colors.teal, fontSize: 13 }}>Cancel</Text>
              </TouchableOpacity>
            </View>

            {/* Date Presets */}
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.heading, marginBottom: 8 }}>
                Quick Select
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {datePresets.map((preset) => (
                  <TouchableOpacity
                    key={preset.label}
                    onPress={() => handleDatePreset(preset.days)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 5,
                      backgroundColor: colors.screen,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 20
                    }}
                  >
                    <Text style={{ fontSize: 12, color: colors.heading }}>{preset.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Custom Date Range */}
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.heading, marginBottom: 8 }}>
                Custom Range
              </Text>
              <View className="gap-y-3">
                <View>
                  <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 4 }}>From Date</Text>
                  <TouchableOpacity
                    onPress={() => setShowFromDatePicker(true)}
                    style={{
                      backgroundColor: colors.screen,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <Text style={{ fontSize: 13, color: colors.heading }}>
                      {new Date(tempDateRange.start).toLocaleDateString()}
                    </Text>
                    <Calendar color={colors.label} size={16} />
                  </TouchableOpacity>
                  {showFromDatePicker && (
                    <View style={{ marginTop: 4 }}>
                      <DateTimePicker
                        value={new Date(tempDateRange.start)}
                        mode="date"
                        display={Platform.OS === "ios" ? "spinner" : "default"}
                        onChange={handleFromDateChange}
                        textColor={colors.heading}
                      />
                      {Platform.OS === "ios" && (
                        <TouchableOpacity
                          onPress={() => setShowFromDatePicker(false)}
                          style={{
                            backgroundColor: colors.teal + '20',
                            borderWidth: 1,
                            borderColor: colors.teal + '50',
                            borderRadius: 8,
                            paddingVertical: 6,
                            paddingHorizontal: 12,
                            marginTop: 4
                          }}
                        >
                          <Text style={{ color: colors.teal, textAlign: 'center', fontSize: 13, fontWeight: '600' }}>Done</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
                <View>
                  <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 4 }}>To Date</Text>
                  <TouchableOpacity
                    onPress={() => setShowToDatePicker(true)}
                    style={{
                      backgroundColor: colors.screen,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <Text style={{ fontSize: 13, color: colors.heading }}>
                      {new Date(tempDateRange.end).toLocaleDateString()}
                    </Text>
                    <Calendar color={colors.label} size={16} />
                  </TouchableOpacity>
                  {showToDatePicker && (
                    <View style={{ marginTop: 4 }}>
                      <DateTimePicker
                        value={new Date(tempDateRange.end)}
                        mode="date"
                        display={Platform.OS === "ios" ? "spinner" : "default"}
                        onChange={handleToDateChange}
                        textColor={colors.heading}
                      />
                      {Platform.OS === "ios" && (
                        <TouchableOpacity
                          onPress={() => setShowToDatePicker(false)}
                          style={{
                            backgroundColor: colors.teal + '20',
                            borderWidth: 1,
                            borderColor: colors.teal + '50',
                            borderRadius: 8,
                            paddingVertical: 6,
                            paddingHorizontal: 12,
                            marginTop: 4
                          }}
                        >
                          <Text style={{ color: colors.teal, textAlign: 'center', fontSize: 13, fontWeight: '600' }}>Done</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              </View>
            </View>

            <TouchableOpacity
              onPress={handleDateConfirm}
              style={{
                backgroundColor: colors.teal + '20',
                borderWidth: 1,
                borderColor: colors.teal + '50',
                borderRadius: 8,
                paddingVertical: 10,
                alignItems: 'center'
              }}
            >
              <Text style={{ color: colors.teal, fontSize: 13, fontWeight: '600' }}>Apply</Text>
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
          <View
            style={{
              backgroundColor: colors.panel,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 16,
              maxHeight: '60%'
            }}
          >
            <View className="flex-row items-center justify-between mb-4">
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.heading }}>
                Select Location
              </Text>
              <TouchableOpacity
                onPress={() => setShowLocationModal(false)}
                style={{ padding: 4 }}
              >
                <Text style={{ color: colors.teal, fontSize: 13 }}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <ScrollView>
              {locations.map((location) => (
                <TouchableOpacity
                  key={location.id}
                  onPress={() => {
                    setLocation(location.id);
                    setShowLocationModal(false);
                    // Trigger a refresh of the current report
                    setTimeout(() => {
                      if (onFilterChange) {
                        onFilterChange();
                      } else {
                        fetchReportData({ type: "overview" });
                      }
                    }, 100);
                  }}
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    marginBottom: 6,
                    borderWidth: 1,
                    borderColor: filters.location === location.id ? colors.teal + '50' : colors.border,
                    backgroundColor: filters.location === location.id ? colors.teal + '15' : colors.screen
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      color: filters.location === location.id ? colors.teal : colors.heading
                    }}
                  >
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
          <View
            style={{
              backgroundColor: colors.panel,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 16,
              maxHeight: '60%'
            }}
          >
            <View className="flex-row items-center justify-between mb-4">
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.heading }}>
                Select Employee
              </Text>
              <TouchableOpacity
                onPress={() => setShowEmployeeModal(false)}
                style={{ padding: 4 }}
              >
                <Text style={{ color: colors.teal, fontSize: 13 }}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <ScrollView>
              {employees.map((employee) => (
                <TouchableOpacity
                  key={employee.id}
                  onPress={() => {
                    setEmployee(employee.id);
                    setShowEmployeeModal(false);
                    // Trigger a refresh of the current report
                    setTimeout(() => {
                      if (onFilterChange) {
                        onFilterChange();
                      } else {
                        fetchReportData({ type: "overview" });
                      }
                    }, 100);
                  }}
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    marginBottom: 6,
                    borderWidth: 1,
                    borderColor: filters.employee === employee.id ? colors.teal + '50' : colors.border,
                    backgroundColor: filters.employee === employee.id ? colors.teal + '15' : colors.screen
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      color: filters.employee === employee.id ? colors.teal : colors.heading
                    }}
                  >
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
