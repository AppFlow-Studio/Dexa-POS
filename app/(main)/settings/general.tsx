import { Building2, ChevronDown, ChevronUp, Clock, DollarSign, FileText, Globe, MapPin, Percent, Phone, Store, X } from "lucide-react-native";
import React, { useState } from "react";
import { Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Switch } from "~/components/ui/switch";
import { useSettingsPageStore } from "~/stores/useSettingsPageStore";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const TIME_OPTIONS = [
  "12:00 AM", "12:30 AM", "01:00 AM", "01:30 AM", "02:00 AM", "02:30 AM",
  "03:00 AM", "03:30 AM", "04:00 AM", "04:30 AM", "05:00 AM", "05:30 AM",
  "06:00 AM", "06:30 AM", "07:00 AM", "07:30 AM", "08:00 AM", "08:30 AM",
  "09:00 AM", "09:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM",
  "12:00 PM", "12:30 PM", "01:00 PM", "01:30 PM", "02:00 PM", "02:30 PM",
  "03:00 PM", "03:30 PM", "04:00 PM", "04:30 PM", "05:00 PM", "05:30 PM",
  "06:00 PM", "06:30 PM", "07:00 PM", "07:30 PM", "08:00 PM", "08:30 PM",
  "09:00 PM", "09:30 PM", "10:00 PM", "10:30 PM", "11:00 PM", "11:30 PM",
];

