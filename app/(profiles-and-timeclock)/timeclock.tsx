import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { format } from "date-fns";
import { router } from "expo-router";
import {
  ArrowLeft,
  Calendar as CalendarIcon,
  RefreshCw,
} from "lucide-react-native";
import { colors, spinnerColor } from "@/lib/theme";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Calendar, DateData } from "react-native-calendars";
import Popover from "react-native-popover-view";

// Types for staff_shifts table
interface StaffShift {
  id: string;
  staff_profile_id: string;
  status: string;
  clock_in_time: string | null;
  clock_out_time: string | null;
  break_logs: Array<{ start: string; end: string | null; type: string }> | null;
  hourly_rate_snapshot: number | null;
  created_at: string;
}

interface ShiftDisplayEntry {
  id: string;
  employeeName: string;
  role: string;
  clockIn: string;
  breakStart: string | null;
  breakEnd: string | null;
  clockOut: string | null;
  duration: string;
  status: string;
}

const TABLE_HEADERS = [
  "Employee",
  "Role",
  "Clock In",
  "Break In",
  "Break Out",
  "Clock Out",
  "Duration",
];

const DailyShiftReportScreen = () => {
  const supabase = useSupabaseClient();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shifts, setShifts] = useState<StaffShift[]>([]);

  const employees = useEmployeeStore((state) => state.employees);
  const selectedStore = useStoreSettingsStore((state) => state.selectedStore);

  // Create map of profileId -> employee info
  const employeeMap = useMemo(() => {
    return new Map(
      employees.map((emp) => [
        emp.profileId,
        { name: emp.fullName, role: emp.role },
      ])
    );
  }, [employees]);

  // Fetch shifts from backend
  const fetchShifts = useCallback(async () => {
    if (!selectedStore?.id) {
      setError("No store selected");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Get start and end of selected date
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const startOfDay = `${dateStr}T00:00:00.000Z`;
      const endOfDay = `${dateStr}T23:59:59.999Z`;

      const { data, error: queryError } = await supabase
        .from("staff_shifts")
        .select(
          "id, staff_profile_id, status, clock_in_time, clock_out_time, break_logs, hourly_rate_snapshot, created_at"
        )
        .eq("location_id", selectedStore.id)
        .gte("clock_in_time", startOfDay)
        .lte("clock_in_time", endOfDay)
        .order("clock_in_time", { ascending: false });

      if (queryError) throw queryError;

      setShifts(data || []);
    } catch (err: any) {
      console.error("Failed to fetch shifts:", err);
      setError(err.message || "Failed to load shifts");
    } finally {
      setIsLoading(false);
    }
  }, [supabase, selectedStore?.id, selectedDate]);

  // Fetch shifts when date or store changes
  useEffect(() => {
    fetchShifts();
  }, [fetchShifts]);

  // Transform shifts into display format
  const shiftsForDisplay: ShiftDisplayEntry[] = useMemo(() => {
    return shifts.map((shift) => {
      const employee = employeeMap.get(shift.staff_profile_id);

      // Calculate duration
      let durationStr = "—";
      if (shift.clock_in_time && shift.clock_out_time) {
        const clockIn = new Date(shift.clock_in_time);
        const clockOut = new Date(shift.clock_out_time);
        let totalMs = clockOut.getTime() - clockIn.getTime();

        // Subtract break time if applicable
        if (shift.break_logs && Array.isArray(shift.break_logs)) {
          for (const brk of shift.break_logs) {
            if (brk.start && brk.end) {
              const breakMs =
                new Date(brk.end).getTime() - new Date(brk.start).getTime();
              totalMs -= breakMs;
            }
          }
        }

        const hours = totalMs / (1000 * 60 * 60);
        durationStr = `${hours.toFixed(2)}h`;
      } else if (shift.status === "active" || shift.status === "on_break") {
        durationStr = "In Progress";
      }

      // Get first break start/end
      const firstBreak = shift.break_logs?.[0];

      return {
        id: shift.id,
        employeeName: employee?.name || "Unknown",
        role: employee?.role || "—",
        clockIn: shift.clock_in_time || shift.created_at,
        breakStart: firstBreak?.start || null,
        breakEnd: firstBreak?.end || null,
        clockOut: shift.clock_out_time,
        duration: durationStr,
        status: shift.status,
      };
    });
  }, [shifts, employeeMap]);

  const onDateChange = (day: DateData) => {
    setSelectedDate(new Date(day.timestamp));
    setIsCalendarOpen(false);
  };

  const calendarTheme = {
    calendarBackground: colors.panel,
    monthTextColor: "#FFFFFF",
    dayTextColor: "#FFFFFF",
    textDisabledColor: colors.muted,
    selectedDayBackgroundColor: colors.info,
    selectedDayTextColor: "#FFFFFF",
    todayTextColor: colors.info,
    arrowColor: colors.info,
    textSectionTitleColor: colors.label,
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <View className="w-2 h-2 rounded-full bg-green-500 mr-2" />;
      case "on_break":
        return <View className="w-2 h-2 rounded-full bg-yellow-500 mr-2" />;
      default:
        return null;
    }
  };

  const renderShiftItem = ({ item }: { item: ShiftDisplayEntry }) => (
    <View className="flex-row p-3 border-b border-gray-700 last:border-b-0 items-center">
      <View className="flex-1 flex-row items-center">
        {getStatusBadge(item.status)}
        <Text className="text-sm text-white" numberOfLines={1}>
          {item.employeeName}
        </Text>
      </View>
      <Text className="flex-1 text-sm text-white">
        {item.role !== "—" ? item.role : "—"}
      </Text>
      <Text className="flex-1 text-sm text-white">
        {format(new Date(item.clockIn), "p")}
      </Text>
      <Text className="flex-1 text-sm text-white">
        {item.breakStart ? format(new Date(item.breakStart), "p") : "—"}
      </Text>
      <Text className="flex-1 text-sm text-white">
        {item.breakEnd ? format(new Date(item.breakEnd), "p") : "—"}
      </Text>
      <Text className="flex-1 text-sm text-white">
        {item.clockOut ? format(new Date(item.clockOut), "p") : "—"}
      </Text>
      <Text className="flex-1 text-sm text-white">{item.duration}</Text>
    </View>
  );

  return (
    <View className="flex-1 bg-screen">
      <View className="flex-row items-center justify-between p-4 border-b border-gray-700">
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={() =>
              router.canGoBack()
                ? router.back()
                : router.replace("/(auth)/pin-login")
            }
            className="mr-3 p-2"
          >
            <ArrowLeft color={colors.label} size={22} />
          </TouchableOpacity>
          <View>
            <Text className="text-xl font-bold text-white">
              Daily Shift Report
            </Text>
            <Text className="text-sm text-gray-400">
              Review shift history by date
            </Text>
          </View>
        </View>
        <View className="flex-row items-center gap-2">
          <TouchableOpacity
            onPress={fetchShifts}
            disabled={isLoading}
            className="p-2 bg-gray-700 rounded-lg"
          >
            <RefreshCw color={isLoading ? colors.muted : "#FFFFFF"} size={18} />
          </TouchableOpacity>
          <Popover
            isVisible={isCalendarOpen}
            onRequestClose={() => setIsCalendarOpen(false)}
            from={
              <TouchableOpacity
                onPress={() => setIsCalendarOpen(true)}
                className="flex-row items-center gap-2 bg-blue-600 px-4 py-2 rounded-lg"
              >
                <CalendarIcon color="white" size={16} />
                <Text className="text-white font-semibold">
                  {format(selectedDate, "PPP")}
                </Text>
              </TouchableOpacity>
            }
          >
            <View className="w-96 bg-panel border-gray-700 z-50 rounded-lg">
              <Calendar
                current={format(selectedDate, "yyyy-MM-dd")}
                onDayPress={onDateChange}
                theme={calendarTheme}
                markedDates={{
                  [format(selectedDate, "yyyy-MM-dd")]: {
                    selected: true,
                    selectedColor: colors.info,
                  },
                }}
              />
            </View>
          </Popover>
        </View>
      </View>

      <View className="flex-1 p-4">
        {error && (
          <View className="bg-red-900/30 border border-red-500 rounded-lg p-3 mb-4">
            <Text className="text-red-400">{error}</Text>
          </View>
        )}

        <View className="flex-1 bg-panel rounded-xl border border-gray-600 overflow-hidden">
          <View className="flex-row p-3 bg-surface border-b border-gray-600">
            {TABLE_HEADERS.map((header) => (
              <Text
                key={header}
                className="flex-1 font-semibold text-xs text-gray-300"
              >
                {header}
              </Text>
            ))}
          </View>

          {isLoading ? (
            <View className="p-8 items-center">
              <ActivityIndicator size="large" color={spinnerColor} />
              <Text className="text-gray-400 mt-2">Loading shifts...</Text>
            </View>
          ) : (
            <FlatList
              data={shiftsForDisplay}
              keyExtractor={(item) => item.id}
              renderItem={renderShiftItem}
              ListEmptyComponent={
                <View className="p-4 items-center">
                  <Text className="text-gray-400">
                    No shift history found for this date.
                  </Text>
                </View>
              }
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </View>
    </View>
  );
};

export default DailyShiftReportScreen;
