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
import { colors, switchTrackColors } from "@/lib/theme";
import { Role, Shift, TemplateShift } from "@/lib/types"; // Import TemplateShift
import BottomSheet from "@/components/ui/bottomSheet";
import {
  addDays,
  differenceInMinutes,
  format,
  isValid,
  parse,
  parseISO,
} from "date-fns"; // Import addDays
import { formatInTimeZone } from "date-fns-tz";
import { AlertCircle, Copy } from "lucide-react-native";
import React, { RefObject, useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import uuid from "react-native-uuid"; // Import uuid
import DatePickerBottomSheet from "./DatePickerBottomSheet";
import { TimePickerBottomSheet } from "./TimePickerBottomSheet";

interface ShiftEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shift?: Partial<Shift & TemplateShift> | null; // Updated prop type
  periodId?: string; // Made optional for template mode
  scheduleType?: "period" | "week"; // Made optional for template mode
  onSave: (data: Partial<Shift & TemplateShift>) => void; // Updated prop type
  onSaveAndDuplicate?: (data: Partial<Shift & TemplateShift>) => void; // Updated prop type
  isTemplateMode?: boolean; // New prop
  dayOfWeek?: number; // New prop for template mode
  enableDateChange?: boolean; // New prop to enable date editing
}

const roles: Role[] = ["Cashier", "Barista", "Line Cook", "Prep", "Supervisor"];

// Helper to format ISO string to 12-hour AM/PM in UTC
const formatTo12Hour = (isoString: string) => {
  if (!isoString) return "";
  try {
    // We expect an ISO string, which is parsed as UTC by default in modern JS
    // and correctly by date-fns-tz
    return formatInTimeZone(isoString, "UTC", "h:mm a");
  } catch (error) {
    console.warn(`Invalid ISO string passed to formatTo12Hour: ${isoString}`);
    return ""; // Return empty or a fallback
  }
};

// Helper to combine date and 12-hour time into a UTC ISO string
const combineToISO = (date: string, time12h: string) => {
  if (!date || !time12h) return "";
  // The date is yyyy-MM-dd, and time is h:mm a
  const dateTimeString = `${date} ${time12h}`;
  // Parse the combined string. Assume the inputs are meant for UTC.
  // We construct a new date object from parts to avoid timezone assumptions.
  const parsedTime = parse(time12h, "h:mm a", new Date());
  const hours = parsedTime.getHours();
  const minutes = parsedTime.getMinutes();
  const [year, month, day] = date.split("-").map(Number);

  // Create a UTC date
  const utcDate = new Date(Date.UTC(year, month - 1, day, hours, minutes));
  return utcDate.toISOString();
};

// Helper to get a placeholder date for a given dayOfWeek (0=Sunday, 6=Saturday)
const getPlaceholderDate = (dayOfWeek: number): string => {
  const baseDate = new Date("1970-01-04T00:00:00.000Z"); // A Sunday
  return format(addDays(baseDate, dayOfWeek), "yyyy-MM-dd");
};

