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
import { useKDSStore } from "@/stores/useKDSStore";
import { useMenuStore } from "@/stores/useMenuStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  PauseCircle,
  PlayCircle,
  Utensils,
} from "lucide-react-native";
import React, { useMemo } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Helper to get local minutes from ISO or HH:MM:SS time string
const getMinutesFromTime = (time: string) => {
  if (time.includes("T")) {
    const d = new Date(time);
    return d.getHours() * 60 + d.getMinutes();
  }
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
};

const formatScheduleTime = (time: string) => {
  const mins = getMinutesFromTime(time);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const period = h >= 12 ? "PM" : "AM";
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${displayH}:${m.toString().padStart(2, "0")} ${period}`;
};

const DAY_ABBR: Record<string, string> = {
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
  Sunday: "Sun",
};

const TIMELINE_COLORS = [
  "bg-yellow-500",
  "bg-green-500",
  "bg-blue-500",
  "bg-purple-500",
  "bg-red-500",
];

// Timeline bar across 24h
const MenuTimeline = ({ menus }: { menus: any[] }) => {
  const TOTAL_MINUTES = 24 * 60;
  return (
    <View className="mb-2">
      <View className="flex-row justify-between mb-1 px-1">
        <Text className="text-gray-500 text-xs">6 AM</Text>
        <Text className="text-gray-500 text-xs">12 PM</Text>
        <Text className="text-gray-500 text-xs">6 PM</Text>
        <Text className="text-gray-500 text-xs">12 AM</Text>
      </View>
      <View className="h-8 w-full bg-gray-700 rounded-lg flex-row overflow-hidden relative">
        {menus.map((menu, index) => {
          const schedule = menu.schedules?.find((s: any) => s.isActive);
          if (!schedule) return null;
          const startMinutes = getMinutesFromTime(schedule.startTime);
          let endMinutes = getMinutesFromTime(schedule.endTime);
          if (endMinutes < startMinutes) endMinutes = TOTAL_MINUTES;
          const widthPercent = ((endMinutes - startMinutes) / TOTAL_MINUTES) * 100;
          const leftPercent = (startMinutes / TOTAL_MINUTES) * 100;
          return (
            <View
              key={menu.id}
              className={`absolute h-full ${TIMELINE_COLORS[index % TIMELINE_COLORS.length]}/80 border-r border-black/20`}
              style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
            >
              <View className="h-full justify-center px-1">
                <Text numberOfLines={1} className="text-[10px] font-bold text-black/60">
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

  const { menus } = useMenuStore();

  // KDS live data
  const kdsTicketsByStatus = useKDSStore((s) => s.ticketsByStatus);
  const liveKitchenOrderCount =
    (kdsTicketsByStatus.pending?.length ?? 0) +
    (kdsTicketsByStatus.cooking?.length ?? 0);

  // Calculated Prep Time Logic
  const currentPrepTime = useMemo(() => {
    let time = basePrepTime;
    if (dynamicPrepTimeEnabled) {
      if (prepTimeAdjustments.kitchenLoad && liveKitchenOrderCount >= 25) time += 10;
      if (prepTimeAdjustments.peakHours) {
        const hour = new Date().getHours();
        if (hour >= 17 && hour < 20) time += 5;
      }
    }
    return time;
  }, [basePrepTime, dynamicPrepTimeEnabled, prepTimeAdjustments, liveKitchenOrderCount]);

  const isOrdersPaused = !onlineOrderingEnabled;
  const buttonColor = isOrdersPaused ? "bg-red-600" : "bg-green-600";
  const buttonIcon = isOrdersPaused ? PauseCircle : PlayCircle;
  const buttonText = isOrdersPaused ? "ORDERS PAUSED" : "ACCEPTING ORDERS";

  const menusWithSchedules = menus.filter((m) => m.schedules && m.schedules.length > 0);

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
              <TouchableOpacity
                onPress={() => updateField("onlineOrderingEnabled", !onlineOrderingEnabled)}
                className={`w-full h-16 ${buttonColor} rounded-xl flex-row items-center justify-center gap-3 active:opacity-90 shadow-lg`}
              >
                {React.createElement(buttonIcon, { size: 32, color: "white" })}
                <Text className="text-white font-black text-xl tracking-wider">
                  {buttonText}
                </Text>
              </TouchableOpacity>

              {/* Pause Reason (when disabled) */}
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
                      <SelectValue placeholder="Select a reason..." className="text-white" />
                    </SelectTrigger>
                    <SelectContent className="bg-screen border-gray-600">
                      <SelectGroup>
                        <SelectItem label="Kitchen at Capacity" value="Kitchen at Capacity" />
                        <SelectItem label="Staff Shortage" value="Staff Shortage" />
                        <SelectItem label="Emergency Maintenance" value="Emergency Maintenance" />
                        <SelectItem label="Closing Early" value="Closing Early" />
                      </SelectGroup>
                    </SelectContent>
                  </Select>

                  {/* Base prep time when disabled */}
                  <View className="mt-4 gap-3">
                    <View className="flex-row justify-between items-center">
                      <Label className="text-gray-300">Base Prep Time Quote</Label>
                      <Text className="text-info font-bold text-lg">{basePrepTime} min</Text>
                    </View>
                    <CustomSlider
                      value={basePrepTime}
                      onValueChange={(val) => updateField("basePrepTime", val)}
                      min={5}
                      max={60}
                      step={5}
                    />
                    <Text className="text-gray-500 text-xs">
                      Customers will see this as the estimated wait time while orders are paused.
                    </Text>
                  </View>
                </View>
              )}
            </CardContent>
          </Card>

          {/* Only show the rest when online ordering is enabled */}
          {onlineOrderingEnabled && (
            <>
              {/* Stats */}
              <View className="bg-panel p-4 rounded-2xl border border-gray-600 flex-row justify-between items-center">
                <View>
                  <Text className="text-gray-400 text-xs uppercase mb-1">Orders Today</Text>
                  <Text className="text-white font-bold text-xl">142</Text>
                </View>
                <View className="h-8 w-[1px] bg-gray-600" />
                <View>
                  <Text className="text-gray-400 text-xs uppercase mb-1">Avg Prep Time</Text>
                  <Text className="text-white font-bold text-xl">28m</Text>
                </View>
                <View className="h-8 w-[1px] bg-gray-600" />
                <View>
                  <Text className="text-gray-400 text-xs uppercase mb-1">KDS Active</Text>
                  <Text className="text-green-400 font-bold text-xl">{liveKitchenOrderCount}</Text>
                </View>
              </View>

              {/* Dynamic Prep Times */}
              <Card className="bg-panel border-gray-600">
                <CardHeader>
                  <View className="flex-row items-center gap-3">
                    <Clock color={themeColors.warning} size={24} />
                    <View className="flex-row items-center gap-2">
                      <CardTitle className="text-white">Dynamic Prep Times</CardTitle>
                      <View className="bg-[#eab308]/20 px-2 py-0.5 rounded">
                        <Text className="text-[#eab308] text-[10px] font-bold">REAL-TIME</Text>
                      </View>
                    </View>
                  </View>
                </CardHeader>
                <CardContent className="gap-6">
                  <View className="flex-row items-center justify-between">
                    <Label className="text-white text-base">Show Dynamic Prep Times</Label>
                    <Switch
                      checked={dynamicPrepTimeEnabled}
                      onCheckedChange={(val) => updateField("dynamicPrepTimeEnabled", val)}
                    />
                  </View>

                  <View className="gap-4">
                    <View className="flex-row justify-between">
                      <Label className="text-gray-300">Base Prep Time</Label>
                      <Text className="text-info font-bold text-lg">{basePrepTime} min</Text>
                    </View>
                    <CustomSlider
                      value={basePrepTime}
                      onValueChange={(val) => updateField("basePrepTime", val)}
                      min={5}
                      max={60}
                      step={5}
                    />
                  </View>

                  {dynamicPrepTimeEnabled && (
                    <>
                      <View className="bg-surface p-6 rounded-xl items-center justify-center shadow-lg">
                        <Text className="text-gray-500 text-sm uppercase tracking-widest mb-1">
                          Current Quoted Time
                        </Text>
                        <Text className="text-info font-black text-5xl">{currentPrepTime} min</Text>
                        <Text className="text-gray-400 text-xs mt-2">Updated just now</Text>
                      </View>

                      <View className="gap-3">
                        <Label className="text-white mb-1">Auto-Adjustments:</Label>
                        {[
                          {
                            key: "kitchenLoad",
                            label: `Add 10 min when kitchen has 25+ orders (now: ${liveKitchenOrderCount})`,
                            checked: prepTimeAdjustments.kitchenLoad,
                          },
                          {
                            key: "peakHours",
                            label: "Add 5 min during peak hours (5–8 PM)",
                            checked: prepTimeAdjustments.peakHours,
                          },
                        ].map((item) => (
                          <View key={item.key} className="flex-row items-center gap-3">
                            <Checkbox
                              checked={item.checked}
                              onCheckedChange={(v) => updatePrepAdjustment(item.key as any, v)}
                              className="border-gray-500 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                            />
                            <Text className="text-gray-300 text-sm">{item.label}</Text>
                          </View>
                        ))}
                      </View>

                      <View className="bg-blue-500/10 p-4 rounded-lg border border-blue-500/30">
                        <Text className="text-blue-400 font-bold mb-2">Current Factors (KDS Live):</Text>
                        <Text className="text-gray-400 text-xs">
                          • Kitchen Load: {liveKitchenOrderCount} orders
                          {prepTimeAdjustments.kitchenLoad && liveKitchenOrderCount >= 25
                            ? " (+10 min)"
                            : " (no adjustment)"}
                        </Text>
                        <Text className="text-gray-400 text-xs">
                          • Peak Hours (5–8 PM):
                          {prepTimeAdjustments.peakHours && new Date().getHours() >= 17 && new Date().getHours() < 20
                            ? " Active (+5 min)"
                            : " Not active"}
                        </Text>
                        <View className="h-[1px] bg-blue-500/30 my-2" />
                        <Text className="text-white font-bold text-sm">
                          Total: {basePrepTime} + {currentPrepTime - basePrepTime} = {currentPrepTime} min
                        </Text>
                      </View>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Time-Based Menus */}
              <Card className="bg-panel border-gray-600">
                <CardHeader>
                  <View className="flex-row items-center gap-3">
                    <Utensils color={themeColors.success} size={24} />
                    <View className="flex-row items-center gap-2">
                      <CardTitle className="text-white">Time-Based Menus</CardTitle>
                      <View className="bg-[#10b981]/20 px-2 py-0.5 rounded">
                        <Text className="text-[#10b981] text-[10px] font-bold">SMART MENUS</Text>
                      </View>
                    </View>
                  </View>
                </CardHeader>
                <CardContent className="gap-4">
                  {menusWithSchedules.length > 0 && <MenuTimeline menus={menusWithSchedules} />}

                  {/* Active menu indicator */}
                  {(() => {
                    const activeMenu = menus.find((m) =>
                      useMenuStore.getState().isMenuAvailableNow(m.id)
                    );
                    return (
                      <View className="bg-green-500/10 p-3 rounded-lg flex-row items-center gap-2 border border-green-500/20">
                        <View className={`h-2 w-2 rounded-full ${activeMenu ? "bg-green-500" : "bg-gray-500"}`} />
                        <Text className={`${activeMenu ? "text-green-500" : "text-gray-500"} font-bold`}>
                          Active Now: {activeMenu ? `"${activeMenu.name}"` : "None"}
                        </Text>
                      </View>
                    );
                  })()}

                  {/* Per-menu schedule cards */}
                  <View className="gap-3">
                    {menus.map((menu, i) => {
                      const isActiveNow = useMenuStore.getState().isMenuAvailableNow(menu.id);
                      const activeSchedules = (menu.schedules || []).filter((s: any) => s.isActive);
                      const dotColor = TIMELINE_COLORS[i % TIMELINE_COLORS.length];

                      return (
                        <View
                          key={menu.id}
                          className="bg-surface rounded-xl border border-gray-600 overflow-hidden"
                        >
                          {/* Menu header */}
                          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-700">
                            <View className="flex-row items-center gap-2">
                              <View className={`w-3 h-3 rounded-full ${dotColor}`} />
                              <Text className="text-white font-semibold text-base">{menu.name}</Text>
                            </View>
                            {isActiveNow ? (
                              <View className="flex-row items-center gap-1 bg-green-500/20 px-2 py-1 rounded-full">
                                <CheckCircle2 size={12} color={themeColors.success} />
                                <Text className="text-green-400 text-xs font-medium">Active Now</Text>
                              </View>
                            ) : (
                              <Text className="text-gray-500 text-xs">Inactive</Text>
                            )}
                          </View>

                          {/* Schedules */}
                          {activeSchedules.length === 0 ? (
                            <View className="px-4 py-3">
                              <Text className="text-gray-500 text-sm italic">No schedule — always available</Text>
                            </View>
                          ) : (
                            activeSchedules.map((s: any) => (
                              <View key={s.id} className="px-4 py-3 border-b border-gray-700/50 flex-row items-start justify-between">
                                <View className="flex-row flex-wrap gap-1 flex-1 mr-4">
                                  {(s.days || []).map((day: string) => (
                                    <View key={day} className="bg-gray-700 px-2 py-0.5 rounded">
                                      <Text className="text-gray-300 text-xs">{DAY_ABBR[day] ?? day}</Text>
                                    </View>
                                  ))}
                                </View>
                                <View className="flex-row items-center gap-1">
                                  <Clock size={12} color={themeColors.muted} />
                                  <Text className="text-gray-300 text-sm">
                                    {formatScheduleTime(s.startTime)} – {formatScheduleTime(s.endTime)}
                                  </Text>
                                </View>
                              </View>
                            ))
                          )}
                        </View>
                      );
                    })}
                  </View>

                  <TouchableOpacity
                    onPress={() =>
                      router.push({
                        pathname: "/(main)/menu",
                        params: { returnTo: "/settings/online-ordering" },
                      })
                    }
                    className="bg-screen py-3 rounded-lg border border-gray-600 items-center mt-2"
                  >
                    <Text className="text-gray-300 font-bold">Edit Menu Schedules</Text>
                  </TouchableOpacity>
                </CardContent>
              </Card>
            </>
          )}

          <View className="h-10" />
        </View>
      </ScrollView>
    </View>
  );
};

export default OnlineOrderingScreen;
