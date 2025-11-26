import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Shift, TemplateShift } from "@/lib/types";
import { format, parse } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { Clock, FileText, MapPin, Pencil, Trash2 } from "lucide-react-native";
import React from "react";
import { Text, View } from "react-native";

interface ShiftActionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shift: Partial<Shift & TemplateShift>;
  onEdit: () => void;
  onDelete: () => void;
}

const weekDays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function ShiftActionModal({
  open,
  onOpenChange,
  shift,
  onEdit,
  onDelete,
}: ShiftActionModalProps) {
  if (!shift) return null;

  const title = shift.date
    ? format(parse(shift.date, "yyyy-MM-dd", new Date()), "EEEE, MMMM d")
    : shift.dayOfWeek !== undefined
      ? weekDays[shift.dayOfWeek]
      : "Shift Details";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[450px] bg-[#1C1C1E] border-gray-700 rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-white">{title}</DialogTitle>
        </DialogHeader>

        <View className="py-6 gap-y-4">
          <View className="flex-row items-center gap-x-4">
            <View className="px-3 py-1 bg-gray-700 rounded-full">
              <Text className="text-white font-semibold">{shift.role}</Text>
            </View>
          </View>

          <View className="gap-y-3">
            <View className="flex-row items-center gap-x-3">
              <Clock size={20} color="#9CA3AF" />
              <Text className="text-white text-base">
                {shift.startTime
                  ? formatInTimeZone(shift.startTime, "UTC", "h:mm a")
                  : "N/A"}{" "}
                –{" "}
                {shift.endTime
                  ? formatInTimeZone(shift.endTime, "UTC", "h:mm a")
                  : "N/A"}
              </Text>
            </View>
            {shift.location && (
              <View className="flex-row items-center gap-x-3">
                <MapPin size={20} color="#9CA3AF" />
                <Text className="text-white text-base">{shift.location}</Text>
              </View>
            )}
            {shift.managerNote && (
              <View className="flex-row items-center gap-x-3">
                <FileText size={20} color="#9CA3AF" />
                <Text className="text-white text-base">Manager note</Text>
              </View>
            )}
          </View>
        </View>

        <DialogFooter className="gap-4">
          <Button
            variant="destructive"
            onPress={onDelete}
            className="flex-row gap-2"
          >
            <Trash2 size={16} color="#FFFFFF" />
            <Text className="text-white font-semibold rounded-lg">Delete</Text>
          </Button>
          <Button onPress={onEdit} className="flex-row gap-2 bg-blue-600">
            <Pencil size={16} color="#FFFFFF" />
            <Text className="text-white font-semibold rounded-lg">Edit</Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
