import { SignOutButton } from "@/components/auth/SignOutButton";
import { OperatingHoursTimeSheet } from "@/components/settings/OperatingHoursTimeSheet";
import { Switch } from "@/components/ui/switch";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import BottomSheet from "@gorhom/bottom-sheet";
import { format, parse } from "date-fns";
import {
  Building2,
  ChevronDown,
  ChevronUp,
  Clock,
  DollarSign,
  FileText,
  Globe,
  LogOut,
  MapPin,
  Percent,
  Phone,
  Store,
} from "lucide-react-native";
import React, { useRef, useState } from "react";
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const TIME_OPTIONS = [
  "12:00 AM",
  "12:30 AM",
  "01:00 AM",
  "01:30 AM",
  "02:00 AM",
  "02:30 AM",
  "03:00 AM",
  "03:30 AM",
  "04:00 AM",
  "04:30 AM",
  "05:00 AM",
  "05:30 AM",
  "06:00 AM",
  "06:30 AM",
  "07:00 AM",
  "07:30 AM",
  "08:00 AM",
  "08:30 AM",
  "09:00 AM",
  "09:30 AM",
  "10:00 AM",
  "10:30 AM",
  "11:00 AM",
  "11:30 AM",
  "12:00 PM",
  "12:30 PM",
  "01:00 PM",
  "01:30 PM",
  "02:00 PM",
  "02:30 PM",
  "03:00 PM",
  "03:30 PM",
  "04:00 PM",
  "04:30 PM",
  "05:00 PM",
  "05:30 PM",
  "06:00 PM",
  "06:30 PM",
  "07:00 PM",
  "07:30 PM",
  "08:00 PM",
  "08:30 PM",
  "09:00 PM",
  "09:30 PM",
  "10:00 PM",
  "10:30 PM",
  "11:00 PM",
  "11:30 PM",
];

const formatTo12Hour = (time: string) => {
  if (!time) return "";
  try {
    const parsed = parse(time, "HH:mm", new Date());
    return format(parsed, "hh:mm a");
  } catch (e) {
    return time; // Fallback if already 12h or invalid
  }
};

const formatTo24Hour = (time: string) => {
  if (!time) return "";
  try {
    const parsed = parse(time, "hh:mm a", new Date());
    return format(parsed, "HH:mm");
  } catch (e) {
    return time;
  }
};

