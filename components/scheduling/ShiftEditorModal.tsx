import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Role, Shift } from "@/lib/types";
import { format, parse } from "date-fns";
import { AlertCircle, Copy } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { ScrollView } from "react-native-gesture-handler";
interface ShiftEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shift?: Partial<Shift> | null;
  periodId: string;
  scheduleType: "period" | "week";
  onSave: (shift: Partial<Shift>) => void;
  onSaveAndDuplicate?: (shift: Partial<Shift>) => void;
}

const roles: Role[] = ["Cashier", "Barista", "Line Cook", "Prep", "Supervisor"];

// Helper to format 24-hour time to 12-hour AM/PM
const formatTo12Hour = (time: string) => {
  if (!time) return "";
  const [hours, minutes] = time.split(":");
  const h = parseInt(hours, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const formattedHours = h % 12 || 12; // Converts 0 or 12 to 12
  return `${String(formattedHours).padStart(2, "0")}:${minutes} ${ampm}`;
};

// Helper to format 12-hour AM/PM time to 24-hour
const formatTo24Hour = (time: string) => {
  if (!time) return "";
  const [timePart, ampm] = time.split(" ");
  let [hours, minutes] = timePart.split(":");
  let h = parseInt(hours, 10);

  if (ampm === "PM" && h < 12) {
    h += 12;
  }
  if (ampm === "AM" && h === 12) {
    h = 0; // Midnight case
  }
  return `${String(h).padStart(2, "0")}:${minutes}`;
};

const timeSlots = Array.from({ length: 48 }, (_, i) => {
  const hours = Math.floor(i / 2);
  const minutes = (i % 2) * 30;
  return formatTo12Hour(
    `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
  );
});

export function ShiftEditorModal({
  open,
  onOpenChange,
  shift,
  periodId,
  scheduleType,
  onSave,
  onSaveAndDuplicate,
}: ShiftEditorModalProps) {
  const [role, setRole] = useState<Role>("Cashier");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("09:00 AM");
  const [endTime, setEndTime] = useState("05:00 PM");
  const [notes, setNotes] = useState("");
  const [lockAssignment, setLockAssignment] = useState(false);
  const [allowOpenClaims, setAllowOpenClaims] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [breakMinutes, setBreakMinutes] = useState(30);
  const [expectedPace, setExpectedPace] = useState<
    "Moderate" | "Busy" | "Calm"
  >("Moderate");
  const [staffingLevel, setStaffingLevel] = useState<
    "May need help" | "Fully staffed"
  >("Fully staffed");

  useEffect(() => {
    if (shift) {
      setRole(shift.role || "Cashier");
      setDate(shift.date || new Date().toISOString().split("T")[0]);
      setStartTime(formatTo12Hour(shift.startTime || "09:00"));
      setEndTime(formatTo12Hour(shift.endTime || "17:00"));
      setNotes(shift.managerNote || "");
      setLockAssignment(shift.locked || false);
      setBreakMinutes(shift.breakMinutes || 30);
      setExpectedPace(shift.expectedPace || "Moderate");
      setStaffingLevel(shift.staffingLevel || "Fully staffed");
    } else {
      // Reset for new shift
      setRole("Cashier");
      setDate(new Date().toISOString().split("T")[0]);
      setStartTime("09:00 AM");
      setEndTime("05:00 PM");
      setNotes("");
      setLockAssignment(false);
      setAllowOpenClaims(true);
      setBreakMinutes(30);
      setExpectedPace("Moderate");
      setStaffingLevel("Fully staffed");
    }
    setErrors([]);
  }, [shift, open]);

  const validateShift = () => {
    const newErrors: string[] = [];
    const start24 = formatTo24Hour(startTime);
    const end24 = formatTo24Hour(endTime);
    const [startH, startM] = start24.split(":").map(Number);
    const [endH, endM] = end24.split(":").map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    const durationHours = (endMinutes - startMinutes) / 60;

    if (durationHours < 4) newErrors.push("Shift must be at least 4 hours");
    if (durationHours > 8) newErrors.push("Shift cannot exceed 8 hours");
    if (startMinutes >= endMinutes)
      newErrors.push("End time must be after start time");
    if (!role) newErrors.push("Role is required");

    setErrors(newErrors);
    return newErrors.length === 0;
  };

  const handleSave = () => {
    if (!validateShift()) return;
    onSave({
      id: shift?.id,
      employeeId: shift?.employeeId,
      periodId,
      role,
      date,
      startTime: formatTo24Hour(startTime),
      endTime: formatTo24Hour(endTime),
      managerNote: notes,
      locked: lockAssignment,
      isOpen: allowOpenClaims && !shift?.employeeId,
      location: "Dexa – 5th Ave", //Update it once location logic is made
      breakMinutes,
      expectedPace,
      staffingLevel,
    });
    onOpenChange(false);
  };

  const handleSaveAndDuplicate = () => {
    if (!validateShift() || !onSaveAndDuplicate) return;
    onSaveAndDuplicate({
      employeeId: shift?.employeeId,
      periodId,
      role,
      date,
      startTime: formatTo24Hour(startTime),
      endTime: formatTo24Hour(endTime),
      managerNote: notes,
      locked: lockAssignment,
      isOpen: allowOpenClaims && !shift?.employeeId,
      location: "Dexa – 5th Ave", //Update it once location logic is made
      breakMinutes,
      expectedPace,
      staffingLevel,
    });
    onOpenChange(false);
  };

  const onDayPress = (day: DateData) => {
    setDate(day.dateString);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-[#303030] border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-white">
            {shift?.id ? "Edit Shift" : "Create Shift"}
          </DialogTitle>
        </DialogHeader>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0} // Adjust as needed
        >
          <ScrollView className="py-4 gap-y-4 max-h-[75vh]">
            {errors.length > 0 && (
              <View className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                <View className="flex-row items-start gap-2">
                  <AlertCircle
                    size={16}
                    className="text-red-400 mt-1"
                    color={"#f87171"}
                  />
                  <View className="gap-y-1">
                    {errors.map((error, i) => (
                      <Text key={i} className="text-sm text-red-400">
                        {error}
                      </Text>
                    ))}
                  </View>
                </View>
              </View>
            )}

            <View className="gap-y-2 mb-2">
              <Text className="text-gray-300 font-semibold">Role *</Text>
              <Select
                onValueChange={(option) => setRole(option?.value as Role)}
                value={{ label: role, value: role }}
              >
                <SelectTrigger className="bg-[#212121]">
                  <SelectValue
                    placeholder="Select a role..."
                    className="text-white"
                  />
                </SelectTrigger>
                <SelectContent className="bg-[#212121] border-gray-600">
                  {roles.map((r) => (
                    <SelectItem
                      key={r}
                      label={r}
                      value={r}
                      className="text-white"
                    />
                  ))}
                </SelectContent>
              </Select>
            </View>

            <View className="gap-y-2 mb-2">
              <Text className="text-gray-300 font-semibold">Date</Text>
              <View className="p-4 h-14 bg-[#212121] border border-gray-600 rounded-lg flex-row justify-between items-center">
                <Text className="text-white text-base">
                  {date
                    ? format(
                        parse(date, "yyyy-MM-dd", new Date()),
                        "EEEE, MMMM d"
                      )
                    : "No Date"}
                </Text>
              </View>
            </View>

            <View className="flex-row gap-4 mb-2">
              <View className="flex-1 gap-y-2">
                <Text className="text-gray-300 font-semibold">
                  Start Time *
                </Text>
                <Select
                  onValueChange={(option) =>
                    option && setStartTime(option.value)
                  }
                  value={{ label: startTime, value: startTime }}
                >
                  <SelectTrigger className="bg-[#212121]">
                    <SelectValue
                      placeholder="Select a time..."
                      className="text-white"
                    />
                  </SelectTrigger>
                  <SelectContent className="bg-[#212121] border-gray-600">
                    <ScrollView className="h-full">
                      {timeSlots.map((time) => (
                        <SelectItem key={time} label={time} value={time} />
                      ))}
                    </ScrollView>
                  </SelectContent>
                </Select>
              </View>
              <View className="flex-1 gap-y-2">
                <Text className="text-gray-300 font-semibold">End Time *</Text>
                <Select
                  onValueChange={(option) => option && setEndTime(option.value)}
                  value={{ label: endTime, value: endTime }}
                >
                  <SelectTrigger className="bg-[#212121]">
                    <SelectValue
                      placeholder="Select a time..."
                      className="text-white"
                    />
                  </SelectTrigger>
                  <SelectContent className="bg-[#212121] border-gray-600">
                    <ScrollView className="h-full">
                      {timeSlots.map((time) => (
                        <SelectItem key={time} label={time} value={time} />
                      ))}
                    </ScrollView>
                  </SelectContent>
                </Select>
              </View>
            </View>

            <View className="gap-y-2 mb-2">
              <Text className="text-gray-300 font-semibold">Break Minutes</Text>
              <TextInput
                value={String(breakMinutes)}
                onChangeText={(text) => setBreakMinutes(Number(text))}
                keyboardType="numeric"
                className="p-3 bg-[#212121] border border-gray-600 rounded-lg text-white text-base"
              />
            </View>

            <View className="gap-y-2 mb-2">
              <Text className="text-gray-300 font-semibold">Expected Pace</Text>
              <Select
                onValueChange={(option) =>
                  option &&
                  setExpectedPace(option.value as "Moderate" | "Busy" | "Calm")
                }
                value={{ label: expectedPace, value: expectedPace }}
              >
                <SelectTrigger className="bg-[#212121]">
                  <SelectValue
                    placeholder="Select a pace..."
                    className="text-white"
                  />
                </SelectTrigger>
                <SelectContent className="bg-[#212121] border-gray-600">
                  <SelectItem label="Moderate" value="Moderate" />
                  <SelectItem label="Busy" value="Busy" />
                  <SelectItem label="Calm" value="Calm" />
                </SelectContent>
              </Select>
            </View>

            <View className="gap-y-2 mb-2">
              <Text className="text-gray-300 font-semibold">
                Staffing Level
              </Text>
              <Select
                onValueChange={(option) =>
                  option &&
                  setStaffingLevel(
                    option.value as "May need help" | "Fully staffed"
                  )
                }
                value={{ label: staffingLevel, value: staffingLevel }}
              >
                <SelectTrigger className="bg-[#212121]">
                  <SelectValue
                    placeholder="Select a staffing level..."
                    className="text-white"
                  />
                </SelectTrigger>
                <SelectContent className="bg-[#212121] border-gray-600">
                  <SelectItem label="May need help" value="May need help" />
                  <SelectItem label="Fully staffed" value="Fully staffed" />
                </SelectContent>
              </Select>
            </View>

            <View className="gap-y-2 mb-2">
              <Text className="text-gray-300 font-semibold">Notes</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Add any special instructions..."
                placeholderTextColor="#6B7280"
                multiline
                className="p-3 bg-[#212121] border border-gray-600 rounded-lg text-white min-h-[80px]"
              />
            </View>

            <View className="gap-y-1 pt-2 mb-6">
              <View className="flex-row items-center justify-between py-2">
                <Label htmlFor="lock" className="text-sm text-white flex-1">
                  Lock assignment (prevent changes)
                </Label>
                <Switch
                  trackColor={{ false: "#3e3e3e", true: "#4f46e5" }}
                  thumbColor={"#f4f4f5"}
                  ios_backgroundColor="#3e3e3e"
                  onValueChange={setLockAssignment}
                  value={lockAssignment}
                  id="lock"
                />
              </View>
              <View className="flex-row items-center justify-between py-2">
                <Label
                  htmlFor="open-claims"
                  className="text-sm text-white flex-1"
                >
                  Allow open shift claims
                </Label>
                <Switch
                  trackColor={{ false: "#3e3e3e", true: "#4f46e5" }}
                  thumbColor={"#f4f4f5"}
                  ios_backgroundColor="#3e3e3e"
                  onValueChange={setAllowOpenClaims}
                  value={allowOpenClaims}
                  id="open-claims"
                />
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        <DialogFooter className="gap-2">
          <Button variant="outline" onPress={() => onOpenChange(false)}>
            <Text className="text-white">Cancel</Text>
          </Button>
          {onSaveAndDuplicate && (
            <Button
              variant="outline"
              onPress={handleSaveAndDuplicate}
              className="gap-2 bg-transparent border-gray-600 flex-row"
            >
              <Copy size={16} color="#FFFFFF" />
              <Text className="text-white">Save & Duplicate</Text>
            </Button>
          )}
          <Button
            onPress={handleSave}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Text className="text-white font-semibold">Save Shift</Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ShiftEditorModal;
