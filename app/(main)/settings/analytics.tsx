import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Bell,
  LayoutDashboard,
  Mail,
  MessageSquare,
  Smartphone,
} from "lucide-react-native";
import { colors } from "@/lib/theme";
import React, { useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const AnalyticsScreen = () => {
  const insets = useSafeAreaInsets();

  // Dashboard Settings
  const [enableDashboard, setEnableDashboard] = useState(true);
  const [widgets, setWidgets] = useState({
    salesToday: true,
    ordersInProgress: true,
    laborCost: true,
    topSelling: true,
    customerCount: true,
    avgTicket: true,
    kitchenLoad: true,
  });

  // Alert Settings
  const [salesGoal, setSalesGoal] = useState("5000");
  const [laborCostThreshold, setLaborCostThreshold] = useState("30");
  const [alertTriggers, setAlertTriggers] = useState({
    kitchenBackedUp: true,
    inventoryLow: true,
  });
  const [deliveryMethods, setDeliveryMethods] = useState({
    push: true,
    sms: false,
    email: true,
  });

  const toggleWidget = (key: keyof typeof widgets) => {
    setWidgets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleAlertTrigger = (key: keyof typeof alertTriggers) => {
    setAlertTriggers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleDeliveryMethod = (key: keyof typeof deliveryMethods) => {
    setDeliveryMethods((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen, padding: 20 }}>
      {/* Header */}
      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontSize: 15, fontWeight: "700", color: colors.heading }}>
          Real-Time Analytics
        </Text>
        <Text style={{ fontSize: 12, color: colors.label, marginTop: 2 }}>
          Configure dashboards and real-time alerts.
        </Text>
      </View>

      <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 16 }} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20, gap: 12 }}
      >
        {/* ── Live Dashboard Configuration ── */}
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: "hidden",
          }}
        >
          {/* Card header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                backgroundColor: colors.teal + "15",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <LayoutDashboard size={16} color={colors.teal} />
            </View>
            <Text
              style={{
                fontSize: 13,
                fontWeight: "700",
                color: colors.heading,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Live Dashboard
            </Text>
          </View>

          <View style={{ padding: 14, gap: 14 }}>
            {/* Enable Dashboard Toggle */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: 4,
              }}
            >
              <Text style={{ fontSize: 13, color: colors.heading, fontWeight: "500" }}>
                Enable Dashboard
              </Text>
              <Switch checked={enableDashboard} onCheckedChange={setEnableDashboard} />
            </View>

            {enableDashboard && (
              <>
                {/* Widget Configurator */}
                <View style={{ gap: 4 }}>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "700",
                      color: colors.label,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      marginBottom: 6,
                    }}
                  >
                    Visible Widgets
                  </Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {[
                      { key: "salesToday", label: "Sales Today" },
                      { key: "ordersInProgress", label: "Orders in Progress" },
                      { key: "laborCost", label: "Labor Cost %" },
                      { key: "topSelling", label: "Top Selling Items" },
                      { key: "customerCount", label: "Customer Count" },
                      { key: "avgTicket", label: "Avg Ticket Size" },
                      { key: "kitchenLoad", label: "Kitchen Load" },
                    ].map((widget) => {
                      const checked = widgets[widget.key as keyof typeof widgets];
                      return (
                        <TouchableOpacity
                          key={widget.key}
                          onPress={() => toggleWidget(widget.key as keyof typeof widgets)}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 6,
                            paddingHorizontal: 10,
                            paddingVertical: 7,
                            backgroundColor: checked ? colors.teal + "15" : colors.card,
                            borderWidth: 1,
                            borderColor: checked ? colors.teal + "50" : colors.border,
                            borderRadius: 8,
                          }}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() =>
                              toggleWidget(widget.key as keyof typeof widgets)
                            }
                          />
                          <Text
                            style={{
                              fontSize: 12,
                              color: checked ? colors.teal : colors.label,
                              fontWeight: checked ? "600" : "400",
                            }}
                          >
                            {widget.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Customize Layout Button */}
                <TouchableOpacity
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderStyle: "dashed",
                    borderColor: colors.border,
                    paddingVertical: 10,
                    borderRadius: 8,
                  }}
                >
                  <Text style={{ fontSize: 12, color: colors.label, fontWeight: "500" }}>
                    Customize Dashboard Layout
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* ── Real-Time Alerts Configuration ── */}
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: "hidden",
          }}
        >
          {/* Card header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                backgroundColor: colors.warning + "15",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Bell size={16} color={colors.warning} />
            </View>
            <Text
              style={{
                fontSize: 13,
                fontWeight: "700",
                color: colors.heading,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Real-Time Alerts
            </Text>
          </View>

          <View style={{ padding: 14, gap: 14 }}>
            {/* Alert Triggers section label */}
            <Text
              style={{
                fontSize: 11,
                fontWeight: "700",
                color: colors.label,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Alert Triggers
            </Text>

            {/* Sales Goal Input */}
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, color: colors.label }}>Daily Sales Goal ($)</Text>
              <Input
                style={{
                  backgroundColor: colors.screen,
                  borderColor: colors.border,
                  color: colors.heading,
                  height: 40,
                  fontSize: 13,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                }}
                placeholder="e.g. 5000"
                placeholderTextColor={colors.muted}
                keyboardType="numeric"
                value={salesGoal}
                onChangeText={setSalesGoal}
              />
            </View>

            {/* Labor Cost Threshold Input */}
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, color: colors.label }}>Labor Cost Threshold (%)</Text>
              <Input
                style={{
                  backgroundColor: colors.screen,
                  borderColor: colors.border,
                  color: colors.heading,
                  height: 40,
                  fontSize: 13,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                }}
                placeholder="e.g. 30"
                placeholderTextColor={colors.muted}
                keyboardType="numeric"
                value={laborCostThreshold}
                onChangeText={setLaborCostThreshold}
              />
            </View>

            {/* Kitchen Backed Up Switch */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: 6,
                borderTopWidth: 1,
                borderTopColor: colors.border,
              }}
            >
              <Text style={{ fontSize: 13, color: colors.heading }}>Kitchen Backed Up</Text>
              <Switch
                checked={alertTriggers.kitchenBackedUp}
                onCheckedChange={() => toggleAlertTrigger("kitchenBackedUp")}
              />
            </View>

            {/* Inventory Low Switch */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: 6,
                borderTopWidth: 1,
                borderTopColor: colors.border,
              }}
            >
              <Text style={{ fontSize: 13, color: colors.heading }}>Inventory Low</Text>
              <Switch
                checked={alertTriggers.inventoryLow}
                onCheckedChange={() => toggleAlertTrigger("inventoryLow")}
              />
            </View>

            <View style={{ height: 1, backgroundColor: colors.border }} />

            {/* Notification Channels */}
            <Text
              style={{
                fontSize: 11,
                fontWeight: "700",
                color: colors.label,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Notification Channels
            </Text>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: 6,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Smartphone size={14} color={colors.label} />
                <Text style={{ fontSize: 13, color: colors.heading }}>Push Notifications</Text>
              </View>
              <Switch
                checked={deliveryMethods.push}
                onCheckedChange={() => toggleDeliveryMethod("push")}
              />
            </View>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: 6,
                borderTopWidth: 1,
                borderTopColor: colors.border,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <MessageSquare size={14} color={colors.label} />
                <Text style={{ fontSize: 13, color: colors.heading }}>SMS</Text>
              </View>
              <Switch
                checked={deliveryMethods.sms}
                onCheckedChange={() => toggleDeliveryMethod("sms")}
              />
            </View>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: 6,
                borderTopWidth: 1,
                borderTopColor: colors.border,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Mail size={14} color={colors.label} />
                <Text style={{ fontSize: 13, color: colors.heading }}>Email</Text>
              </View>
              <Switch
                checked={deliveryMethods.email}
                onCheckedChange={() => toggleDeliveryMethod("email")}
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

export default AnalyticsScreen;
