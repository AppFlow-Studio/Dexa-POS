import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { AlertCircle, Copy } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";

interface ShiftEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shift?: Shift | null;
  onSave: (shift: Partial<Shift>) => void;
  onSaveAndDuplicate?: (shift: Partial<Shift>) => void;
}

const roles: Role[] = ["Cashier", "Barista", "Line Cook", "Prep", "Supervisor"];

export function ShiftEditorModal({
  open,
  onOpenChange,
  shift,
  onSave,
  onSaveAndDuplicate,
}: ShiftEditorModalProps) {
  const [role, setRole] = useState<Role>(shift?.role || "Cashier");
  const [startTime, setStartTime] = useState(shift?.startTime || "09:00");
  const [endTime, setEndTime] = useState(shift?.endTime || "17:00");
  const [requiredCount, setRequiredCount] = useState(shift?.requiredCount || 1);
  const [notes, setNotes] = useState(shift?.notes || "");
  const [lockAssignment, setLockAssignment] = useState(false);
  const [allowOpenClaims, setAllowOpenClaims] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (shift) {
      setRole(shift.role);
      setStartTime(shift.startTime);
      setEndTime(shift.endTime);
      setRequiredCount(shift.requiredCount || 1);
      setNotes(shift.notes || "");
      setLockAssignment(shift.locked || false);
    } else {
      // Reset for new shift
      setRole("Cashier");
      setStartTime("09:00");
      setEndTime("17:00");
      setRequiredCount(1);
      setNotes("");
      setLockAssignment(false);
      setAllowOpenClaims(true);
    }
    setErrors([]);
  }, [shift, open]);

  const validateShift = () => {
    const newErrors: string[] = [];
    const [startH, startM] = startTime.split(":").map(Number);
    const [endH, endM] = endTime.split(":").map(Number);
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
      role,
      startTime: startTime,
      endTime: endTime,
      requiredCount,
      notes,
      locked: lockAssignment,
      isOpen: allowOpenClaims && !shift?.employeeId,
    });
    onOpenChange(false);
  };

  const handleSaveAndDuplicate = () => {
    if (!validateShift() || !onSaveAndDuplicate) return;
    onSaveAndDuplicate({
      role,
      startTime: startTime,
      endTime: endTime,
      requiredCount,
      notes,
      locked: lockAssignment,
      isOpen: allowOpenClaims && !shift?.employeeId,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-[#303030] border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-white">
            {shift ? "Edit Shift" : "Create Shift"}
          </DialogTitle>
        </DialogHeader>

        <ScrollView className="py-4 gap-y-4">
          {errors.length > 0 && (
            <View className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
              <View className="flex-row items-start gap-2">
                <AlertCircle size={16} className="text-red-400 mt-1" />
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

          <View className="gap-y-2">
            <Text className="text-gray-300 font-semibold">Role *</Text>
            <Select
              onValueChange={(option) => setRole(option?.value as Role)}
              value={{ label: role, value: role }}
            >
              <SelectTrigger className="bg-[#212121]">
                <SelectValue placeholder="Select a role..." />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r} label={r} value={r} />
                ))}
              </SelectContent>
            </Select>
          </View>

          <View className="flex-row gap-4">
            <View className="flex-1 gap-y-2">
              <Text className="text-gray-300 font-semibold">Start Time *</Text>
              <TextInput
                value={startTime}
                onChangeText={setStartTime}
                className="p-3 bg-[#212121] border border-gray-600 rounded-lg text-white text-base"
              />
            </View>
            <View className="flex-1 gap-y-2">
              <Text className="text-gray-300 font-semibold">End Time *</Text>
              <TextInput
                value={endTime}
                onChangeText={setEndTime}
                className="p-3 bg-[#212121] border border-gray-600 rounded-lg text-white text-base"
              />
            </View>
          </View>

          <View className="gap-y-2">
            <Text className="text-gray-300 font-semibold">
              Required Headcount
            </Text>
            <TextInput
              value={String(requiredCount)}
              onChangeText={(text) => setRequiredCount(Number(text))}
              keyboardType="numeric"
              className="p-3 bg-[#212121] border border-gray-600 rounded-lg text-white text-base"
            />
          </View>

          <View className="gap-y-2">
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

          <View className="gap-y-3 pt-2">
            <View className="flex-row items-center gap-2">
              <Checkbox
                id="lock"
                checked={lockAssignment}
                onCheckedChange={(checked) => setLockAssignment(!!checked)}
              />
              <Label htmlFor="lock" className="text-sm text-white">
                Lock assignment (prevent changes)
              </Label>
            </View>
            <View className="flex-row items-center gap-2">
              <Checkbox
                id="open-claims"
                checked={allowOpenClaims}
                onCheckedChange={(checked) => setAllowOpenClaims(!!checked)}
              />
              <Label htmlFor="open-claims" className="text-sm text-white">
                Allow open shift claims
              </Label>
            </View>
          </View>
        </ScrollView>

        <DialogFooter className="gap-2">
          <Button variant="outline" onPress={() => onOpenChange(false)}>
            <Text className="text-white">Cancel</Text>
          </Button>
          {onSaveAndDuplicate && (
            <Button
              variant="outline"
              onPress={handleSaveAndDuplicate}
              className="gap-2 bg-transparent border-gray-600"
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
