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
import { useUiScale } from "@/lib/uiScale";
import React, { useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const AnalyticsScreen = () => {
  const insets = useSafeAreaInsets();
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);

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
    <View style={{ flex: 1, backgroundColor: colors.screen, padding: s(20) }}>
      {/* Header */}
      <View style={{ marginBottom: s(16) }}>
        <Text style={{ fontSize: s(15), fontWeight: "700", color: colors.heading }}>
          Real-Time Analytics
        </Text>
        <Text style={{ fontSize: s(12), color: colors.label, marginTop: s(2) }}>
          Configure dashboards and real-time alerts.
        </Text>
      </View>

      <View style={{ height: 1, backgroundColor: colors.border, marginBottom: s(16) }} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + s(20), gap: s(12) }}
      >
        {/* ── Live Dashboard Configuration ── */}
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: s(12),
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
              gap: s(10),
              paddingHorizontal: s(14),
              paddingVertical: s(12),
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <View
              style={{
                width: s(32),
                height: s(32),
                borderRadius: s(8),
                backgroundColor: colors.teal + "15",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <LayoutDashboard size={s(16)} color={colors.teal} />
            </View>
            <Text
              style={{
                fontSize: s(13),
                fontWeight: "700",
                color: colors.heading,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Live Dashboard
            </Text>
          </View>

          <View style={{ padding: s(14), gap: s(14) }}>
            {/* Enable Dashboard Toggle */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: s(4),
              }}
            >
              <Text style={{ fontSize: s(13), color: colors.heading, fontWeight: "500" }}>
                Enable Dashboard
              </Text>
              <Switch checked={enableDashboard} onCheckedChange={setEnableDashboard} />
            </View>

            {enableDashboard && (
              <>
                {/* Widget Configurator */}
                <View style={{ gap: s(4) }}>
                  <Text
                    style={{
                      fontSize: s(11),
                      fontWeight: "700",
                      color: colors.label,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      marginBottom: s(6),
                    }}
                  >
                    Visible Widgets
                  </Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s(8) }}>
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
                            gap: s(6),
                            paddingHorizontal: s(10),
                            paddingVertical: s(7),
                            backgroundColor: checked ? colors.teal + "15" : colors.card,
                            borderWidth: 1,
                            borderColor: checked ? colors.teal + "50" : colors.border,
                            borderRadius: s(8),
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
                              fontSize: s(12),
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
                    paddingVertical: s(10),
                    borderRadius: s(8),
                  }}
                >
                  <Text style={{ fontSize: s(12), color: colors.label, fontWeight: "500" }}>
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
            borderRadius: s(12),
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
              gap: s(10),
              paddingHorizontal: s(14),
              paddingVertical: s(12),
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <View
              style={{
                width: s(32),
                height: s(32),
                borderRadius: s(8),
                backgroundColor: colors.warning + "15",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Bell size={s(16)} color={colors.warning} />
            </View>
            <Text
              style={{
                fontSize: s(13),
                fontWeight: "700",
                color: colors.heading,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Real-Time Alerts
            </Text>
          </View>

          <View style={{ padding: s(14), gap: s(14) }}>
            {/* Alert Triggers section label */}
            <Text
              style={{
                fontSize: s(11),
                fontWeight: "700",
                color: colors.label,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Alert Triggers
            </Text>

            {/* Sales Goal Input */}
            <View style={{ gap: s(6) }}>
              <Text style={{ fontSize: s(12), color: colors.label }}>Daily Sales Goal ($)</Text>
              <Input
                style={{
                  backgroundColor: colors.screen,
                  borderColor: colors.border,
                  color: colors.heading,
                  height: s(40),
                  fontSize: s(13),
                  borderRadius: s(8),
                  paddingHorizontal: s(12),
                }}
                placeholder="e.g. 5000"
                placeholderTextColor={colors.muted}
                keyboardType="numeric"
                value={salesGoal}
                onChangeText={setSalesGoal}
              />
            </View>

            {/* Labor Cost Threshold Input */}
            <View style={{ gap: s(6) }}>
              <Text style={{ fontSize: s(12), color: colors.label }}>Labor Cost Threshold (%)</Text>
              <Input
                style={{
                  backgroundColor: colors.screen,
                  borderColor: colors.border,
                  color: colors.heading,
                  height: s(40),
                  fontSize: s(13),
                  borderRadius: s(8),
                  paddingHorizontal: s(12),
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
                paddingVertical: s(6),
                borderTopWidth: 1,
                borderTopColor: colors.border,
              }}
            >
              <Text style={{ fontSize: s(13), color: colors.heading }}>Kitchen Backed Up</Text>
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
                paddingVertical: s(6),
                borderTopWidth: 1,
                borderTopColor: colors.border,
              }}
            >
              <Text style={{ fontSize: s(13), color: colors.heading }}>Inventory Low</Text>
              <Switch
                checked={alertTriggers.inventoryLow}
                onCheckedChange={() => toggleAlertTrigger("inventoryLow")}
              />
            </View>

            <View style={{ height: 1, backgroundColor: colors.border }} />

            {/* Notification Channels */}
            <Text
              style={{
                fontSize: s(11),
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
                paddingVertical: s(6),
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: s(8) }}>
                <Smartphone size={s(14)} color={colors.label} />
                <Text style={{ fontSize: s(13), color: colors.heading }}>Push Notifications</Text>
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
                paddingVertical: s(6),
                borderTopWidth: 1,
                borderTopColor: colors.border,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: s(8) }}>
                <MessageSquare size={s(14)} color={colors.label} />
                <Text style={{ fontSize: s(13), color: colors.heading }}>SMS</Text>
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
                paddingVertical: s(6),
                borderTopWidth: 1,
                borderTopColor: colors.border,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: s(8) }}>
                <Mail size={s(14)} color={colors.label} />
                <Text style={{ fontSize: s(13), color: colors.heading }}>Email</Text>
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
