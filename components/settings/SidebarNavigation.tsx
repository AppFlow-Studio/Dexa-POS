import { colors } from "@/lib/theme";
import { usePathname, useRouter } from "expo-router";
import {
  Banknote,
  BarChart2,
  Calendar,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  CreditCard,
  DollarSign,
  FileText,
  Globe,
  LayoutGrid,
  List,
  MapPin,
  Monitor,
  Printer,
  Receipt,
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
      { id: "printers-kitchen", label: "Printers & Kitchen", icon: Printer, route: "/settings/printers-kitchen" },
      { id: "receipt-templates", label: "Receipt Templates", icon: Receipt, route: "/settings/receipt-templates" },
      { id: "payment-systems", label: "Payment Systems", icon: Banknote, route: "/settings/payment-systems" },
      { id: "cash-management", label: "Cash Management", icon: DollarSign, route: "/settings/cash-management" },
      { id: "dining-room", label: "Dining Room", icon: LayoutGrid, route: "/settings/dining-room" },
      { id: "stations-devices", label: "Stations & Devices", icon: Monitor, route: "/settings/stations-devices" },
      { id: "order-line", label: "Order Line", icon: List, route: "/settings/order-line" },
    ],
  },
  {
    id: "business",
    title: "Business Management",
    items: [
      { id: "general", label: "General Settings", icon: Settings, route: "/settings/general" },
      { id: "payment-processing", label: "Payment Processing", icon: CreditCard, route: "/settings/payment-processing" },
    ],
  },
  {
    id: "customer",
    title: "Customer Experience",
    items: [
      { id: "online-ordering", label: "Online Ordering", icon: Globe, route: "/settings/online-ordering" },
      { id: "delivery", label: "Delivery Management", icon: Truck, route: "/settings/delivery" },
    ],
  },
];

const SidebarNavigation = () => {
  const router = useRouter();
  const pathname = usePathname();

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
    const activeSection = SETTINGS_SECTIONS.find((section) =>
      section.items.some((item) => pathname.startsWith(item.route))
    );
    return activeSection ? { [activeSection.id]: true } : {};
  });

  useEffect(() => {
    const activeSection = SETTINGS_SECTIONS.find((section) =>
      section.items.some((item) => pathname.startsWith(item.route))
    );
    if (activeSection && !expandedSections[activeSection.id]) {
      setExpandedSections((prev) => ({ ...prev, [activeSection.id]: true }));
    }
  }, [pathname]);

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  return (
    <View style={{ width: 220, height: "100%", backgroundColor: colors.panel, borderRightWidth: 1, borderRightColor: colors.border, flexDirection: "column", paddingTop: 12 }}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: 10, paddingBottom: 16 }}>
          {SETTINGS_SECTIONS.map((section) => {
            const isExpanded = expandedSections[section.id];
            const hasActiveChild = section.items.some((item) => pathname.startsWith(item.route));

            return (
              <View key={section.id} style={{ marginBottom: 4 }}>
                {/* Section header */}
                <TouchableOpacity
                  onPress={() => toggleSection(section.id)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                    borderRadius: 8,
                    backgroundColor: hasActiveChild ? colors.teal + "08" : "transparent",
                  }}
                >
                  <Text style={{
                    fontSize: 10,
                    fontWeight: "600",
                    color: hasActiveChild ? colors.teal : colors.muted,
                    textTransform: "uppercase",
                    letterSpacing: 0.8,
                  }}>
                    {section.title}
                  </Text>
                  {isExpanded
                    ? <ChevronDown size={13} color={hasActiveChild ? colors.teal : colors.muted} />
                    : <ChevronRight size={13} color={hasActiveChild ? colors.teal : colors.muted} />
                  }
                </TouchableOpacity>

                {/* Items */}
                {isExpanded && (
                  <View style={{ marginTop: 2 }}>
                    {section.items.map((item) => {
                      const isActive = pathname.startsWith(item.route);
                      const Icon = item.icon;

                      return (
                        <TouchableOpacity
                          key={item.id}
                          onPress={() => router.push(item.route as any)}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            paddingHorizontal: 10,
                            paddingVertical: 8,
                            borderRadius: 8,
                            marginBottom: 1,
                            backgroundColor: isActive ? colors.teal + "15" : "transparent",
                          }}
                        >
                          {/* Active left bar */}
                          {isActive && (
                            <View style={{
                              position: "absolute",
                              left: 0,
                              top: 6,
                              bottom: 6,
                              width: 2,
                              backgroundColor: colors.teal,
                              borderRadius: 2,
                            }} />
                          )}

                          <View style={{
                            width: 28,
                            height: 28,
                            borderRadius: 7,
                            backgroundColor: isActive ? colors.teal + "20" : colors.card,
                            alignItems: "center",
                            justifyContent: "center",
                            marginRight: 9,
                          }}>
                            <Icon
                              size={14}
                              color={isActive ? colors.teal : colors.label}
                              strokeWidth={isActive ? 2.5 : 2}
                            />
                          </View>

                          <Text style={{
                            fontSize: 12,
                            fontWeight: isActive ? "600" : "400",
                            color: isActive ? colors.teal : colors.label,
                            flex: 1,
                          }}>
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
      <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
        <View style={{ backgroundColor: colors.card, borderRadius: 8, padding: 10, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ fontSize: 11, color: colors.muted, textAlign: "center" }}>Version 2.4.1</Text>
          <Text style={{ fontSize: 10, color: colors.muted, textAlign: "center", marginTop: 2, opacity: 0.7 }}>© 2025 DEXA Systems</Text>
        </View>
      </View>
    </View>
  );
};

export default SidebarNavigation;
