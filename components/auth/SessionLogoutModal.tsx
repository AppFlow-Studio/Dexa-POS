import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { colors, spinnerColor } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { LogOut, Monitor } from "lucide-react-native";
import React from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";

interface SessionLogoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEndStationSession: () => void;
  onFullLogout: () => void;
  isLoading: boolean;
  stationName?: string;
}

const SessionLogoutModal: React.FC<SessionLogoutModalProps> = ({
  isOpen,
  onClose,
  onEndStationSession,
  onFullLogout,
  isLoading,
  stationName,
}) => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="p-6 rounded-2xl"
        style={{
          width: s(480),
          backgroundColor: colors.panel,
          borderColor: colors.border,
        }}
      >
        <DialogHeader className="items-center">
          <DialogTitle
            className="text-2xl font-bold text-center"
            style={{ color: colors.heading }}
          >
            Logout Options
          </DialogTitle>
          <DialogDescription
            className="text-center mt-2 text-lg"
            style={{ color: colors.label }}
          >
            {stationName
              ? `Currently on ${stationName}. Choose how to log out:`
              : "Choose how to log out:"}
          </DialogDescription>
        </DialogHeader>

        <View className="gap-4 mt-6">
          {/* End Station Session Option */}
          <TouchableOpacity
            onPress={onEndStationSession}
            disabled={isLoading}
            className="flex-row items-center p-4 rounded-xl"
            style={{
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
              opacity: isLoading ? 0.5 : 1,
            }}
          >
            <View
              className="w-12 h-12 rounded-full items-center justify-center mr-4"
              style={{ backgroundColor: colors.warning + "20" }}
            >
              <Monitor color={colors.warning} size={s(24)} />
            </View>
            <View className="flex-1">
              <Text
                className="font-bold text-lg"
                style={{ color: colors.heading }}
              >
                End Station Session
              </Text>
              <Text className="text-sm" style={{ color: colors.label }}>
                Return to station select. Stay signed in to account.
              </Text>
            </View>
          </TouchableOpacity>

          {/* Full Logout Option */}
          <TouchableOpacity
            onPress={onFullLogout}
            disabled={isLoading}
            className="flex-row items-center p-4 rounded-xl"
            style={{
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.danger + "35",
              opacity: isLoading ? 0.5 : 1,
            }}
          >
            <View
              className="w-12 h-12 rounded-full items-center justify-center mr-4"
              style={{ backgroundColor: colors.danger + "20" }}
            >
              <LogOut color={colors.danger} size={s(24)} />
            </View>
            <View className="flex-1">
              <Text
                className="font-bold text-lg"
                style={{ color: colors.heading }}
              >
                Full Logout
              </Text>
              <Text className="text-sm" style={{ color: colors.label }}>
                Sign out completely and return to login screen.
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <DialogFooter className="pt-6">
          <TouchableOpacity
            onPress={onClose}
            disabled={isLoading}
            className="w-full py-3 rounded-lg"
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.screen,
              opacity: isLoading ? 0.5 : 1,
            }}
          >
            <Text
              className="font-bold text-lg text-center"
              style={{ color: colors.label }}
            >
              Cancel
            </Text>
          </TouchableOpacity>
        </DialogFooter>

        {isLoading && (
          <View
            className="absolute inset-0 items-center justify-center rounded-2xl"
            style={{ backgroundColor: colors.screen + "CC" }}
          >
            <ActivityIndicator size="large" color={spinnerColor} />
            <Text className="mt-2" style={{ color: colors.heading }}>
              Logging out...
            </Text>
          </View>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default SessionLogoutModal;
