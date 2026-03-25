import { colors } from "@/lib/theme";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { Check, ChevronDown, ChevronUp, List } from "lucide-react-native";
import React, { useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

const DAY_OPTIONS = [
  { value: 0, label: "Today Only", description: "Only show orders from today" },
  { value: 1, label: "Last 2 Days", description: "Today and yesterday" },
  { value: 2, label: "Last 3 Days", description: "Today and 2 previous days" },
  { value: 6, label: "Last 7 Days", description: "Orders from the past week" },
  { value: 13, label: "Last 14 Days", description: "Orders from the past 2 weeks" },
  { value: 29, label: "Last 30 Days", description: "Orders from the past month" },
];

const OrderLineSettingsScreen = () => {
  const orderLineSettings = useSettingsStore((s) => s.orderLineSettings);
  const setOrderLineSettings = useSettingsStore((s) => s.setOrderLineSettings);

  const [expandedSections, setExpandedSections] = useState({
    visibility: true,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const renderSectionHeader = (
    title: string,
    icon: React.ReactNode,
    section: keyof typeof expandedSections
  ) => (
    <TouchableOpacity
      onPress={() => toggleSection(section)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderBottomWidth: expandedSections[section] ? 1 : 0,
        borderBottomColor: colors.border,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            backgroundColor: colors.teal + "15",
            alignItems: "center",
            justifyContent: "center",
            marginRight: 10,
          }}
        >
          {icon}
        </View>
        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.heading }}>
          {title}
        </Text>
      </View>
      {expandedSections[section] ? (
        <ChevronUp size={16} color={colors.label} />
      ) : (
        <ChevronDown size={16} color={colors.label} />
      )}
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen, padding: 20 }}>
      {/* Page Header */}
      <View style={{ marginBottom: 4 }}>
        <Text style={{ fontSize: 15, fontWeight: "700", color: colors.heading }}>
          Order Line Settings
        </Text>
        <Text style={{ fontSize: 12, color: colors.label, marginTop: 2 }}>
          Configure how orders appear in the order line.
        </Text>
      </View>

      <View
        style={{ height: 1, backgroundColor: colors.border, marginVertical: 14 }}
      />

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Order Visibility */}
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: 14,
            overflow: "hidden",
          }}
        >
          {renderSectionHeader(
            "Order Visibility",
            <List size={16} color={colors.teal} />,
            "visibility"
          )}
          {expandedSections.visibility && (
            <View style={{ padding: 12 }}>
              <Text style={{ fontSize: 12, color: colors.label, marginBottom: 12 }}>
                Choose how many days of orders to display in the order line.
                Older orders will be hidden from the order line but can still be
                found in order history.
              </Text>

              <View style={{ gap: 6 }}>
                {DAY_OPTIONS.map((option) => {
                  const isSelected = orderLineSettings.daysToShow === option.value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      onPress={() =>
                        setOrderLineSettings({ daysToShow: option.value })
                      }
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: 12,
                        borderRadius: 10,
                        borderWidth: 1,
                        backgroundColor: isSelected
                          ? colors.teal + "15"
                          : colors.card,
                        borderColor: isSelected ? colors.teal : colors.border,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: "600",
                            color: isSelected ? colors.teal : colors.heading,
                          }}
                        >
                          {option.label}
                        </Text>
                        <Text
                          style={{
                            fontSize: 12,
                            color: colors.label,
                            marginTop: 2,
                          }}
                        >
                          {option.description}
                        </Text>
                      </View>
                      {isSelected && (
                        <View
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 11,
                            backgroundColor: colors.teal,
                            alignItems: "center",
                            justifyContent: "center",
                            marginLeft: 10,
                          }}
                        >
                          <Check size={13} color="#ffffff" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default OrderLineSettingsScreen;
