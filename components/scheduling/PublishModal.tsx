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
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Mail,
  MessageSquare,
  Send,
} from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";

interface NotificationSettings {
  push: boolean;
  sms: boolean;
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
    sms: false,
    email: true,
  });
  const [conflicts, setConflicts] = useState<
    { employeeName: string; date: string }[]
  >([]);
  const { checkShiftConflicts, publishSchedulePeriod } = useScheduleStore();

  useEffect(() => {
    if (open) {
      const foundConflicts = checkShiftConflicts(scheduleId, scheduleType);
      setConflicts(foundConflicts);
    }
  }, [open, scheduleId, scheduleType, checkShiftConflicts]);

  const handlePublish = () => {
    publishSchedulePeriod(scheduleId);
    onOpenChange(false);
  };

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
          {hasConflicts ? (
            <View className="gap-y-2">
              <View className="flex-row items-center gap-2">
                <AlertCircle
                  size={16}
                  className="text-red-400"
                  color={"#f87171"}
                />
                <Text className="text-sm font-semibold text-white">
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
          ) : (
            <View className="p-3 rounded-lg bg-green-500/10 border border-green-500/30 flex-row items-start gap-2">
              <CheckCircle2
                size={16}
                className="text-green-400 mt-1"
                color={"#4ade80"}
              />
              <Text className="text-sm text-green-300 flex-1">
                Schedule is ready to publish. Employees will be notified based
                on your settings.
              </Text>
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
                  id="sms"
                  checked={notifications.sms}
                  onCheckedChange={(checked) =>
                    setNotifications({ ...notifications, sms: !!checked })
                  }
                />
                <View className="flex-row items-center gap-2">
                  <MessageSquare
                    size={16}
                    className="text-blue-400"
                    color={"#60a5fa"}
                  />
                  <Text className="text-sm text-white">SMS Messages</Text>
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
