import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { colors, spinnerColor } from "@/lib/theme";
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
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="p-6 rounded-2xl bg-panel border border-gray-700 w-[480px]">
        <DialogHeader className="items-center">
          <DialogTitle className="text-2xl font-bold text-white text-center">
            Logout Options
          </DialogTitle>
          <DialogDescription className="text-center text-gray-400 mt-2 text-lg">
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
            className="flex-row items-center p-4 bg-surface border border-gray-600 rounded-xl"
            style={isLoading ? { opacity: 0.5 } : undefined}
          >
            <View className="w-12 h-12 bg-amber-500/20 rounded-full items-center justify-center mr-4">
              <Monitor color={colors.warning} size={24} />
            </View>
            <View className="flex-1">
              <Text className="text-white font-bold text-lg">
                End Station Session
              </Text>
              <Text className="text-gray-400 text-sm">
                Return to station select. Stay signed in to account.
              </Text>
            </View>
          </TouchableOpacity>

          {/* Full Logout Option */}
          <TouchableOpacity
            onPress={onFullLogout}
            disabled={isLoading}
            className="flex-row items-center p-4 bg-surface border border-red-600/50 rounded-xl"
            style={isLoading ? { opacity: 0.5 } : undefined}
          >
            <View className="w-12 h-12 bg-red-500/20 rounded-full items-center justify-center mr-4">
              <LogOut color={colors.danger} size={24} />
            </View>
            <View className="flex-1">
              <Text className="text-white font-bold text-lg">Full Logout</Text>
              <Text className="text-gray-400 text-sm">
                Sign out completely and return to login screen.
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <DialogFooter className="pt-6">
          <TouchableOpacity
            onPress={onClose}
            disabled={isLoading}
            className="w-full py-3 border border-gray-600 rounded-lg bg-screen"
          >
            <Text className="font-bold text-lg text-gray-300 text-center">
              Cancel
            </Text>
          </TouchableOpacity>
        </DialogFooter>

        {isLoading && (
          <View className="absolute inset-0 bg-black/50 items-center justify-center rounded-2xl">
            <ActivityIndicator size="large" color={spinnerColor} />
            <Text className="text-white mt-2">Logging out...</Text>
          </View>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default SessionLogoutModal;
