import { usePathname, useRouter } from "expo-router";
import {
  Banknote,
  BarChart2,
  Calendar,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  CreditCard,
  FileText,
  Globe,
  LayoutGrid,
  List,
  MapPin,
  Monitor,
  Printer,
  Settings,
  Smartphone,
  Truck,
  Users,
} from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

interface SidebarItem {
  id: string;
  label: string;
  icon: React.ElementType;
  route: string;
}

interface SidebarSection {
  id: string;
  title: string;
  items: SidebarItem[];
}

const SETTINGS_SECTIONS: SidebarSection[] = [
  {
    id: "operations",
    title: "Operations & Hardware",
    items: [
      {
        id: "printers-kitchen",
        label: "Printers & Kitchen",
        icon: Printer,
        route: "/settings/printers-kitchen",
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
        id: "dining-room",
        label: "Dining Room",
        icon: LayoutGrid,
        route: "/settings/dining-room",
      },
      {
        id: "stations-devices",
        label: "Stations & Devices",
        icon: Monitor,
        route: "/settings/stations-devices",
      },
      {
        id: "order-line",
        label: "Order Line",
        icon: List,
        route: "/settings/order-line",
      },
    ],
  },
  {
    id: "business",
    title: "Business Management",
    items: [
      {
        id: "general",
        label: "General Settings",
        icon: Settings,
        route: "/settings/general",
      },
      {
        id: "multi-location",
        label: "Multi-Location",
        icon: MapPin,
        route: "/settings/multi-location",
      },
      {
        id: "payment-processing",
        label: "Payment Processing",
        icon: CreditCard,
        route: "/settings/payment-processing",
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
    ],
  },
  {
    id: "team",
    title: "Team & Access",
    items: [
      {
        id: "staff-permissions",
        label: "Staff & Permissions",
        icon: Users,
        route: "/settings/staff-permissions",
      },
      {
        id: "staff-scheduling",
        label: "Staff & Scheduling",
        icon: Calendar,
        route: "/settings/staff-scheduling",
      },
    ],
  },
  {
    id: "customer",
    title: "Customer Experience",
    items: [
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
        id: "waitlist",
        label: "Waitlist & Reservations",
        icon: ClipboardList,
        route: "/settings/waitlist",
      },
    ],
  },
];

const SidebarNavigation = () => {
  const router = useRouter();
  const pathname = usePathname();
  // Automatically expand the section that contains the current route on mount
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >(() => {
    const activeSection = SETTINGS_SECTIONS.find((section) =>
      section.items.some((item) => pathname.startsWith(item.route))
    );
    return activeSection ? { [activeSection.id]: true } : {};
  });

  // Keep expanding sections if route changes (optional, but good for deep linking or redirects)
  useEffect(() => {
    const activeSection = SETTINGS_SECTIONS.find((section) =>
      section.items.some((item) => pathname.startsWith(item.route))
    );

    if (activeSection && !expandedSections[activeSection.id]) {
      setExpandedSections((prev) => ({
        ...prev,
        [activeSection.id]: true,
      }));
    }
  }, [pathname]);

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  return (
    <View className="w-80 h-full bg-[#1e1e1e] border-r border-gray-800 flex flex-col pt-4">
      {/* Navigation Items */}
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="px-3 pb-4">
          {SETTINGS_SECTIONS.map((section) => {
            const isExpanded = expandedSections[section.id];
            // Check if any child is active to highlight the section header potentially,
            // or just rely on the open state.
            const hasActiveChild = section.items.some((item) =>
              pathname.startsWith(item.route)
            );

            return (
              <View key={section.id} className="mb-2">
                <TouchableOpacity
                  onPress={() => toggleSection(section.id)}
                  className={`flex-row items-center justify-between p-3 rounded-lg ${
                    hasActiveChild ? "bg-gray-800/30" : "transparent"
                  }`}
                >
                  <Text className="text-gray-400 font-semibold text-sm uppercase tracking-wider">
                    {section.title}
                  </Text>
                  {isExpanded ? (
                    <ChevronUp size={16} color="#9ca3af" />
                  ) : (
                    <ChevronDown size={16} color="#9ca3af" />
                  )}
                </TouchableOpacity>

                {isExpanded && (
                  <View className="mt-1 ml-1">
                    {section.items.map((item) => {
                      const isActive = pathname.startsWith(item.route);
                      const Icon = item.icon;

                      return (
                        <TouchableOpacity
                          key={item.id}
                          onPress={() => router.push(item.route as any)}
                          className={`flex-row items-center p-3 rounded-lg mb-1 ${
                            isActive ? "bg-blue-600/10" : "transparent"
                          }`}
                        >
                          {/* Active Indicator Bar */}
                          {isActive && (
                            <View className="absolute left-0 top-2 bottom-2 w-1 bg-blue-600 rounded-r-full" />
                          )}

                          <View className="ml-2 mr-3">
                            <Icon
                              size={20}
                              color={isActive ? "#3b82f6" : "#9ca3af"}
                              strokeWidth={isActive ? 2.5 : 2}
                            />
                          </View>
                          <Text
                            className={`text-sm font-medium ${
                              isActive ? "text-blue-500" : "text-gray-400"
                            }`}
                          >
                            {item.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
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
