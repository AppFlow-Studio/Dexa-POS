import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { replaceRoute } from "@/lib/rootNavigation";
import { colors, spinnerColor } from "@/lib/theme";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { format } from "date-fns";
import { router, useLocalSearchParams } from "expo-router";
import { DateTime } from "luxon";
import {
    ArrowLeft,
    Calendar as CalendarIcon,
    CircleCheckBig,
    Clock3,
    MoonStar,
    RefreshCw,
    Users,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  staffProfileId: string;
  employeeId: string | null;
  employeeName: string;
  role: string;
  clockIn: string;
  breakStart: string | null;
  breakEnd: string | null;
  clockOut: string | null;
  duration: string;
  status: string;
}

function toIsoDateKeySafe(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKeyForDisplay(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function getTodayDateKey(timezone?: string | null): string {
  if (timezone) {
    const now = DateTime.now().setZone(timezone);
    if (now.isValid) {
      return now.toISODate() ?? format(new Date(), "yyyy-MM-dd");
    }
  }

  return toIsoDateKeySafe(new Date()) ?? format(new Date(), "yyyy-MM-dd");
}

function getUtcBoundsForCalendarDay(dateKey: string, timezone?: string | null) {
  if (timezone) {
    const start = DateTime.fromISO(dateKey, { zone: timezone }).startOf("day");
    if (start.isValid) {
      const end = start.endOf("day");
      return {
        startUtc: start.toUTC().toISO() ?? `${dateKey}T00:00:00.000Z`,
        endUtc: end.toUTC().toISO() ?? `${dateKey}T23:59:59.999Z`,
      };
    }
  }

  const [year, month, day] = dateKey.split("-").map(Number);
  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  const end = new Date(year, month - 1, day, 23, 59, 59, 999);
  return {
    startUtc: start.toISOString(),
    endUtc: end.toISOString(),
  };
}

function parseQueryList(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const raw = Array.isArray(value) ? value.join(",") : value;
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const DailyShiftReportScreen = () => {
  const supabase = useSupabaseClient();
  const selectedStore = useStoreSettingsStore((state) => state.selectedStore);
  const listRef = useRef<FlatList<ShiftDisplayEntry>>(null);
  const {
    reviewMode,
    focusEmployeeIds,
    focusStaffProfileIds,
  } = useLocalSearchParams<{
    reviewMode?: string | string[];
    focusEmployeeIds?: string | string[];
    focusStaffProfileIds?: string | string[];
  }>();
  const [selectedDateKey, setSelectedDateKey] = useState(() =>
    getTodayDateKey(selectedStore?.timezone),
  );
  const [hasManualDateSelection, setHasManualDateSelection] = useState(false);
  const [dismissReviewFocus, setDismissReviewFocus] = useState(false);
  const [hasAutoFocusedReviewRows, setHasAutoFocusedReviewRows] =
    useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shifts, setShifts] = useState<StaffShift[]>([]);

  const employees = useEmployeeStore((state) => state.employees);
  const reviewModeValue = Array.isArray(reviewMode) ? reviewMode[0] : reviewMode;
  const focusEmployeeIdList = useMemo(
    () => parseQueryList(focusEmployeeIds),
    [focusEmployeeIds],
  );
  const focusStaffProfileIdList = useMemo(
    () => parseQueryList(focusStaffProfileIds),
    [focusStaffProfileIds],
  );
  const focusEmployeeIdSet = useMemo(
    () => new Set(focusEmployeeIdList),
    [focusEmployeeIdList],
  );
  const focusStaffProfileIdSet = useMemo(
    () => new Set(focusStaffProfileIdList),
    [focusStaffProfileIdList],
  );
  const isReviewFocusMode =
    !dismissReviewFocus &&
    reviewModeValue === "unresolved" &&
    (focusEmployeeIdSet.size > 0 || focusStaffProfileIdSet.size > 0);

  useEffect(() => {
    if (hasManualDateSelection) return;
    setSelectedDateKey(getTodayDateKey(selectedStore?.timezone));
  }, [selectedStore?.timezone, hasManualDateSelection]);

  useEffect(() => {
    setDismissReviewFocus(false);
    setHasAutoFocusedReviewRows(false);
  }, [reviewModeValue, focusEmployeeIds, focusStaffProfileIds]);

  // Create map of profileId -> employee info
  const employeeMap = useMemo(() => {
    return new Map(
      employees.map((emp) => [
        emp.profileId,
        { name: emp.fullName, role: emp.role, employeeId: emp.id },
      ]),
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
      const { startUtc, endUtc } = getUtcBoundsForCalendarDay(
        selectedDateKey,
        selectedStore?.timezone,
      );

      const { data, error: queryError } = await supabase
        .from("staff_shifts")
        .select(
          "id, staff_profile_id, status, clock_in_time, clock_out_time, break_logs, hourly_rate_snapshot, created_at",
        )
        .eq("location_id", selectedStore.id)
        .gte("clock_in_time", startUtc)
        .lte("clock_in_time", endUtc)
        .order("clock_in_time", { ascending: false });

      if (queryError) throw queryError;

      setShifts(data || []);
    } catch (err: any) {
      console.error("Failed to fetch shifts:", err);
      setError(err.message || "Failed to load shifts");
    } finally {
      setIsLoading(false);
    }
  }, [supabase, selectedStore?.id, selectedStore?.timezone, selectedDateKey]);

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
        staffProfileId: shift.staff_profile_id,
        employeeId: employee?.employeeId ?? null,
        employeeName: employee?.name || "Unknown",
        role: employee?.role || "—",
        clockIn: shift.clock_in_time || shift.created_at,
        breakStart: firstBreak?.start || null,
        breakEnd: firstBreak?.end || null,
        clockOut: shift.clock_out_time,
        duration: durationStr,
        status: shift.status,
      };
    }).sort((left, right) => {
      if (!isReviewFocusMode) return 0;

      const leftFocused =
        (left.employeeId ? focusEmployeeIdSet.has(left.employeeId) : false) ||
        focusStaffProfileIdSet.has(left.staffProfileId);
      const rightFocused =
        (right.employeeId ? focusEmployeeIdSet.has(right.employeeId) : false) ||
        focusStaffProfileIdSet.has(right.staffProfileId);

      return Number(rightFocused) - Number(leftFocused);
    });
  }, [
    shifts,
    employeeMap,
    isReviewFocusMode,
    focusEmployeeIdSet,
    focusStaffProfileIdSet,
  ]);

  const focusedShiftCount = useMemo(
    () =>
      shiftsForDisplay.filter(
        (shift) =>
          (shift.employeeId ? focusEmployeeIdSet.has(shift.employeeId) : false) ||
          focusStaffProfileIdSet.has(shift.staffProfileId),
      ).length,
    [shiftsForDisplay, focusEmployeeIdSet, focusStaffProfileIdSet],
  );

  useEffect(() => {
    if (
      !isReviewFocusMode ||
      isLoading ||
      hasAutoFocusedReviewRows ||
      shiftsForDisplay.length === 0
    ) {
      return;
    }

    const focusIndex = shiftsForDisplay.findIndex(
      (shift) =>
        (shift.employeeId ? focusEmployeeIdSet.has(shift.employeeId) : false) ||
        focusStaffProfileIdSet.has(shift.staffProfileId),
    );

    if (focusIndex < 0) {
      return;
    }

    const timeout = setTimeout(() => {
      listRef.current?.scrollToIndex({
        index: focusIndex,
        animated: true,
        viewPosition: 0.12,
      });
      setHasAutoFocusedReviewRows(true);
    }, 250);

    return () => clearTimeout(timeout);
  }, [
    isReviewFocusMode,
    isLoading,
    hasAutoFocusedReviewRows,
    shiftsForDisplay,
    focusEmployeeIdSet,
    focusStaffProfileIdSet,
  ]);

  const summaryCards = useMemo(() => {
    const total = shiftsForDisplay.length;
    const active = shiftsForDisplay.filter(
      (shift) => shift.status === "active",
    ).length;
    const onBreak = shiftsForDisplay.filter(
      (shift) => shift.status === "on_break",
    ).length;
    const completed = shiftsForDisplay.filter(
      (shift) => shift.status === "completed",
    ).length;

    return [
      { label: "Shifts", value: total.toString(), icon: Users },
      { label: "Active", value: active.toString(), icon: Clock3 },
      { label: "On Break", value: onBreak.toString(), icon: MoonStar },
      { label: "Completed", value: completed.toString(), icon: CircleCheckBig },
    ];
  }, [shiftsForDisplay]);

  const onDateChange = (day: DateData) => {
    setSelectedDateKey(day.dateString);
    setHasManualDateSelection(true);
    setDismissReviewFocus(true);
    setIsCalendarOpen(false);
  };

  const calendarTheme = {
    backgroundColor: colors.panel,
    calendarBackground: colors.panel,
    monthTextColor: colors.heading,
    dayTextColor: colors.heading,
    textDisabledColor: colors.muted,
    selectedDayBackgroundColor: colors.teal,
    selectedDayTextColor: colors.onSolid,
    todayTextColor: colors.teal,
    arrowColor: colors.teal,
    textSectionTitleColor: colors.label,
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return (
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              marginRight: 8,
              backgroundColor: colors.teal,
            }}
          />
        );
      case "on_break":
        return (
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              marginRight: 8,
              backgroundColor: colors.teal,
            }}
          />
        );
      default:
        return null;
    }
  };

  const renderShiftItem = ({ item }: { item: ShiftDisplayEntry }) => {
    const isReviewFocusTarget =
      isReviewFocusMode &&
      ((item.employeeId ? focusEmployeeIdSet.has(item.employeeId) : false) ||
        focusStaffProfileIdSet.has(item.staffProfileId));

    return (
    <View
      style={{
        borderRadius: 14,
        borderWidth: isReviewFocusTarget ? 1.5 : 1,
        borderColor: isReviewFocusTarget ? colors.danger + "70" : colors.border,
        backgroundColor: isReviewFocusTarget ? colors.danger + "10" : colors.card,
        padding: 12,
        marginBottom: 8,
        gap: 8,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
          {getStatusBadge(item.status)}
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              style={{ fontSize: 14, fontWeight: "700", color: colors.heading }}
              numberOfLines={1}
            >
              {item.employeeName}
            </Text>
            <Text
              style={{ fontSize: 11, color: colors.label }}
              numberOfLines={1}
            >
              {item.role !== "—" ? item.role : "Employee"}
            </Text>
          </View>
        </View>
        <View
          style={{
            borderRadius: 999,
            paddingHorizontal: 8,
            paddingVertical: 4,
            backgroundColor:
              item.status === "active"
                ? colors.teal + "18"
                : item.status === "on_break"
                  ? colors.teal + "14"
                  : colors.panel,
            borderWidth: 1,
            borderColor:
              item.status === "active"
                ? colors.teal + "45"
                : item.status === "on_break"
                  ? colors.teal + "40"
                  : colors.border,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {isReviewFocusTarget ? (
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "800",
                  color: colors.danger,
                }}
              >
                Review
              </Text>
            ) : null}
            <Text
              style={{
                fontSize: 10,
                fontWeight: "700",
                color:
                  item.status === "active"
                    ? colors.teal
                    : item.status === "on_break"
                      ? colors.teal
                      : colors.label,
              }}
            >
              {item.status === "active"
                ? "Active"
                : item.status === "on_break"
                  ? "On Break"
                  : "Completed"}
            </Text>
          </View>
        </View>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <View
          style={{
            flexGrow: 1,
            flexBasis: 120,
            borderRadius: 10,
            padding: 8,
            backgroundColor: colors.panel,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text
            style={{
              fontSize: 9,
              color: colors.muted,
              fontWeight: "700",
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Clock In
          </Text>
          <Text
            style={{
              fontSize: 12,
              color: colors.heading,
              fontWeight: "700",
              marginTop: 2,
            }}
          >
            {format(new Date(item.clockIn), "p")}
          </Text>
        </View>
        <View
          style={{
            flexGrow: 1,
            flexBasis: 100,
            borderRadius: 10,
            padding: 8,
            backgroundColor: colors.panel,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text
            style={{
              fontSize: 9,
              color: colors.muted,
              fontWeight: "700",
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Break
          </Text>
          <Text
            style={{
              fontSize: 12,
              color: colors.heading,
              fontWeight: "700",
              marginTop: 2,
            }}
          >
            {item.breakStart ? format(new Date(item.breakStart), "p") : "—"}
            {item.breakEnd ? ` - ${format(new Date(item.breakEnd), "p")}` : ""}
          </Text>
        </View>
        <View
          style={{
            flexGrow: 1,
            flexBasis: 100,
            borderRadius: 10,
            padding: 8,
            backgroundColor: colors.panel,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text
            style={{
              fontSize: 9,
              color: colors.muted,
              fontWeight: "700",
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Clock Out
          </Text>
          <Text
            style={{
              fontSize: 12,
              color: colors.heading,
              fontWeight: "700",
              marginTop: 2,
            }}
          >
            {item.clockOut ? format(new Date(item.clockOut), "p") : "—"}
          </Text>
        </View>
        <View
          style={{
            flexGrow: 1,
            flexBasis: 100,
            borderRadius: 10,
            padding: 8,
            backgroundColor: colors.panel,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text
            style={{
              fontSize: 9,
              color: colors.muted,
              fontWeight: "700",
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Duration
          </Text>
          <Text
            style={{
              fontSize: 12,
              color: colors.teal,
              fontWeight: "800",
              marginTop: 2,
            }}
          >
            {item.duration}
          </Text>
        </View>
      </View>
    </View>
    );
  };

  const renderListHeader = () => (
    <View style={{ gap: 10, marginBottom: 10 }}>
      {isReviewFocusMode ? (
        <View
          style={{
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.danger + "45",
            backgroundColor: colors.danger + "12",
            paddingHorizontal: 12,
            paddingVertical: 10,
            gap: 4,
          }}
        >
          <Text
            style={{ fontSize: 11, fontWeight: "800", color: colors.danger }}
          >
            End of Day review focus
          </Text>
          <Text style={{ fontSize: 11, color: colors.label, lineHeight: 16 }}>
            {focusedShiftCount > 0
              ? `${focusedShiftCount} unresolved staff row${focusedShiftCount > 1 ? "s are" : " is"} highlighted below.`
              : "Review mode is active for unresolved staff from End of Day."}
          </Text>
        </View>
      ) : null}
      <View
        style={{
          borderRadius: 18,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.panel,
          padding: 14,
          gap: 12,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <View style={{ flex: 1, gap: 6 }}>
            <View
              style={{
                alignSelf: "flex-start",
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 999,
                backgroundColor: colors.teal + "18",
                borderWidth: 1,
                borderColor: colors.teal + "45",
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "700",
                  color: colors.teal,
                  letterSpacing: 0.6,
                }}
              >
                Timeclock
              </Text>
            </View>
            <Text
              style={{
                fontSize: 20,
                fontWeight: "800",
                color: colors.heading,
                lineHeight: 24,
              }}
            >
              Daily Shift Report
            </Text>
            <Text style={{ fontSize: 12, color: colors.label, lineHeight: 17 }}>
              Review shifts, breaks, and clock-out status by day.
            </Text>
          </View>

          <TouchableOpacity
            onPress={fetchShifts}
            disabled={isLoading}
            style={{
              minWidth: 100,
              borderRadius: 14,
              paddingHorizontal: 12,
              paddingVertical: 10,
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <RefreshCw
              color={isLoading ? colors.muted : colors.label}
              size={16}
            />
            <Text
              style={{
                fontSize: 11,
                fontWeight: "700",
                color: colors.label,
                marginTop: 4,
              }}
            >
              Refresh
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {summaryCards.map((card) => {
            const Icon = card.icon;
            return (
              <View
                key={card.label}
                style={{
                  flexGrow: 1,
                  flexBasis: 120,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  padding: 10,
                  gap: 6,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      color: colors.muted,
                      fontWeight: "700",
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    {card.label}
                  </Text>
                  <Icon size={14} color={colors.teal} />
                </View>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "800",
                    color: colors.heading,
                  }}
                >
                  {card.value}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.panel,
          paddingHorizontal: 12,
          paddingVertical: 10,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{ fontSize: 12, color: colors.heading, fontWeight: "700" }}
          >
            Selected Date
          </Text>
          <Text style={{ fontSize: 11, color: colors.label, marginTop: 2 }}>
            Use the calendar to switch report days.
          </Text>
        </View>
        <Popover
          isVisible={isCalendarOpen}
          onRequestClose={() => setIsCalendarOpen(false)}
          from={
            <TouchableOpacity
              onPress={() => setIsCalendarOpen(true)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                backgroundColor: colors.teal + "18",
                borderWidth: 1,
                borderColor: colors.teal + "45",
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderRadius: 999,
              }}
            >
              <CalendarIcon color={colors.teal} size={16} />
              <Text style={{ color: colors.heading, fontWeight: "700" }}>
                {format(parseDateKeyForDisplay(selectedDateKey), "PPP")}
              </Text>
            </TouchableOpacity>
          }
        >
          <View
            style={{
              width: 320,
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            <Calendar
              current={selectedDateKey}
              onDayPress={onDateChange}
              theme={calendarTheme}
              markedDates={{
                [selectedDateKey]: {
                  selected: true,
                  selectedColor: colors.teal,
                },
              }}
            />
          </View>
        </Popover>
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-screen">
      <View className="flex-1 p-4 gap-4">
        <TouchableOpacity
          onPress={() =>
            router.canGoBack()
              ? router.back()
              : replaceRoute("(auth)", "pin-login")
          }
          style={{
            alignSelf: "flex-start",
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 10,
            paddingVertical: 8,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.panel,
          }}
        >
          <ArrowLeft color={colors.label} size={18} />
          <Text
            style={{ color: colors.label, fontSize: 11, fontWeight: "700" }}
          >
            Back
          </Text>
        </TouchableOpacity>

        {error && (
          <View
            style={{
              backgroundColor: colors.danger + "15",
              borderWidth: 1,
              borderColor: colors.danger + "40",
              borderRadius: 12,
              padding: 12,
            }}
          >
            <Text
              style={{ color: colors.danger, fontSize: 12, fontWeight: "600" }}
            >
              {error}
            </Text>
          </View>
        )}

        <View
          style={{
            flex: 1,
            backgroundColor: colors.panel,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: "hidden",
          }}
        >
          <FlatList
            ref={listRef}
            data={shiftsForDisplay}
            keyExtractor={(item) => item.id}
            renderItem={renderShiftItem}
            ListHeaderComponent={renderListHeader}
            contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
            onScrollToIndexFailed={({ index }) => {
              setTimeout(() => {
                listRef.current?.scrollToIndex({
                  index,
                  animated: true,
                  viewPosition: 0.12,
                });
              }, 250);
            }}
            ListEmptyComponent={
              <View
                style={{ paddingVertical: 24, alignItems: "center", gap: 8 }}
              >
                {isLoading ? (
                  <>
                    <ActivityIndicator size="large" color={spinnerColor} />
                    <Text style={{ color: colors.label, fontSize: 12 }}>
                      Loading shifts...
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={{ color: colors.label, fontSize: 12 }}>
                      No shift history found for this date.
                    </Text>
                  </>
                )}
              </View>
            }
            showsVerticalScrollIndicator={false}
          />
        </View>
      </View>
    </View>
  );
};

export default DailyShiftReportScreen;