export function ShiftEditorModal({
  open,
  onOpenChange,
  shift,
  periodId,
  scheduleType,
  onSave,
  onSaveAndDuplicate,
  isTemplateMode: templateMode = false, // Default to false
  dayOfWeek, // For new template shifts
  enableDateChange = false, // Default to false
}: ShiftEditorModalProps) {
  const [role, setRole] = useState<Role>("Cashier");
  const [date, setDate] = useState(""); // This will be a placeholder date in template mode
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [notes, setNotes] = useState("");
  const [lockAssignment, setLockAssignment] = useState(false);
  const [allowOpenClaims, setAllowOpenClaims] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [durationError, setDurationError] = useState<string | null>(null);
  const [breakMinutes, setBreakMinutes] = useState(30);
  const [expectedPace, setExpectedPace] = useState<
    "Moderate" | "Busy" | "Calm"
  >("Moderate");
  const [staffingLevel, setStaffingLevel] = useState<
    "May need help" | "Fully staffed"
  >("Fully staffed");

  const startTimeSheetRef = useRef<BottomSheet>(null);
  const endTimeSheetRef = useRef<BottomSheet>(null);
  const datePickerSheetRef = useRef<BottomSheet>(null);

  useEffect(() => {
    if (open) {
      // Only reset when modal opens
      if (shift) {
        // Editing existing shift or template shift
        setRole(shift.role || "Cashier");
        setNotes(shift.managerNote || shift.notes || "");
        setBreakMinutes(shift.breakMinutes || 30);
        setExpectedPace(shift.expectedPace || "Moderate");
        setStaffingLevel(shift.staffingLevel || "Fully staffed");

        if (templateMode) {
          // For template shifts, extract dayOfWeek and use placeholder date
          const shiftDayOfWeek =
            shift.dayOfWeek !== undefined
              ? shift.dayOfWeek
              : shift.startTime
                ? parseISO(shift.startTime).getUTCDay() // Use getUTCDay
                : 0;
          const placeholderDate = getPlaceholderDate(shiftDayOfWeek);
          setDate(placeholderDate);
          setStartTime(
            shift.startTime || combineToISO(placeholderDate, "09:00 AM")
          );
          setEndTime(
            shift.endTime || combineToISO(placeholderDate, "05:00 PM")
          );
          setLockAssignment(false); // Not applicable for template shifts
          setAllowOpenClaims(true); // Not applicable for template shifts
        } else {
          // For real shifts
          const shiftDate =
            shift.date || new Date().toISOString().split("T")[0];
          setDate(shiftDate);
          setStartTime(shift.startTime || combineToISO(shiftDate, "09:00 AM"));
          setEndTime(shift.endTime || combineToISO(shiftDate, "05:00 PM"));
          setLockAssignment(shift.locked || false);
          setAllowOpenClaims(true); // Default for real shifts
        }
      } else {
        // Creating new shift or template shift
        setRole("Cashier");
        setNotes("");
        setLockAssignment(false);
        setAllowOpenClaims(true);
        setBreakMinutes(30);
        setExpectedPace("Moderate");
        setStaffingLevel("Fully staffed");

        if (templateMode && dayOfWeek !== undefined) {
          const placeholderDate = getPlaceholderDate(dayOfWeek);
          setDate(placeholderDate);
          setStartTime(combineToISO(placeholderDate, "09:00 AM"));
          setEndTime(combineToISO(placeholderDate, "05:00 PM"));
        } else {
          const today = new Date().toISOString().split("T")[0];
          setDate(today);
          setStartTime(combineToISO(today, "09:00 AM"));
          setEndTime(combineToISO(today, "05:00 PM"));
        }
      }
      setErrors([]);
    }
  }, [shift, open, templateMode, dayOfWeek]);

  useEffect(() => {
    if (!startTime || !endTime) return;
    const start = parseISO(startTime);
    const end = parseISO(endTime);
    if (!isValid(start) || !isValid(end)) return;

    const duration = differenceInMinutes(end, start);

    if (duration > 0 && duration < 240) {
      setDurationError("Shift must be at least 4 hours.");
    } else if (duration > 480) {
      setDurationError("Shift cannot exceed 8 hours.");
    } else if (duration <= 0) {
      setDurationError("End time must be after start time.");
    } else {
      setDurationError(null);
    }
  }, [startTime, endTime]);

  const validateShift = () => {
    const newErrors: string[] = [];
    if (durationError) {
      newErrors.push(durationError);
    }
    if (!role) {
      newErrors.push("Role is required");
    }

    setErrors(newErrors);
    return newErrors.length === 0;
  };

  const handleSave = () => {
    if (!validateShift()) return;
    const commonData = {
      role,
      startTime,
      endTime,
      notes: templateMode ? notes : undefined,
      managerNote: !templateMode ? notes : undefined,
      breakMinutes,
      expectedPace,
      staffingLevel,
    };
    if (templateMode) {
      onSave({
        ...shift,
        ...commonData,
        tempId: shift?.tempId || (uuid.v4() as string),
        dayOfWeek:
          dayOfWeek !== undefined
            ? dayOfWeek
            : shift?.dayOfWeek !== undefined
              ? shift.dayOfWeek
              : parseISO(startTime).getUTCDay(),
      });
    } else {
      onSave({
        ...shift,
        ...commonData,
        id: shift?.id,
        periodId,
        date,
        locked: lockAssignment,
        location: "Dexa – 5th Ave", // Placeholder
      });
    }
    onOpenChange(false);
  };

  const handleSaveAndDuplicate = () => {
    if (!validateShift() || !onSaveAndDuplicate) return;

    if (templateMode) {
      const templateShift: TemplateShift = {
        tempId: uuid.v4() as string, // Always generate new tempId for duplicate
        employeeId: shift?.employeeId || null,
        dayOfWeek:
          dayOfWeek !== undefined
            ? dayOfWeek
            : shift?.dayOfWeek !== undefined
              ? shift.dayOfWeek
              : parseISO(startTime).getUTCDay(), // Use getUTCDay
        role,
        startTime,
        endTime,
        notes,
        breakMinutes,
        expectedPace,
        staffingLevel,
      };
      onSaveAndDuplicate(templateShift); // Pass TemplateShift data
    } else {
      onSaveAndDuplicate({
        employeeId: shift?.employeeId,
        periodId,
        role,
        date,
        startTime: startTime,
        endTime: endTime,
        managerNote: notes,
        locked: lockAssignment,
        location: "Dexa – 5th Ave", //Update it once location logic is made
        breakMinutes,
        expectedPace,
        staffingLevel,
      });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[950px] bg-panel border-border rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-white">
            {templateMode
              ? shift?.tempId
                ? "Edit Template Shift"
                : "Create Template Shift"
              : shift?.id
                ? "Edit Shift"
                : "Create Shift"}
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
                    color={colors.danger}
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
                <SelectTrigger className="bg-screen">
                  <SelectValue
                    placeholder="Select a role..."
                    className="text-white"
                  />
                </SelectTrigger>
                <SelectContent className="bg-screen border-border">
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

            {!templateMode && (
              <View className="gap-y-2 mb-2">
                <Text className="text-gray-300 font-semibold">Date</Text>
                {enableDateChange ? (
                  <TouchableOpacity
                    onPress={() => datePickerSheetRef.current?.expand()}
                    className="p-4 h-14 bg-screen border border-border rounded-lg flex-row justify-between items-center"
                  >
                    <Text className="text-white text-base">
                      {date
                        ? format(
                            parse(date, "yyyy-MM-dd", new Date()),
                            "EEEE, MMMM d"
                          )
                        : "No Date"}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View className="p-4 h-14 bg-screen border border-border rounded-lg flex-row justify-between items-center">
                    <Text className="text-white text-base">
                      {date
                        ? format(
                            parse(date, "yyyy-MM-dd", new Date()),
                            "EEEE, MMMM d"
                          )
                        : "No Date"}
                    </Text>
                  </View>
                )}
              </View>
            )}

            <View className="flex-row gap-4 mb-2">
              <View className="flex-1 gap-y-2">
                <Text className="text-gray-300 font-semibold">
                  Start Time *
                </Text>
                <TouchableOpacity
                  onPress={() => startTimeSheetRef.current?.expand()}
                  className="p-4 h-14 bg-screen border border-border rounded-lg justify-center"
                >
                  <Text className="text-white text-base">
                    {formatTo12Hour(startTime)}
                  </Text>
                </TouchableOpacity>
              </View>
              <View className="flex-1 gap-y-2">
                <Text className="text-gray-300 font-semibold">End Time *</Text>
                <TouchableOpacity
                  onPress={() => endTimeSheetRef.current?.expand()}
                  className="p-4 h-14 bg-screen border border-border rounded-lg justify-center"
                >
                  <Text className="text-white text-base">
                    {formatTo12Hour(endTime)}
                  </Text>
                </TouchableOpacity>
                {durationError && (
                  <Text className="text-red-400 text-xs mt-1">
                    {durationError}
                  </Text>
                )}
              </View>
            </View>

            <View className="gap-y-2 mb-2">
              <Text className="text-gray-300 font-semibold">Break Minutes</Text>
              <TextInput
                value={String(breakMinutes)}
                onChangeText={(text) => setBreakMinutes(Number(text))}
                keyboardType="numeric"
                className="p-3 bg-screen border border-border rounded-lg text-white text-base"
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
                <SelectTrigger className="bg-screen">
                  <SelectValue
                    placeholder="Select a pace..."
                    className="text-white"
                  />
                </SelectTrigger>
                <SelectContent className="bg-screen border-border">
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
                <SelectTrigger className="bg-screen">
                  <SelectValue
                    placeholder="Select a staffing level..."
                    className="text-white"
                  />
                </SelectTrigger>
                <SelectContent className="bg-screen border-border">
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
                placeholderTextColor={colors.muted}
                multiline
                className="p-3 bg-screen border border-border rounded-lg text-white min-h-[80px]"
              />
            </View>

            {!templateMode && ( // Hide these fields in template mode
              <View className="gap-y-1 pt-2 mb-6">
                <View className="flex-row items-center justify-between py-2">
                  <Label htmlFor="lock" className="text-sm text-white flex-1">
                    Lock assignment (prevent changes)
                  </Label>
                  <Switch
                    trackColor={switchTrackColors}
                    thumbColor={"#f4f4f5"}
                    ios_backgroundColor={switchTrackColors.false}
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
                    trackColor={switchTrackColors}
                    thumbColor={"#f4f4f5"}
                    ios_backgroundColor={switchTrackColors.false}
                    onValueChange={setAllowOpenClaims}
                    value={allowOpenClaims}
                    id="open-claims"
                  />
                </View>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>

        <DialogFooter className="w-full">
          <View className="flex-row gap-2 justify-end w-full">
            <Button
              variant="outline"
              onPress={() => onOpenChange(false)}
              className="mr-auto"
            >
              <Text className="text-white">Cancel</Text>
            </Button>
            {onSaveAndDuplicate && (
              <Button
                variant="outline"
                onPress={handleSaveAndDuplicate}
                className="gap-2 bg-transparent border-gray-600 flex-row"
              >
                <Copy size={16} color={colors.heading} />
                <Text className="text-white">Save & Duplicate</Text>
              </Button>
            )}
            <Button
              onPress={handleSave}
              className="bg-blue-600 hover:bg-blue-700"
              disabled={!!durationError}
            >
              <Text className="text-white font-semibold">Save Shift</Text>
            </Button>
          </View>
        </DialogFooter>
        <TimePickerBottomSheet
          bottomSheetRef={startTimeSheetRef as RefObject<BottomSheet>}
          initialTime={formatTo12Hour(startTime)}
          onDone={(time) => {
            setStartTime(combineToISO(date, time));
            startTimeSheetRef.current?.close();
          }}
          onClose={() => startTimeSheetRef.current?.close()}
          title="Select Start Time"
        />
        <TimePickerBottomSheet
          bottomSheetRef={endTimeSheetRef as RefObject<BottomSheet>}
          initialTime={formatTo12Hour(endTime)}
          onDone={(time) => {
            setEndTime(combineToISO(date, time));
            endTimeSheetRef.current?.close();
          }}
          onClose={() => endTimeSheetRef.current?.close()}
          title="Select End Time"
        />
        <DatePickerBottomSheet
          bottomSheetRef={datePickerSheetRef as RefObject<BottomSheet>}
          initialDate={date}
          onDone={(newDate) => {
            setDate(newDate);
            // Also update start/end time dates if needed, though they are currently ISO strings
            // We might strictly only need 'date' updated for the save handler to pick it up?
            // Yes, handleSave uses 'date'.
            // However, we should also update the component state if start/end time rely on 'date'
            // but combineToISO uses the 'date' param explicitly.
            // Let's ensure start/end times reflect the NEW date.
            if (startTime) {
              const timePart = formatTo12Hour(startTime);
              setStartTime(combineToISO(newDate, timePart));
            }
            if (endTime) {
              const timePart = formatTo12Hour(endTime);
              setEndTime(combineToISO(newDate, timePart));
            }
            datePickerSheetRef.current?.close();
          }}
          onClose={() => datePickerSheetRef.current?.close()}
          title="Select Date"
        />
      </DialogContent>
    </Dialog>
  );
}

export default ShiftEditorModal;
