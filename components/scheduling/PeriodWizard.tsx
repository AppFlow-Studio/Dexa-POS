import { differenceInDays, format, parse } from "date-fns";
import {
  ArrowLeft,
  ArrowRight,
  Calendar as CalendarIcon,
  Check,
  X,
} from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { Calendar, DateData } from "react-native-calendars";
import { Dialog, DialogContent } from "../ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

export interface PeriodData {
  id?: string;
  name: string;
  startDate: string;
  endDate: string;
  status: "draft" | "active" | "completed";
  isScheduled?: boolean;
}

interface PeriodWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (data: PeriodData) => void;
  periodToEdit?: PeriodData | null;
}

const PeriodWizard: React.FC<PeriodWizardProps> = ({
  isOpen,
  onClose,
  onComplete,
  periodToEdit,
}) => {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: "",
    startDate: "",
    endDate: "",
  });
  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = useState(false);
  const [isEndDatePickerOpen, setIsEndDatePickerOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (periodToEdit) {
        // Ensure dates are in YYYY-MM-DD format
        const convertDate = (dateStr: string) => {
          try {
            return format(
              parse(dateStr, "MM/dd/yyyy", new Date()),
              "yyyy-MM-dd"
            );
          } catch {
            return dateStr; // Assume it's already in a valid format if parsing fails
          }
        };
        setFormData({
          name: periodToEdit.name,
          startDate: convertDate(periodToEdit.startDate),
          endDate: convertDate(periodToEdit.endDate),
        });
      } else {
        setFormData({ name: "", startDate: "", endDate: "" });
      }
      setStep(1); // Reset to first step whenever modal opens
    }
  }, [periodToEdit, isOpen]);

  const handleNext = () => {
    if (step < 3) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleComplete = () => {
    onComplete({
      ...periodToEdit,
      ...formData,
      status: periodToEdit?.status || "draft",
    });
  };

  const isStepValid = () => {
    switch (step) {
      case 1:
        return formData.name.trim().length > 0;
      case 2:
        return formData.startDate.length > 0 && formData.endDate.length > 0;
      case 3:
        return true;
      default:
        return false;
    }
  };

  const onDayPress = (day: DateData, type: "startDate" | "endDate") => {
    setFormData({ ...formData, [type]: day.dateString });
    if (type === "startDate") {
      setIsStartDatePickerOpen(false);
    } else {
      setIsEndDatePickerOpen(false);
    }
  };

  const getDuration = () => {
    if (!formData.startDate || !formData.endDate) return 0;
    try {
      const start = new Date(formData.startDate);
      const end = new Date(formData.endDate);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
      return differenceInDays(end, start) + 1;
    } catch (e) {
      return 0;
    }
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

  const renderStepIndicator = () => (
    <View className="flex-row items-center justify-between mb-8 px-6">
      {[1, 2, 3].map((s) => (
        <React.Fragment key={s}>
          <View
            className={`w-10 h-10 rounded-full items-center justify-center ${
              s < step
                ? "bg-green-500"
                : s === step
                  ? "bg-blue-600"
                  : "bg-gray-600"
            }`}
          >
            {s < step ? (
              <Check size={20} color="#FFFFFF" />
            ) : (
              <Text className="text-white font-bold text-lg">{s}</Text>
            )}
          </View>
          {s < 3 && (
            <View
              className={`flex-1 h-1 ${
                s < step ? "bg-green-500" : "bg-gray-600"
              }`}
            />
          )}
        </React.Fragment>
      ))}
    </View>
  );

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <View className="items-center">
            <View className="p-4 bg-blue-600/20 rounded-full mb-4">
              <CalendarIcon
                size={32}
                className="text-blue-400"
                color={"#60a5fa"}
              />
            </View>
            <Text className="text-xl font-bold text-white mb-2">
              Name Your Schedule Period
            </Text>
            <Text className="text-gray-400 text-center mb-6">
              Choose a descriptive name.
            </Text>
            <TextInput
              value={formData.name}
              onChangeText={(text) => setFormData({ ...formData, name: text })}
              placeholder="e.g., Q3 Summer Schedule"
              placeholderTextColor="#6B7280"
              className="p-4 w-full bg-[#212121] border border-gray-600 rounded-lg text-white text-base"
            />
          </View>
        );
      case 2:
        return (
          <View className="items-center">
            <View className="p-4 bg-blue-600/20 rounded-full mb-4">
              <CalendarIcon
                size={32}
                className="text-blue-400"
                color={"#60a5fa"}
              />
            </View>
            <Text className="text-xl font-bold text-white mb-2">
              Set Date Range
            </Text>
            <Text className="text-gray-400 text-center mb-6">
              Define the start and end dates.
            </Text>
            <View className="w-full flex-row gap-4">
              <View className="flex-1">
                <Text className="text-gray-300 mb-2 font-semibold">
                  Start Date
                </Text>
                <Popover onOpenChange={setIsStartDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <TouchableOpacity className="p-4 h-14 bg-[#212121] border border-gray-600 rounded-lg flex-row justify-between items-center">
                      <Text className="text-white text-base">
                        {formData.startDate
                          ? format(new Date(formData.startDate), "yyyy-MM-dd")
                          : "Select Date"}
                      </Text>
                      <CalendarIcon size={16} color="#9CA3AF" />
                    </TouchableOpacity>
                  </PopoverTrigger>
                  {isStartDatePickerOpen && (
                    <PopoverContent
                      className="w-96 bg-[#303030] border-gray-700 z-50"
                      align="end"
                    >
                      <Calendar
                        current={formData.startDate || undefined}
                        onDayPress={(day) => onDayPress(day, "startDate")}
                        theme={calendarTheme}
                        markedDates={{
                          [formData.startDate]: {
                            selected: true,
                            selectedColor: "#3b82f6",
                          },
                        }}
                      />
                    </PopoverContent>
                  )}
                </Popover>
              </View>
              <View className="flex-1">
                <Text className="text-gray-300 mb-2 font-semibold">
                  End Date
                </Text>
                <Popover onOpenChange={setIsEndDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <TouchableOpacity className="p-4 h-14 bg-[#212121] border border-gray-600 rounded-lg flex-row justify-between items-center">
                      <Text className="text-white text-base">
                        {formData.endDate
                          ? format(new Date(formData.endDate), "yyyy-MM-dd")
                          : "Select Date"}
                      </Text>
                      <CalendarIcon size={16} color="#9CA3AF" />
                    </TouchableOpacity>
                  </PopoverTrigger>
                  {isEndDatePickerOpen && (
                    <PopoverContent
                      className="w-96 bg-[#303030] border-gray-700 z-50"
                      align="end"
                    >
                      <Calendar
                        current={formData.endDate || undefined}
                        onDayPress={(day) => onDayPress(day, "endDate")}
                        theme={calendarTheme}
                        markedDates={{
                          [formData.endDate]: {
                            selected: true,
                            selectedColor: "#3b82f6",
                          },
                        }}
                      />
                    </PopoverContent>
                  )}
                </Popover>
              </View>
            </View>
          </View>
        );
      case 3:
        return (
          <View className="items-center">
            <View className="p-4 bg-green-500/20 rounded-full mb-4">
              <Check size={32} className="text-green-400" />
            </View>
            <Text className="text-xl font-bold text-white mb-2">
              Review & Confirm
            </Text>
            <Text className="text-gray-400 text-center mb-6">
              Verify the details before saving.
            </Text>
            <View className="w-full p-4 bg-[#212121] border border-gray-600 rounded-lg gap-y-3">
              <View className="flex-row justify-between">
                <Text className="text-gray-400">Period Name:</Text>
                <Text className="text-white font-semibold">
                  {formData.name}
                </Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-gray-400">Start Date:</Text>
                <Text className="text-white font-semibold">
                  {formData.startDate}
                </Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-gray-400">End Date:</Text>
                <Text className="text-white font-semibold">
                  {formData.endDate}
                </Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-gray-400">Duration:</Text>
                <Text className="text-white font-semibold">
                  {getDuration()} days
                </Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-gray-400">Status:</Text>
                <Text className="text-yellow-400 font-semibold">
                  {periodToEdit?.status || "Draft"}
                </Text>
              </View>
            </View>
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[550px] max-w-lg bg-[#303030] rounded-2xl border-gray-700 p-0">
        <View className="p-6 border-b border-gray-700">
          <View className="flex-row justify-between items-center">
            <View>
              <Text className="text-white text-xl font-bold">
                {periodToEdit ? "Edit" : "Create"} Schedule Period
              </Text>
              <Text className="text-gray-400 mt-1">Step {step} of 3</Text>
            </View>
            <TouchableOpacity onPress={onClose} className="p-1">
              <X size={24} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        </View>

        <View className="pt-6">{renderStepIndicator()}</View>

        <View className="px-6 pb-6 min-h-[300px]">{renderStepContent()}</View>

        <View className="p-6 border-t border-gray-700 flex-row justify-between items-center">
          <TouchableOpacity
            onPress={handleBack}
            disabled={step === 1}
            className={`flex-row items-center gap-2 px-4 py-2 rounded-lg ${
              step === 1 ? "opacity-50" : "bg-gray-700/80"
            }`}
          >
            <ArrowLeft size={18} color="#FFFFFF" />
            <Text className="text-white font-bold">Back</Text>
          </TouchableOpacity>
          {step < 3 ? (
            <TouchableOpacity
              onPress={handleNext}
              disabled={!isStepValid()}
              className={`flex-row items-center gap-2 px-4 py-2 rounded-lg ${
                !isStepValid() ? "opacity-50 bg-gray-600" : "bg-blue-600"
              }`}
            >
              <Text className="text-white font-bold">Next</Text>
              <ArrowRight size={18} color="#FFFFFF" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={handleComplete}
              className="flex-row items-center gap-2 px-4 py-2 bg-blue-600 rounded-lg"
            >
              <Check size={18} color="#FFFFFF" />
              <Text className="text-white font-bold">
                {periodToEdit ? "Save Changes" : "Create Period"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </DialogContent>
    </Dialog>
  );
};

export default PeriodWizard;