const GeneralSettingsScreen = () => {
  // Zustand store
  const {
    businessInfo, setBusinessInfo,
    operatingHours, updateDayHours,
    taxSettings, setTaxSettings,
    serviceCharge, setServiceCharge,
  } = useSettingsPageStore();

  // Local UI state
  const [timePickerModal, setTimePickerModal] = useState<{
    visible: boolean;
    day: string;
    type: "open" | "close";
  }>({ visible: false, day: "", type: "open" });

  const [expandedSections, setExpandedSections] = useState({
    info: true,
    hours: true,
    tax: true,
    service: true,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const toggleDayEnabled = (day: string) => {
    updateDayHours(day, { enabled: !operatingHours[day].enabled });
  };

  const openTimePicker = (day: string, type: "open" | "close") => {
    setTimePickerModal({ visible: true, day, type });
  };

  const selectTime = (time: string) => {
    const { day, type } = timePickerModal;
    updateDayHours(day, { [type]: time });
    setTimePickerModal({ visible: false, day: "", type: "open" });
  };

  const renderSectionHeader = (title: string, icon: React.ReactNode, section: keyof typeof expandedSections) => (
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
      {expandedSections[section] ? <ChevronUp size={20} color="#9ca3af" /> : <ChevronDown size={20} color="#9ca3af" />}
    </TouchableOpacity>
  );

  const renderInputField = (label: string, value: string, onChange: (text: string) => void, icon?: React.ReactNode, placeholder?: string) => (
    <View className="mb-4">
      <Text className="text-gray-400 text-sm font-medium mb-2">{label}</Text>
      <View className="flex-row items-center bg-[#404040] border border-gray-600 rounded-lg overflow-hidden">
        {icon && <View className="p-3 bg-[#505050] border-r border-gray-600">{icon}</View>}
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

  const renderTimePickerModal = () => (
    <Modal visible={timePickerModal.visible} transparent animationType="fade" onRequestClose={() => setTimePickerModal({ visible: false, day: "", type: "open" })} statusBarTranslucent>
      <View className="flex-1 justify-center items-center bg-black/60 px-6">
        <View className="w-full max-w-[400px] bg-[#303030] rounded-2xl border border-gray-700 overflow-hidden">
          <View className="p-4 border-b border-gray-700 flex-row items-center justify-between">
            <Text className="text-xl font-bold text-white">
              Select {timePickerModal.type === "open" ? "Opening" : "Closing"} Time
            </Text>
            <TouchableOpacity onPress={() => setTimePickerModal({ visible: false, day: "", type: "open" })} className="p-2">
              <X size={24} color="#9ca3af" />
            </TouchableOpacity>
          </View>
          <View className="p-2">
            <Text className="text-gray-400 text-sm px-2 pb-2">{timePickerModal.day}</Text>
            <ScrollView className="max-h-[300px]" showsVerticalScrollIndicator={false}>
              <View className="flex-row flex-wrap">
                {TIME_OPTIONS.map((time) => {
                  const isSelected = operatingHours[timePickerModal.day]?.[timePickerModal.type] === time;
                  return (
                    <TouchableOpacity
                      key={time}
                      onPress={() => selectTime(time)}
                      className="w-1/3 p-2"
                    >
                      <View className={`py-3 px-2 rounded-lg items-center ${isSelected ? "bg-blue-600" : "bg-[#404040]"}`}>
                        <Text className={`text-sm font-medium ${isSelected ? "text-white" : "text-gray-300"}`}>{time}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );

  return (
    <View className="flex-1 bg-[#212121] p-6">
      {renderTimePickerModal()}

      <View className="mb-6">
        <Text className="text-3xl font-bold text-white">General Settings</Text>
        <Text className="text-gray-400 mt-2">Manage business information, operating hours, and tax configurations.</Text>
      </View>

      <View className="h-px w-full bg-gray-700 mb-6" />

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Business Information */}
        <View className="bg-[#303030] rounded-xl border border-gray-700 mb-6">
          {renderSectionHeader("Business Information", <Store size={20} color="#60a5fa" />, "info")}
          {expandedSections.info && (
            <View className="p-5">
              {renderInputField("Business Name", businessInfo.name, (t) => setBusinessInfo({ name: t }), <Building2 size={18} color="#9ca3af" />)}
              {renderInputField("Address", businessInfo.address, (t) => setBusinessInfo({ address: t }), <MapPin size={18} color="#9ca3af" />)}
              <View className="flex-row gap-4">
                <View className="flex-1">
                  {renderInputField("Phone", businessInfo.phone, (t) => setBusinessInfo({ phone: t }), <Phone size={18} color="#9ca3af" />)}
                </View>
                <View className="flex-1">
                  {renderInputField("Website", businessInfo.website, (t) => setBusinessInfo({ website: t }), <Globe size={18} color="#9ca3af" />)}
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Operating Hours */}
        <View className="bg-[#303030] rounded-xl border border-gray-700 mb-6">
          {renderSectionHeader("Operating Hours", <Clock size={20} color="#f97316" />, "hours")}
          {expandedSections.hours && (
            <View className="p-5">
              <Text className="text-gray-400 text-sm mb-4">Tap on times to change. Toggle switch to enable/disable days.</Text>
              {DAYS.map((day) => {
                const hours = operatingHours[day];
                return (
                  <View key={day} className={`flex-row items-center justify-between py-3 border-b border-gray-700 ${!hours.enabled ? "opacity-50" : ""}`}>
                    <Text className="text-white font-medium w-24">{day}</Text>
                    <View className="flex-row items-center flex-1 justify-end gap-3">
                      <TouchableOpacity
                        onPress={() => hours.enabled && openTimePicker(day, "open")}
                        className="bg-[#404040] px-3 py-2 rounded-lg border border-gray-600"
                        disabled={!hours.enabled}
                      >
                        <Text className="text-white font-medium">{hours.open}</Text>
                      </TouchableOpacity>
                      <Text className="text-gray-500">-</Text>
                      <TouchableOpacity
                        onPress={() => hours.enabled && openTimePicker(day, "close")}
                        className="bg-[#404040] px-3 py-2 rounded-lg border border-gray-600"
                        disabled={!hours.enabled}
                      >
                        <Text className="text-white font-medium">{hours.close}</Text>
                      </TouchableOpacity>
                    </View>
                    <View className="ml-4">
                      <Switch checked={hours.enabled} onCheckedChange={() => toggleDayEnabled(day)} />
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Tax Settings */}
        <View className="bg-[#303030] rounded-xl border border-gray-700 mb-6">
          {renderSectionHeader("Tax Configuration", <Percent size={20} color="#4ade80" />, "tax")}
          {expandedSections.tax && (
            <View className="p-5">
              <View className="flex-row items-center justify-between py-3 border-b border-gray-700 mb-4">
                <View>
                  <Text className="text-white font-medium">Enable Sales Tax</Text>
                  <Text className="text-gray-400 text-sm">Apply tax to orders based on rate</Text>
                </View>
                <Switch checked={taxSettings.enabled} onCheckedChange={(v) => setTaxSettings({ enabled: v })} />
              </View>

              <View className="flex-row gap-4 mb-4">
                <View className="flex-1">
                  {renderInputField("Tax Name", taxSettings.label, (t) => setTaxSettings({ label: t }), <FileText size={18} color="#9ca3af" />)}
                </View>
                <View className="flex-1">
                  {renderInputField("Tax Rate (%)", taxSettings.rate, (t) => setTaxSettings({ rate: t }), <Percent size={18} color="#9ca3af" />)}
                </View>
              </View>

              <View className="flex-row items-center justify-between py-3">
                <View>
                  <Text className="text-white font-medium">Tax Included in Price</Text>
                  <Text className="text-gray-400 text-sm">Prices displayed on menu already include tax</Text>
                </View>
                <Switch checked={taxSettings.inclusive} onCheckedChange={(v) => setTaxSettings({ inclusive: v })} />
              </View>
            </View>
          )}
        </View>

        {/* Service Charges */}
        <View className="bg-[#303030] rounded-xl border border-gray-700 mb-6">
          {renderSectionHeader("Service Charges & Gratuity", <DollarSign size={20} color="#facc15" />, "service")}
          {expandedSections.service && (
            <View className="p-5">
              <View className="flex-row items-center justify-between py-3 border-b border-gray-700 mb-4">
                <View>
                  <Text className="text-white font-medium">Enable Auto-Gratuity</Text>
                  <Text className="text-gray-400 text-sm">Automatically add service charge for large parties</Text>
                </View>
                <Switch checked={serviceCharge.autoGratuity} onCheckedChange={(v) => setServiceCharge({ autoGratuity: v })} />
              </View>

              <View className="flex-row gap-4">
                <View className="flex-1">
                  {renderInputField("Party Size Threshold", serviceCharge.largePartySize, (t) => setServiceCharge({ largePartySize: t }), null, "e.g. 6")}
                </View>
                <View className="flex-1">
                  {renderInputField("Gratuity Percentage (%)", serviceCharge.rate, (t) => setServiceCharge({ rate: t }), <Percent size={18} color="#9ca3af" />)}
                </View>
              </View>
            </View>
          )}
        </View>

        <TouchableOpacity className="w-full bg-blue-600 py-4 rounded-xl items-center mb-10">
          <Text className="text-white font-bold text-lg">Save Changes</Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
};

export default GeneralSettingsScreen;
