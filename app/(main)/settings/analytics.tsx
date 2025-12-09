import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Bell,
  LayoutDashboard,
  Mail,
  MessageSquare,
  Smartphone,
} from "lucide-react-native";
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
    <View className="flex-1 bg-[#212121] p-6">
      <View className="mb-6">
        <Text className="text-3xl font-bold text-white">
          Real-Time Analytics
        </Text>
        <Text className="text-gray-400 mt-2">
          Configure dashboards and real-time alerts.
        </Text>
      </View>

      <View className="h-[1px] w-full bg-gray-700 mb-6" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
      >
        <View className="gap-6">
          {/* Live Dashboard Configuration */}
          <Card className="bg-[#303030] border-gray-600">
            <CardHeader>
              <View className="flex-row items-center gap-3">
                <LayoutDashboard color="#3b82f6" size={24} />
                <CardTitle className="text-white">Live Dashboard</CardTitle>
              </View>
            </CardHeader>
            <CardContent className="gap-6">
              {/* Enable Dashboard Toggle */}
              <View className="flex-row items-center justify-between">
                <Label className="text-white text-base">Enable Dashboard</Label>
                <Switch
                  checked={enableDashboard}
                  onCheckedChange={setEnableDashboard}
                />
              </View>

              {enableDashboard && (
                <>
                  {/* Widget Configurator */}
                  <View className="gap-3">
                    <Label className="text-gray-300 font-semibold mb-1">
                      Visible Widgets
                    </Label>
                    <View className="gap-3">
                      {[
                        { key: "salesToday", label: "Sales Today" },
                        {
                          key: "ordersInProgress",
                          label: "Orders in Progress",
                        },
                        { key: "laborCost", label: "Labor Cost %" },
                        { key: "topSelling", label: "Top Selling Items" },
                        { key: "customerCount", label: "Customer Count" },
                        { key: "avgTicket", label: "Avg Ticket Size" },
                        { key: "kitchenLoad", label: "Kitchen Load" },
                      ].map((widget) => (
                        <View
                          key={widget.key}
                          className="flex-row items-center gap-3"
                        >
                          <Checkbox
                            checked={
                              widgets[widget.key as keyof typeof widgets]
                            }
                            onCheckedChange={() =>
                              toggleWidget(widget.key as keyof typeof widgets)
                            }
                            className="border-gray-500 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                          />
                          <Text className="text-gray-300 text-sm">
                            {widget.label}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  {/* Customize Layout Button */}
                  <TouchableOpacity className="flex-row items-center justify-center border border-gray-500 p-3 rounded-lg mt-2 border-dashed">
                    <Text className="text-gray-300 font-medium">
                      Customize Dashboard Layout
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </CardContent>
          </Card>

          {/* Real-Time Alerts Configuration */}
          <Card className="bg-[#303030] border-gray-600">
            <CardHeader>
              <View className="flex-row items-center gap-3">
                <Bell color="#f59e0b" size={24} />
                <CardTitle className="text-white">Real-Time Alerts</CardTitle>
              </View>
            </CardHeader>
            <CardContent className="gap-6">
              {/* Alert Triggers */}
              <View className="gap-4">
                <Label className="text-gray-300 font-semibold">
                  Alert Triggers
                </Label>

                {/* Sales Goal Input */}
                <View>
                  <Label className="text-gray-400 text-sm mb-1.5">
                    Daily Sales Goal ($)
                  </Label>
                  <Input
                    className="bg-[#212121] border-gray-600 text-white h-10"
                    placeholder="e.g. 5000"
                    placeholderClassName="text-gray-500"
                    keyboardType="numeric"
                    value={salesGoal}
                    onChangeText={setSalesGoal}
                  />
                </View>

                {/* Labor Cost Threshold Input */}
                <View>
                  <Label className="text-gray-400 text-sm mb-1.5">
                    Labor Cost Threshold (%)
                  </Label>
                  <Input
                    className="bg-[#212121] border-gray-600 text-white h-10"
                    placeholder="e.g. 30"
                    placeholderClassName="text-gray-500"
                    keyboardType="numeric"
                    value={laborCostThreshold}
                    onChangeText={setLaborCostThreshold}
                  />
                </View>

                {/* Kitchen Backed Up Switch */}
                <View className="flex-row items-center justify-between">
                  <Text className="text-gray-300">Kitchen Backed Up</Text>
                  <Switch
                    checked={alertTriggers.kitchenBackedUp}
                    onCheckedChange={() =>
                      toggleAlertTrigger("kitchenBackedUp")
                    }
                  />
                </View>

                {/* Inventory Low Switch */}
                <View className="flex-row items-center justify-between">
                  <Text className="text-gray-300">Inventory Low</Text>
                  <Switch
                    checked={alertTriggers.inventoryLow}
                    onCheckedChange={() => toggleAlertTrigger("inventoryLow")}
                  />
                </View>
              </View>

              <View className="h-[1px] bg-gray-700 my-1" />

              {/* Delivery Methods */}
              <View className="gap-3">
                <Label className="text-gray-300 font-semibold mb-1">
                  Notification Channels
                </Label>

                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <Smartphone size={16} color="#9ca3af" />
                    <Text className="text-gray-300">Push Notifications</Text>
                  </View>
                  <Switch
                    checked={deliveryMethods.push}
                    onCheckedChange={() => toggleDeliveryMethod("push")}
                  />
                </View>

                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <MessageSquare size={16} color="#9ca3af" />
                    <Text className="text-gray-300">SMS</Text>
                  </View>
                  <Switch
                    checked={deliveryMethods.sms}
                    onCheckedChange={() => toggleDeliveryMethod("sms")}
                  />
                </View>

                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <Mail size={16} color="#9ca3af" />
                    <Text className="text-gray-300">Email</Text>
                  </View>
                  <Switch
                    checked={deliveryMethods.email}
                    onCheckedChange={() => toggleDeliveryMethod("email")}
                  />
                </View>
              </View>
            </CardContent>
          </Card>
        </View>
      </ScrollView>
    </View>
  );
};

export default AnalyticsScreen;
