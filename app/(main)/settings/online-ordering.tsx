import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import CustomSlider from "@/components/ui/custom-slider";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { colors as themeColors } from "@/lib/theme";
import { useMenuStore } from "@/stores/useMenuStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import {
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock,
  PauseCircle,
  PlayCircle,
  Utensils,
} from "lucide-react-native";
import React, { useMemo } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Helper to get local minutes from ISO time
const getMinutesFromTime = (isoTime: string) => {
  const d = new Date(isoTime);
  // We use local hours to match visual timeline which typically represents "the day"
  return d.getHours() * 60 + d.getMinutes();
};

// Timeline Component
const MenuTimeline = ({ menus }: { menus: any[] }) => {
  const TOTAL_MINUTES = 24 * 60; // 1440 minutes in a day

  // Predefined colors for visualization
  const colors = [
    "bg-yellow-500",
    "bg-green-500",
    "bg-blue-500",
    "bg-purple-500",
    "bg-red-500",
  ];

  return (
    <View className="mt-4 mb-6">
      <View className="flex-row justify-between mb-1 px-1">
        <Text className="text-gray-500 text-xs">6 AM</Text>
        <Text className="text-gray-500 text-xs">12 PM</Text>
        <Text className="text-gray-500 text-xs">6 PM</Text>
        <Text className="text-gray-500 text-xs">12 AM</Text>
      </View>
      <View className="h-8 w-full bg-gray-700 rounded-lg flex-row overflow-hidden relative">
        {menus.map((menu, index) => {
          // Find the first active schedule for visualization
          const schedule = menu.schedules?.find((s: any) => s.isActive);
          if (!schedule) return null;

          const startMinutes = getMinutesFromTime(schedule.startTime);
          let endMinutes = getMinutesFromTime(schedule.endTime);

          // Handle late night crossing midnight (e.g., 22:00 - 02:00)
          // For timeline viz, we'll just clip it to 24h or show distinct segments if sophisticated
          // Simple visual hack: if end < start, assume it goes to end of day for this bar
          if (endMinutes < startMinutes) endMinutes = TOTAL_MINUTES;

          const widthPercent =
            ((endMinutes - startMinutes) / TOTAL_MINUTES) * 100;
          const leftPercent = (startMinutes / TOTAL_MINUTES) * 100;

          return (
            <View
              key={menu.id}
              className={`absolute h-full ${
                colors[index % colors.length]
              }/80 border-r border-black/20`}
              style={{
                left: `${leftPercent}%`,
                width: `${widthPercent}%`,
              }}
            >
              <View className="h-full justify-center px-1">
                <Text
                  numberOfLines={1}
                  className="text-[10px] font-bold text-black/60"
                >
                  {menu.name}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
};

import { useRouter } from "expo-router";

const OnlineOrderingScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Store Connection
  const onlineOrderingEnabled = useStoreSettingsStore((s) => s.onlineOrderingEnabled);
  const updateField = useStoreSettingsStore((s) => s.updateField);
  const onlinePauseReason = useStoreSettingsStore((s) => s.onlinePauseReason);
  const autoAcceptOrders = useStoreSettingsStore((s) => s.autoAcceptOrders);
  const largeOrderApprovalThreshold = useStoreSettingsStore((s) => s.largeOrderApprovalThreshold);
  const rejectWhenBusyThreshold = useStoreSettingsStore((s) => s.rejectWhenBusyThreshold);
  const dynamicPrepTimeEnabled = useStoreSettingsStore((s) => s.dynamicPrepTimeEnabled);
  const basePrepTime = useStoreSettingsStore((s) => s.basePrepTime);
  const prepTimeAdjustments = useStoreSettingsStore((s) => s.prepTimeAdjustments);
  const updatePrepAdjustment = useStoreSettingsStore((s) => s.updatePrepAdjustment);
  const preOrderingEnabled = useStoreSettingsStore((s) => s.preOrderingEnabled);
  const preOrderMaxDays = useStoreSettingsStore((s) => s.preOrderMaxDays);
  const preOrderMinAdvanceMinutes = useStoreSettingsStore((s) => s.preOrderMinAdvanceMinutes);
  const preOrderMaxDaily = useStoreSettingsStore((s) => s.preOrderMaxDaily);

  const { isMenuSchedulingEnabled, setMenuSchedulingEnabled, menus } =
    useMenuStore();

  // Calculated Prep Time Logic
  const currentPrepTime = useMemo(() => {
    let time = basePrepTime;
    if (dynamicPrepTimeEnabled) {
      // Mock logic for "Current Factors"
      if (prepTimeAdjustments.kitchenLoad) time += 10; // Assume busy for demo
      if (prepTimeAdjustments.peakHours) time += 5; // Assume peak for demo
      if (prepTimeAdjustments.weather) time += 15;
    }
    return time;
  }, [basePrepTime, dynamicPrepTimeEnabled, prepTimeAdjustments]);

  // Derived Status
  const isOrdersPaused = !onlineOrderingEnabled;
  const buttonColor = isOrdersPaused ? "bg-red-600" : "bg-green-600";
  const buttonIcon = isOrdersPaused ? PauseCircle : PlayCircle;
  const buttonText = isOrdersPaused ? "ORDERS PAUSED" : "ACCEPTING ORDERS";

  return (
    <View className="flex-1 bg-screen p-6">
      <View className="mb-6">
        <Text className="text-3xl font-bold text-white">Online Ordering</Text>
        <Text className="text-gray-400 mt-2">
          Manage orders, workflows, and scheduling.
        </Text>
      </View>

      <View className="h-[1px] w-full bg-gray-700 mb-6" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
      >
        <View className="gap-6">
          {/* 1. Order Status Control */}
          <Card className="bg-panel border-gray-600">
            <CardHeader>
              <CardTitle className="text-white">Order Status Control</CardTitle>
            </CardHeader>
            <CardContent className="gap-4">
              {/* Giant Toggle Button */}
              <TouchableOpacity
                onPress={() =>
                  updateField("onlineOrderingEnabled", !onlineOrderingEnabled)
                }
                className={`w-full h-16 ${buttonColor} rounded-xl flex-row items-center justify-center gap-3 active:opacity-90 shadow-lg`}
              >
                {React.createElement(buttonIcon, { size: 32, color: "white" })}
                <Text className="text-white font-black text-xl tracking-wider">
                  {buttonText}
                </Text>
              </TouchableOpacity>

              {/* Status Panel */}
              <View className="bg-black/20 p-4 rounded-lg flex-row justify-between items-center border border-gray-700">
                <View>
                  <Text className="text-gray-400 text-xs uppercase mb-1">
                    Orders Today
                  </Text>
                  <Text className="text-white font-bold text-xl">142</Text>
                </View>
                <View className="h-8 w-[1px] bg-gray-600" />
                <View>
                  <Text className="text-gray-400 text-xs uppercase mb-1">
                    Avg Prep Time
                  </Text>
                  <Text className="text-white font-bold text-xl">28m</Text>
                </View>
                <View className="h-8 w-[1px] bg-gray-600" />
                <View>
                  <Text className="text-gray-400 text-xs uppercase mb-1">
                    Active
                  </Text>
                  <Text className="text-green-400 font-bold text-xl">14</Text>
                </View>
              </View>

              {/* Pause Reason (Conditional) */}
              {isOrdersPaused && (
                <View className="gap-2 mt-2">
                  <Label className="text-white">Pause Reason</Label>
                  <Select
                    value={{
                      value: onlinePauseReason || "",
                      label: onlinePauseReason || "Select Reason",
                    }}
                    onValueChange={(opt) =>
                      updateField("onlinePauseReason", opt?.value || null)
                    }
                  >
                    <SelectTrigger className="bg-screen border-gray-600">
                      <SelectValue
                        placeholder="Select a reason..."
                        className="text-white"
                      />
                    </SelectTrigger>
                    <SelectContent className="bg-screen border-gray-600">
                      <SelectGroup>
                        <SelectItem
                          label="Kitchen at Capacity"
                          value="Kitchen at Capacity"
                        />
                        <SelectItem
                          label="Staff Shortage"
                          value="Staff Shortage"
                        />
                        <SelectItem
                          label="Emergency Maintenance"
                          value="Emergency Maintenance"
                        />
                        <SelectItem
                          label="Closing Early"
                          value="Closing Early"
                        />
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </View>
              )}
            </CardContent>
          </Card>

          {/* 3. Dynamic Prep Times */}
          <Card className="bg-panel border-gray-600">
            <CardHeader>
              <View className="flex-row items-center gap-3">
                <Clock color={themeColors.warning} size={24} />
                <View className="flex-row items-center gap-2">
                  <CardTitle className="text-white">
                    Dynamic Prep Times
                  </CardTitle>
                  <View className="bg-[#eab308]/20 px-2 py-0.5 rounded">
                    <Text className="text-[#eab308] text-[10px] font-bold">
                      REAL-TIME
                    </Text>
                  </View>
                </View>
              </View>
            </CardHeader>
            <CardContent className="gap-6">
              <View className="flex-row items-center justify-between">
                <Label className="text-white text-base">
                  Show Dynamic Prep Times
                </Label>
                <Switch
                  checked={dynamicPrepTimeEnabled}
                  onCheckedChange={(val) =>
                    updateField("dynamicPrepTimeEnabled", val)
                  }
                />
              </View>

              {dynamicPrepTimeEnabled && (
                <>
                  <View className="gap-4">
                    <View className="flex-row justify-between">
                      <Label className="text-gray-300">Base Prep Time</Label>
                      <Text className="text-info font-bold text-lg">
                        {basePrepTime} min
                      </Text>
                    </View>
                    <CustomSlider
                      value={basePrepTime}
                      onValueChange={(val) => updateField("basePrepTime", val)}
                      min={5}
                      max={60}
                      step={5}
                    />
                  </View>

                  <View className="bg-surface p-6 rounded-xl items-center justify-center shadow-lg">
                    <Text className="text-gray-500 text-sm uppercase tracking-widest mb-1">
                      Current Quoted Time
                    </Text>
                    <Text className="text-info font-black text-5xl">
                      {currentPrepTime} min
                    </Text>
                    <Text className="text-gray-400 text-xs mt-2">
                      Updated just now
                    </Text>
                  </View>

                  <View className="gap-3">
                    <Label className="text-white mb-1">Auto-Adjustments:</Label>
                    {[
                      {
                        key: "kitchenLoad",
                        label: "Add 10 min when kitchen has 25+ orders",
                        checked: prepTimeAdjustments.kitchenLoad,
                      },
                      {
                        key: "peakHours",
                        label: "Add 5 min during peak hours (5-8 PM)",
                        checked: prepTimeAdjustments.peakHours,
                      },
                      {
                        key: "weather",
                        label: "Add 15 min during bad weather",
                        checked: prepTimeAdjustments.weather,
                      },
                    ].map((item) => (
                      <View
                        key={item.key}
                        className="flex-row items-center gap-3"
                      >
                        <Checkbox
                          checked={item.checked}
                          onCheckedChange={(v) =>
                            updatePrepAdjustment(item.key as any, v)
                          }
                          className="border-gray-500 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                        />
                        <Text className="text-gray-300 text-sm">
                          {item.label}
                        </Text>
                      </View>
                    ))}
                  </View>

                  <View className="bg-blue-500/10 p-4 rounded-lg border border-blue-500/30">
                    <Text className="text-blue-400 font-bold mb-2">
                      Current Factors:
                    </Text>
                    <Text className="text-gray-400 text-xs">
                      • Kitchen Load: 14 orders (no adjustment)
                    </Text>
                    <Text className="text-gray-400 text-xs">
                      • Time: Peak Hours (+5 min)
                    </Text>
                    <Text className="text-gray-400 text-xs">
                      • Weather: Clear (no adjustment)
                    </Text>
                    <View className="h-[1px] bg-blue-500/30 my-2" />
                    <Text className="text-white font-bold text-sm">
                      Total: {basePrepTime} + 5 = {currentPrepTime} min
                    </Text>
                  </View>
                </>
              )}
            </CardContent>
          </Card>

          {/* 5. Time-Based Menus */}
          <Card className="bg-panel border-gray-600">
            <CardHeader>
              <View className="flex-row items-center gap-3">
                <Utensils color={themeColors.success} size={24} />
                <View className="flex-row items-center gap-2">
                  <CardTitle className="text-white">Time-Based Menus</CardTitle>
                  <View className="bg-[#10b981]/20 px-2 py-0.5 rounded">
                    <Text className="text-[#10b981] text-[10px] font-bold">
                      SMART MENUS
                    </Text>
                  </View>
                </View>
              </View>
            </CardHeader>
            <CardContent className="gap-6">
              <View className="flex-row items-center justify-between">
                <Label className="text-white text-base">
                  Enable Menu Scheduling
                </Label>
                <Switch
                  checked={isMenuSchedulingEnabled}
                  onCheckedChange={setMenuSchedulingEnabled}
                />
              </View>

              {isMenuSchedulingEnabled && (
                <>
                  <MenuTimeline menus={menus} />

                  <View className="gap-2">
                    <Label className="text-gray-300 mb-2">Menu Schedule:</Label>
                    <View className="bg-screen rounded-lg border border-gray-700 overflow-hidden divide-y divide-gray-700">
                      {menus.map((menu, i) => {
                        const schedule = menu.schedules?.find(
                          (s: any) => s.isActive
                        );

                        // Match colors logic from MenuTimeline
                        const colors = [
                          "bg-yellow-500",
                          "bg-green-500",
                          "bg-blue-500",
                          "bg-purple-500",
                          "bg-red-500",
                        ];
                        const dotColor = colors[i % colors.length];

                        // Format ISO string to time (e.g. 5:00 PM)
                        const formatTime = (iso: string) =>
                          new Date(iso).toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                          });

                        let timeString = "No Active Schedule";
                        if (schedule) {
                          const start = formatTime(schedule.startTime);
                          const end = formatTime(schedule.endTime);
                          timeString = `${start} - ${end}`;
                        }

                        const isActiveNow = useMenuStore
                          .getState()
                          .isMenuAvailableNow(menu.id);

                        return (
                          <View
                            key={menu.id}
                            className="flex-row justify-between p-3"
                          >
                            <View className="flex-row items-center gap-2">
                              {/* Colored Dot matching timeline */}
                              <View
                                className={`w-3 h-3 rounded-full ${dotColor}`}
                              />
                              <Clock
                                size={14}
                                color={isActiveNow ? themeColors.success : themeColors.muted}
                              />
                              <Text
                                className={
                                  !isActiveNow
                                    ? "text-gray-500"
                                    : "text-white font-medium"
                                }
                              >
                                {menu.name}
                              </Text>
                            </View>
                            <Text className="text-gray-400 text-xs">
                              {timeString}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>

                  {/* Active Menu Indicator */}
                  {(() => {
                    const activeMenu = menus.find((m) =>
                      useMenuStore.getState().isMenuAvailableNow(m.id)
                    );

                    return (
                      <View className="bg-green-500/10 p-3 rounded-lg flex-row items-center gap-2 border border-green-500/20">
                        <View
                          className={`h-2 w-2 rounded-full ${activeMenu ? "bg-green-500" : "bg-gray-500"}`}
                        />
                        <Text
                          className={`${activeMenu ? "text-green-500" : "text-gray-500"} font-bold`}
                        >
                          Current Active Menu:{" "}
                          {activeMenu ? `"${activeMenu.name}"` : "None"}
                        </Text>
                      </View>
                    );
                  })()}

                  <TouchableOpacity
                    onPress={() =>
                      router.push({
                        pathname: "/(main)/menu",
                        params: { returnTo: "/settings/online-ordering" },
                      })
                    }
                    className="bg-screen py-3 rounded-lg border border-gray-600 items-center"
                  >
                    <Text className="text-gray-300 font-bold">
                      Edit Menu Schedule
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </CardContent>
          </Card>

          <View className="h-10" />
        </View>
      </ScrollView>
    </View>
  );
};

export default OnlineOrderingScreen;
