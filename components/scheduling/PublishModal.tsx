import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Mail,
  MessageSquare,
  Send,
} from "lucide-react-native";
import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";

interface PublishModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPublish: (notificationSettings: NotificationSettings) => void;
  summary: {
    assignedShifts: number;
    openShifts: number;
    conflicts: Array<{ type: string; description: string }>;
  };
}

interface NotificationSettings {
  push: boolean;
  sms: boolean;
  email: boolean;
}

export function PublishModal({
  open,
  onOpenChange,
  onPublish,
  summary,
}: PublishModalProps) {
  const [notifications, setNotifications] = useState<NotificationSettings>({
    push: true,
    sms: false,
    email: true,
  });

  const handlePublish = () => {
    onPublish(notifications);
    onOpenChange(false);
  };

  const hasConflicts = summary.conflicts.length > 0;

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
                  {summary.conflicts.length}
                </Text>
              </Badge>
            </View>
          </View>

          {/* Conflicts */}
          {hasConflicts && (
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
                {summary.conflicts.map((conflict, i) => (
                  <View key={i} className="flex-row items-start gap-2 mb-2">
                    <Badge className="text-xs bg-red-500/20 text-red-400 border-red-500/30">
                      <Text className="text-xs text-red-400">
                        {conflict.type}
                      </Text>
                    </Badge>
                    <Text className="text-sm text-gray-400 flex-1">
                      {conflict.description}
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

          {/* Warning/Success Message */}
          {hasConflicts ? (
            <View className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 flex-row items-start gap-2">
              <AlertCircle
                size={16}
                className="text-yellow-400 mt-1"
                color={"#facc15"}
              />
              <Text className="text-sm text-yellow-300 flex-1">
                Publishing with conflicts may cause scheduling issues. Review
                and resolve conflicts before publishing.
              </Text>
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
        </View>

        <DialogFooter className="gap-2">
          <Button variant="outline" onPress={() => onOpenChange(false)}>
            <Text className="text-white">Cancel</Text>
          </Button>
          <Button
            onPress={handlePublish}
            className="gap-2 bg-blue-600 hover:bg-blue-700 flex-row"
          >
            <Send size={16} color="#FFFFFF" />
            <Text className="text-white font-semibold">Publish Schedule</Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PublishModal;
