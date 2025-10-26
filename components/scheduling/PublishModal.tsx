import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { useScheduleStore } from "@/stores/useScheduleStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { AlertCircle, Bell, Mail, Send } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";

interface NotificationSettings {
  push: boolean;
  email: boolean;
}

interface PublishModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scheduleId: string;
  scheduleType: "period" | "week";
}

export function PublishModal({
  open,
  onOpenChange,
  scheduleId,
  scheduleType,
}: PublishModalProps) {
  const [notifications, setNotifications] = useState<NotificationSettings>({
    push: true,
    email: true,
  });
  const [conflicts, setConflicts] = useState<
    { employeeName: string; date: string }[]
  >([]);
  const {
    checkShiftConflicts,
    publishSchedule,
    schedulePeriods,
    weeklySchedules,
  } = useScheduleStore();

  const currentSchedule = useMemo(() => {
    const period = schedulePeriods.find((p) => p.id === scheduleId);
    if (period) return period;
    const weekly = weeklySchedules.find((w) => w.id === scheduleId);
    if (weekly) return weekly;
    return null;
  }, [scheduleId, schedulePeriods, weeklySchedules]);

  useEffect(() => {
    if (open && currentSchedule) {
      const foundConflicts = checkShiftConflicts(scheduleId, scheduleType);
      setConflicts(foundConflicts);
    } else {
      setConflicts([]);
    }
  }, [open, scheduleId, scheduleType, checkShiftConflicts, currentSchedule]);

  const handlePublish = () => {
    publishSchedule(scheduleId, scheduleType);
    toast.success("Publish Successful", { position: ToastPosition.BOTTOM });
    onOpenChange(false);
  };

  const summary = useMemo(() => {
    if (!currentSchedule)
      return { assignedShifts: 0, openShifts: 0, conflicts: [] };
    return {
      assignedShifts: currentSchedule.shifts.filter((s) => s.employeeId).length,
      openShifts: currentSchedule.shifts.filter((s) => !s.employeeId).length,
      conflicts: conflicts,
    };
  }, [currentSchedule, conflicts]);

  const hasConflicts = conflicts.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#303030] border-gray-700 w-[550px]">
        <DialogHeader>
          <View className="text-white flex-row items-center gap-2">
            <Send size={20} className="text-blue-400" color={"#60a5fa"} />
            <Text className="text-white font-semibold">Publish Schedule</Text>
          </View>
        </DialogHeader>

        <View className="gap-y-4 py-4">
          {/* Summary */}
          <View className="p-4 rounded-lg bg-[#212121] border border-gray-700 gap-y-3">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm text-gray-400">Assigned Shifts</Text>
              <Badge className="bg-green-500/20 text-green-400">
                <Text className="text-green-400">{summary.assignedShifts}</Text>
              </Badge>
            </View>
            <View className="flex-row items-center justify-between">
              <Text className="text-sm text-gray-400">Open Shifts</Text>
              <Badge
                className={
                  summary.openShifts > 0
                    ? "bg-yellow-500/20 text-yellow-400"
                    : "bg-gray-500/20 text-gray-400"
                }
              >
                <Text
                  className={
                    summary.openShifts > 0 ? "text-yellow-400" : "text-gray-400"
                  }
                >
                  {summary.openShifts}
                </Text>
              </Badge>
            </View>
            <View className="flex-row items-center justify-between">
              <Text className="text-sm text-gray-400">Conflicts</Text>
              <Badge
                className={
                  hasConflicts
                    ? "bg-red-500/20 text-red-400"
                    : "bg-gray-500/20 text-gray-400"
                }
              >
                <Text
                  className={hasConflicts ? "text-red-400" : "text-gray-400"}
                >
                  {conflicts.length}
                </Text>
              </Badge>
            </View>
          </View>

          {hasConflicts && (
            <View className="gap-y-2">
              <View className="flex-row items-center gap-2">
                <AlertCircle
                  size={16}
                  className="text-red-400"
                  color={"#f87171"}
                />
                <Text className="text-sm text-white font-semibold">
                  Conflicts Detected
                </Text>
              </View>
              <ScrollView className="h-24 rounded-lg border border-gray-700 bg-[#212121] p-3">
                {conflicts.map((conflict, i) => (
                  <View key={i} className="flex-row items-start gap-2 mb-2">
                    <Badge className="text-xs bg-red-500/20 text-red-400 border-red-500/30">
                      <Text className="text-xs text-red-400">
                        {conflict.employeeName}
                      </Text>
                    </Badge>
                    <Text className="text-sm text-gray-400 flex-1">
                      has a conflicting shift on {conflict.date}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Notification Settings */}
          <View className="gap-y-3">
            <Text className="text-sm font-semibold text-white">
              Notify Employees
            </Text>
            <View className="gap-y-3 p-4 rounded-lg bg-[#212121] border border-gray-700">
              <View className="flex-row items-center gap-3">
                <Checkbox
                  id="push"
                  checked={notifications.push}
                  onCheckedChange={(checked) =>
                    setNotifications({ ...notifications, push: !!checked })
                  }
                />
                <View className="flex-row items-center gap-2">
                  <Bell size={16} className="text-blue-400" color={"#60a5fa"} />
                  <Text className="text-sm text-white">Push Notifications</Text>
                </View>
              </View>
              <View className="flex-row items-center gap-3">
                <Checkbox
                  id="email"
                  checked={notifications.email}
                  onCheckedChange={(checked) =>
                    setNotifications({ ...notifications, email: !!checked })
                  }
                />
                <View className="flex-row items-center gap-2">
                  <Mail size={16} className="text-blue-400" color={"#60a5fa"} />
                  <Text className="text-sm text-white">Email</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        <DialogFooter className="gap-2">
          <Button variant="outline" onPress={() => onOpenChange(false)}>
            <Text className="text-white">Cancel</Text>
          </Button>
          {hasConflicts ? (
            <Button
              onPress={handlePublish}
              className="gap-2 bg-yellow-600 hover:bg-yellow-700 flex-row"
            >
              <AlertCircle size={16} color="#FFFFFF" />
              <Text className="text-white font-semibold">Publish Anyway</Text>
            </Button>
          ) : (
            <Button
              onPress={handlePublish}
              className="gap-2 bg-blue-600 hover:bg-blue-700 flex-row"
            >
              <Send size={16} color="#FFFFFF" />
              <Text className="text-white font-semibold">Publish Schedule</Text>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PublishModal;