const GeneralSettingsScreen = () => {
  // Zustand Store - only selectedStore for business info, tax settings remain local
  const { defaultTaxRate, updateField, saveChanges, selectedStore } =
    useStoreSettingsStore();

  // Business info from selectedStore only
  const displayStoreName = selectedStore?.name || "No store selected";
  const displayAddress = selectedStore
    ? `${selectedStore.address_line1}${selectedStore.address_line2 ? ", " + selectedStore.address_line2 : ""}, ${selectedStore.city}, ${selectedStore.state} ${selectedStore.postal_code}`
    : "Select a store to see address";
  const displayPhone = selectedStore?.phone || "";
  const displayEmail = selectedStore?.email || "";
  const displayWebsite = ""; // Website not in location data

  // Define a type for display hours
  interface DisplayHour {
    day: string;
    open: string;
    close: string;
    enabled: boolean;
  }

  // Convert selected store business hours to the format used by the UI
  const displayHours: DisplayHour[] = selectedStore?.business_hours
    ? [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
      ].map((day) => {
        const dayKey =
          day.toLowerCase() as keyof typeof selectedStore.business_hours;
        const dayHoursData = selectedStore.business_hours[dayKey];
        return {
          day: day,
          open: dayHoursData?.open || "09:00",
          close: dayHoursData?.close || "17:00",
          enabled: !dayHoursData?.is_closed,
        };
      })
    : [];

  // Local state for service charge (can be added to store later)
  const [serviceCharge, setServiceCharge] = useState({
    enabled: true,
    autoGratuity: true,
    largePartySize: "6",
    rate: "18.00",
  });

  // Local state for additional tax settings not in store
  const [taxLabel, setTaxLabel] = useState("Sales Tax");
  const [taxInclusive, setTaxInclusive] = useState(false);
  const [taxEnabled, setTaxEnabled] = useState(true);

  const [timePickerState, setTimePickerState] = useState<{
    dayIndex: number;
    type: "open" | "close";
  }>({ dayIndex: -1, type: "open" });

  const timeSheetRef = useRef<BottomSheet>(null);

  const [expandedSections, setExpandedSections] = useState({
    info: true,
    hours: true,
    tax: true,
    service: true,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const toggleDayEnabled = (dayIndex: number) => {
    // TODO: Implement with API when available
    console.log("Toggle day enabled:", dayIndex);
  };

  const openTimePicker = (dayIndex: number, type: "open" | "close") => {
    setTimePickerState({ dayIndex, type });
    timeSheetRef.current?.expand();
  };

  const handleTimeSave = (time: string) => {
    // TODO: Implement with API when available
    const { dayIndex, type } = timePickerState;
    console.log("Save time:", dayIndex, type, time);
  };

  const renderSectionHeader = (
    title: string,
    icon: React.ReactNode,
    section: keyof typeof expandedSections
  ) => (
    <TouchableOpacity
      onPress={() => toggleSection(section)}
      className="flex-row items-center justify-between p-4 bg-[#353535] rounded-t-xl border-b border-gray-700"
    >
      <View className="flex-row items-center">
        <View className="w-8 h-8 bg-[#454545] rounded-lg items-center justify-center mr-3">
          {icon}
        </View>
        <Text className="text-white font-bold text-lg">{title}</Text>
      </View>
      {expandedSections[section] ? (
        <ChevronUp size={20} color="#9ca3af" />
      ) : (
        <ChevronDown size={20} color="#9ca3af" />
      )}
    </TouchableOpacity>
  );

  const renderInputField = (
    label: string,
    value: string,
    onChange: (text: string) => void,
    icon?: React.ReactNode,
    placeholder?: string
  ) => (
    <View className="mb-4">
      <Text className="text-gray-400 text-sm font-medium mb-2">{label}</Text>
      <View className="flex-row items-center bg-[#404040] border border-gray-600 rounded-lg overflow-hidden">
        {icon && (
          <View className="p-3 bg-[#505050] border-r border-gray-600">
            {icon}
          </View>
        )}
        <TextInput
          value={value}
          onChangeText={onChange}
          className="flex-1 p-3 text-white text-base"
          placeholder={placeholder}
          placeholderTextColor="#6b7280"
        />
      </View>
    </View>
  );

  // Format address for display (fallback when no store selected)
  const addressString = displayAddress;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View className="flex-1 bg-[#212121] p-6">
        <View className="mb-6">
          <Text className="text-3xl font-bold text-white">
            General Settings
          </Text>
          <Text className="text-gray-400 mt-2">
            Manage business information, operating hours, and tax
            configurations.
          </Text>
        </View>

        <View className="h-px w-full bg-gray-700 mb-6" />

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Business Information */}
          <View className="bg-[#303030] rounded-xl border border-gray-700 mb-6">
            {renderSectionHeader(
              "Business Information",
              <Store size={20} color="#60a5fa" />,
              "info"
            )}
            {expandedSections.info && (
              <View className="p-5">
                {renderInputField(
                  "Business Name",
                  displayStoreName,
                  () => {}, // Read-only for now, API integration later
                  <Building2 size={18} color="#60a5fa" />
                )}
                {renderInputField(
                  "Address",
                  addressString,
                  () => {},
                  <MapPin size={18} color="#f87171" />
                )}
                <View className="flex-row gap-4">
                  <View className="flex-1">
                    {renderInputField(
                      "Phone",
                      displayPhone || "",
                      () => {}, // Read-only for now
                      <Phone size={18} color="#4ade80" />
                    )}
                  </View>
                  <View className="flex-1">
                    {renderInputField(
                      "Website",
                      displayWebsite,
                      () => {}, // Read-only for now
                      <Globe size={18} color="#a78bfa" />
                    )}
                  </View>
                </View>
              </View>
            )}
          </View>

          {/* Operating Hours */}
          <View className="bg-[#303030] rounded-xl border border-gray-700 mb-6">
            {renderSectionHeader(
              "Operating Hours",
              <Clock size={20} color="#f97316" />,
              "hours"
            )}
            {expandedSections.hours && (
              <View className="p-5">
                <Text className="text-gray-400 text-sm mb-4">
                  Tap on times to change. Toggle switch to enable/disable days.
                </Text>
                {displayHours.map((dayHoursItem, index) => (
                  <View
                    key={dayHoursItem.day}
                    className={`flex-row items-center justify-between py-3 border-b border-gray-700 ${!dayHoursItem.enabled ? "opacity-50" : ""}`}
                  >
                    <Text className="text-white font-medium w-24">
                      {dayHoursItem.day}
                    </Text>
                    <View className="flex-row items-center flex-1 justify-end gap-3">
                      <TouchableOpacity
                        onPress={() =>
                          dayHoursItem.enabled && openTimePicker(index, "open")
                        }
                        className="bg-[#404040] px-3 py-2 rounded-lg border border-gray-600"
                        disabled={!dayHoursItem.enabled}
                      >
                        <Text className="text-white font-medium">
                          {formatTo12Hour(dayHoursItem.open)}
                        </Text>
                      </TouchableOpacity>
                      <Text className="text-gray-500">-</Text>
                      <TouchableOpacity
                        onPress={() =>
                          dayHoursItem.enabled && openTimePicker(index, "close")
                        }
                        className="bg-[#404040] px-3 py-2 rounded-lg border border-gray-600"
                        disabled={!dayHoursItem.enabled}
                      >
                        <Text className="text-white font-medium">
                          {formatTo12Hour(dayHoursItem.close)}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <View className="ml-4">
                      <Switch
                        checked={dayHoursItem.enabled}
                        onCheckedChange={() => toggleDayEnabled(index)}
                      />
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Tax Settings */}
          <View className="bg-[#303030] rounded-xl border border-gray-700 mb-6">
            {renderSectionHeader(
              "Tax Configuration",
              <Percent size={20} color="#4ade80" />,
              "tax"
            )}
            {expandedSections.tax && (
              <View className="p-5">
                <View className="flex-row items-center justify-between py-3 border-b border-gray-700 mb-4">
                  <View>
                    <Text className="text-white font-medium">
                      Enable Sales Tax
                    </Text>
                    <Text className="text-gray-400 text-sm">
                      Apply tax to orders based on rate
                    </Text>
                  </View>
                  <Switch
                    checked={taxEnabled}
                    onCheckedChange={setTaxEnabled}
                  />
                </View>
                <View className="flex-row gap-4 mb-4">
                  <View className="flex-1">
                    {renderInputField(
                      "Tax Name",
                      taxLabel,
                      setTaxLabel,
                      <FileText size={18} color="#9ca3af" />
                    )}
                  </View>
                  <View className="flex-1">
                    {renderInputField(
                      "Tax Rate (%)",
                      defaultTaxRate.toString(),
                      (t) => updateField("defaultTaxRate", parseFloat(t) || 0),
                      <Percent size={18} color="#9ca3af" />
                    )}
                  </View>
                </View>
                <View className="flex-row items-center justify-between py-3">
                  <View>
                    <Text className="text-white font-medium">
                      Tax Included in Price
                    </Text>
                    <Text className="text-gray-400 text-sm">
                      Prices displayed on menu already include tax
                    </Text>
                  </View>
                  <Switch
                    checked={taxInclusive}
                    onCheckedChange={setTaxInclusive}
                  />
                </View>
              </View>
            )}
          </View>

          {/* Service Charges */}
          <View className="bg-[#303030] rounded-xl border border-gray-700 mb-6">
            {renderSectionHeader(
              "Service Charges & Gratuity",
              <DollarSign size={20} color="#facc15" />,
              "service"
            )}
            {expandedSections.service && (
              <View className="p-5">
                <View className="flex-row items-center justify-between py-3 border-b border-gray-700 mb-4">
                  <View>
                    <Text className="text-white font-medium">
                      Enable Auto-Gratuity
                    </Text>
                    <Text className="text-gray-400 text-sm">
                      Automatically add service charge for large parties
                    </Text>
                  </View>
                  <Switch
                    checked={serviceCharge.autoGratuity}
                    onCheckedChange={(v) =>
                      setServiceCharge((prev) => ({ ...prev, autoGratuity: v }))
                    }
                  />
                </View>
                <View className="flex-row gap-4">
                  <View className="flex-1">
                    {renderInputField(
                      "Party Size Threshold",
                      serviceCharge.largePartySize,
                      (t) =>
                        setServiceCharge((prev) => ({
                          ...prev,
                          largePartySize: t,
                        })),
                      null,
                      "e.g. 6"
                    )}
                  </View>
                  <View className="flex-1">
                    {renderInputField(
                      "Gratuity Percentage (%)",
                      serviceCharge.rate,
                      (t) => setServiceCharge((prev) => ({ ...prev, rate: t })),
                      <Percent size={18} color="#9ca3af" />
                    )}
                  </View>
                </View>
              </View>
            )}
          </View>

          <TouchableOpacity
            onPress={saveChanges}
            className="w-full bg-blue-600 py-4 rounded-xl items-center mb-6"
          >
            <Text className="text-white font-bold text-lg">Save Changes</Text>
          </TouchableOpacity>

          {/* Log Out Section */}
          <View className="bg-[#303030] rounded-xl border border-gray-700 mb-10 p-5">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center">
                <View className="w-8 h-8 bg-red-500/20 rounded-lg items-center justify-center mr-3">
                  <LogOut size={20} color="#ef4444" />
                </View>
                <View>
                  <Text className="text-white font-bold text-lg">Log Out</Text>
                  <Text className="text-gray-400 text-sm">
                    Sign out of your account
                  </Text>
                </View>
              </View>
              <SignOutButton />
            </View>
          </View>
        </ScrollView>

        <OperatingHoursTimeSheet
          bottomSheetRef={timeSheetRef}
          initialTime={
            timePickerState.dayIndex >= 0 &&
            displayHours[timePickerState.dayIndex]
              ? formatTo12Hour(
                  displayHours[timePickerState.dayIndex]?.[timePickerState.type]
                )
              : "09:00 AM"
          }
          day={
            timePickerState.dayIndex >= 0 &&
            displayHours[timePickerState.dayIndex]
              ? displayHours[timePickerState.dayIndex]?.day
              : ""
          }
          type={timePickerState.type}
          onSave={handleTimeSave}
          onClose={() => timeSheetRef.current?.close()}
        />
      </View>
    </GestureHandlerRootView>
  );
};

export default GeneralSettingsScreen;
