import PinDisplay from "@/components/auth/PinDisplay";
import PinNumpad from "@/components/auth/PinNumpad";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMenuStore } from "@/stores/useMenuStore";
import { useRouter } from "expo-router";
import {
  Lock,
  Palette,
  Printer,
  Settings,
  Store,
  Wrench,
} from "lucide-react-native";
import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface SettingsCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
  isLocked?: boolean;
  onLockPress?: () => void;
}

const SettingsCard: React.FC<SettingsCardProps> = ({
  icon,
  title,
  subtitle,
  onPress,
  isLocked = false,
  onLockPress,
}) => {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="w-full h-full rounded-2xl border border-gray-600 p-6 bg-[#303030]"
    >
      <View className="justify-center h-full w-full flex">
        <View className="flex-row justify-center items-center w-full h-full relative">
          <View className=" w-full h-full flex items-center justify-center">
            <View className="mb-3">{icon}</View>
            <Text className="text-3xl font-bold text-white mb-1 text-center">
              {title}
            </Text>
            <Text className="text-xl text-gray-300 text-center">
              {subtitle}
            </Text>
          </View>
          {isLocked && (
            <TouchableOpacity
              onPress={onLockPress}
              className="p-3 bg-gray-600 rounded-lg absolute top-0 right-0"
            >
              <Lock color="#9CA3AF" size={24} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const SettingsScreen: React.FC = () => {
  const router = useRouter();
  const { isMenuSchedulingEnabled, setMenuSchedulingEnabled } = useMenuStore();
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [targetRoute, setTargetRoute] = useState<string | null>(null);

  const handleLockedAccess = (route: string) => {
    setTargetRoute(route);
    setPinDialogOpen(true);
    setCurrentPin("");
  };

  const handlePinSubmit = () => {
    // TODO: Implement actual PIN validation logic
    // For now, we'll accept any 4-digit PIN
    if (currentPin.length === 4) {
      setPinDialogOpen(false);
      if (targetRoute) {
        router.push(targetRoute as any);
      }
      setCurrentPin("");
      setTargetRoute(null);
    }
  };

  const settingsCategories = [
    {
      id: "basic",
      icon: <Settings color="#3b82f6" size={48} />,
      title: "Basic",
      subtitle: "Store Info & Profile",
      route: "/settings/basic/store-info",
      isLocked: false,
    },
    {
      id: "appearance",
      icon: <Palette color="#3b82f6" size={48} />,
      title: "Appearance & Security",
      subtitle: "Themes & Login",
      route: "/settings/appearance-and-security/security-and-login",
      isLocked: false,
    },
    {
      id: "hardware",
      icon: <Printer color="#3b82f6" size={48} />,
      title: "Hardware & Connection",
      subtitle: "Printers & Displays",
      route: "/settings/hardware-connection/printer",
      isLocked: false,
    },
    {
      id: "store-operation",
      icon: <Store color="#3b82f6" size={48} />,
      title: "Store Operation",
      subtitle: "End of Day & Receipts",
      route: "/settings/store-operation/end-of-day",
      isLocked: true,
    },
    {
      id: "system-support",
      icon: <Wrench color="#3b82f6" size={48} />,
      title: "System & Support",
      subtitle: "Device & Reset",
      route: "/settings/system-and-support/device-and-support",
      isLocked: false,
    },
  ];

  return (
    <View className="flex-1 p-4 bg-[#212121]">
      <View className="mb-4 bg-[#303030] border border-gray-600 rounded-2xl p-3">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-xl font-semibold text-white">
              Menu Scheduling
            </Text>
            <Text className="text-base text-gray-300">
              Time-based visibility for menus
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setMenuSchedulingEnabled(!isMenuSchedulingEnabled)}
            className={`px-3 py-2 rounded-lg border ${
              isMenuSchedulingEnabled
                ? "bg-green-900/30 border-green-500"
                : "bg-red-900/30 border-red-500"
            }`}
          >
            <Text
              className={`text-lg ${
                isMenuSchedulingEnabled ? "text-green-400" : "text-red-400"
              }`}
            >
              {isMenuSchedulingEnabled ? "Enabled" : "Disabled"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View className="mb-6 h-full w-full justify-center items-center flex">
        <View className="flex-row flex-wrap gap-3 w-full h-full items-center justify-center">
          {settingsCategories.map((category) => (
            <View
              key={category.id}
              className="w-1/3 h-1/4"
              style={{ marginBottom: 12 }}
            >
              <SettingsCard
                icon={category.icon}
                title={category.title}
                subtitle={category.subtitle}
                onPress={() => {
                  if (category.isLocked) {
                    handleLockedAccess(category.route);
                  } else {
                    router.push(category.route as any);
                  }
                }}
                isLocked={category.isLocked}
                onLockPress={() => handleLockedAccess(category.route)}
              />
            </View>
          ))}
        </View>
      </View>

      <Dialog open={pinDialogOpen} onOpenChange={setPinDialogOpen}>
        <DialogContent className="w-fit h-fit bg-[#303030] border-gray-600">
          <DialogHeader>
            <DialogTitle className="text-center text-xl font-semibold text-white">
              Manager Access
            </DialogTitle>
          </DialogHeader>
          <View className="py-3">
            <Text className="text-center text-lg text-gray-300 mb-4">
              Enter PIN to access
            </Text>
            <PinDisplay pinLength={currentPin.length} maxLength={4} />
            <PinNumpad
              onKeyPress={(input) => {
                if (typeof input === "number") {
                  if (currentPin.length < 4) {
                    const newPin = currentPin + input.toString();
                    setCurrentPin(newPin);
                    if (newPin.length === 4) {
                      setTimeout(() => handlePinSubmit(), 100);
                    }
                  }
                } else if (input === "clear") {
                  setCurrentPin("");
                } else if (input === "backspace") {
                  setCurrentPin(currentPin.slice(0, -1));
                }
              }}
            />
            <TouchableOpacity
              onPress={() => {
                setPinDialogOpen(false);
                handlePinSubmit();
              }}
              className="p-3 bg-blue-500 rounded-full w-[80%] self-center mt-4"
            >
              <Text className="text-center text-lg text-white">Enter</Text>
            </TouchableOpacity>
          </View>
        </DialogContent>
      </Dialog>
    </View>
  );
};

export default SettingsScreen;
