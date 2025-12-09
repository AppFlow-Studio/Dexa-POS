import { images } from "@/lib/image";
import { usePathname, useRouter } from "expo-router";
import {
  Banknote,
  BarChart2,
  Calendar,
  ClipboardList,
  CreditCard,
  FileText,
  Globe,
  LayoutGrid,
  MapPin,
  Printer,
  Settings,
  Smartphone,
  Truck,
  Users,
} from "lucide-react-native";
import React from "react";
import { Image, ScrollView, Text, TouchableOpacity, View } from "react-native";

interface SidebarItem {
  id: string;
  label: string;
  icon: React.ElementType; // Changed from React.ReactNode to React.ElementType for cleaner rendering
  route: string;
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  {
    id: "payment-processing",
    label: "Payment Processing",
    icon: CreditCard,
    route: "/settings/payment-processing",
  },
  {
    id: "printers-kitchen",
    label: "Printers & Kitchen",
    icon: Printer,
    route: "/settings/printers-kitchen",
  },
  {
    id: "general",
    label: "General Settings",
    icon: Settings,
    route: "/settings/general",
  },
  {
    id: "staff-permissions",
    label: "Staff & Permissions",
    icon: Users,
    route: "/settings/staff-permissions",
  },
  {
    id: "terminal",
    label: "Terminal Management",
    icon: Smartphone,
    route: "/settings/terminal",
  },
  {
    id: "payment-systems",
    label: "Payment Systems",
    icon: Banknote,
    route: "/settings/payment-systems",
  },
  {
    id: "multi-location",
    label: "Multi-Location",
    icon: MapPin,
    route: "/settings/multi-location",
  },
  {
    id: "staff-scheduling",
    label: "Staff & Scheduling",
    icon: Calendar,
    route: "/settings/staff-scheduling",
  },
  {
    id: "online-ordering",
    label: "Online Ordering",
    icon: Globe,
    route: "/settings/online-ordering",
  },
  {
    id: "delivery",
    label: "Delivery Management",
    icon: Truck,
    route: "/settings/delivery",
  },
  {
    id: "dining-room",
    label: "Dining Room",
    icon: LayoutGrid,
    route: "/settings/dining-room",
  },
  {
    id: "waitlist",
    label: "Waitlist & Reservations",
    icon: ClipboardList,
    route: "/settings/waitlist",
  },
  {
    id: "analytics",
    label: "Real-Time Analytics",
    icon: BarChart2,
    route: "/settings/analytics",
  },
  {
    id: "financial",
    label: "Financial Reports",
    icon: FileText,
    route: "/settings/financial",
  },
];

const SidebarNavigation = () => {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <View className="w-80 h-full bg-[#1e1e1e] border-r border-gray-800 flex flex-col">
      {/* Header */}
      <View className="p-6 border-b border-gray-800">
        <View className="flex-row items-center gap-3">
          <View className="w-10 h-10 rounded-lg overflow-hidden items-center justify-center bg-transparent">
            <Image
              source={images.dexalogo}
              className="w-full h-full"
              resizeMode="contain"
            />
          </View>
          <View>
            <Text className="text-lg font-bold text-white">DEXA POS</Text>
            <Text className="text-sm text-gray-400">Settings</Text>
          </View>
        </View>
      </View>

      {/* Navigation Items */}
      <ScrollView className="flex-1 py-4" showsVerticalScrollIndicator={false}>
        <View className="px-3 gap-1 mb-4">
          {SIDEBAR_ITEMS.map((item) => {
            const isActive = pathname.startsWith(item.route);
            const Icon = item.icon;

            return (
              <TouchableOpacity
                key={item.id}
                onPress={() => router.push(item.route as any)}
                className={`flex-row items-center p-3 rounded-lg ${
                  isActive ? "bg-blue-600/10" : "transparent"
                }`}
              >
                {/* Active Indicator Bar */}
                {isActive && (
                  <View className="absolute left-0 top-2 bottom-2 w-1 bg-blue-600 rounded-r-full" />
                )}

                <View className="ml-2 mr-3">
                  <Icon
                    size={22}
                    color={isActive ? "#3b82f6" : "#9ca3af"} // blue-500 : gray-400
                    strokeWidth={isActive ? 2.5 : 2}
                  />
                </View>
                <Text
                  className={`text-base font-medium ${
                    isActive ? "text-blue-500" : "text-gray-400"
                  }`}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Footer */}
      <View className="p-6 border-t border-gray-800 bg-[#1e1e1e]">
        <View className="bg-gray-800/50 rounded-lg p-3">
          <Text className="text-xs text-gray-400 text-center">
            Version 2.4.1
          </Text>
          <Text className="text-xs text-gray-500 text-center mt-1">
            © 2025 DEXA Systems
          </Text>
        </View>
      </View>
    </View>
  );
};

export default SidebarNavigation;
