import { useDropZoneContext } from "@/contexts/DropZoneContext";
import { PTORequest, Role, Shift } from "@/lib/types";
import { EmployeeProfile } from "@/stores/useEmployeeStore";
import { useScheduleStore } from "@/stores/useScheduleStore";
import {
  addDays,
  differenceInMinutes,
  format,
  isValid,
  isWithinInterval,
  parseISO,
  startOfDay,
} from "date-fns";
import { Plus } from "lucide-react-native";
import React, { useEffect, useRef } from "react";
import {
  findNodeHandle,
  ScrollView,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";
import Animated, { runOnUI, useAnimatedStyle } from "react-native-reanimated";
import { DraggableShift } from "./DraggableShift";

const ScheduleCell = React.memo(
  ({
    children,
    employeeId,
    dateStr,
    isDateInRange,
    ptoOnDate,
    ancestor,
  }: {
    children: React.ReactNode;
    employeeId: string;
    dateStr: string;
    isDateInRange: boolean;
    ptoOnDate: PTORequest | undefined;
    ancestor: React.RefObject<ScrollView>;
  }) => {
    const { dropZoneLayouts, hoveredDropZoneKey, draggingCellKey } =
      useDropZoneContext();
    const cellKey = `${employeeId}-${dateStr}`;
    const viewRef = useRef<Animated.View>(null);

    useEffect(() => {
      const measure = () => {
        if (viewRef.current && ancestor.current) {
          const ancestorNodeHandle = findNodeHandle(ancestor.current);
          const viewNodeHandle = findNodeHandle(viewRef.current);

          if (ancestorNodeHandle && viewNodeHandle) {
            UIManager.measureLayout(
              viewNodeHandle,
              ancestorNodeHandle,
              () => {}, // onFail
              (x, y, width, height) => {
                if (width > 0 && height > 0) {
                  runOnUI(() => {
                    "worklet";
                    const newLayouts = { ...dropZoneLayouts.value };
                    newLayouts[cellKey] = { x, y, width, height };
                    dropZoneLayouts.value = newLayouts;
                  })();
                }
              }
            );
          }
        }
      };

      // Measure after a short delay to ensure layout is stable
      const timeoutId = setTimeout(measure, 150);
      return () => clearTimeout(timeoutId);
    }, [ancestor, cellKey, dropZoneLayouts]);

    const animatedStyle = useAnimatedStyle(() => {
      const isHovered = hoveredDropZoneKey.value === cellKey;
      const isDragging = draggingCellKey.value === cellKey;
      return {
        borderColor: isHovered ? "#22c55e" : "#4b5563", // Green when hovered, otherwise gray
        borderWidth: isHovered ? 2 : 1,
        zIndex: isDragging ? 100 : 1,
      };
    });

    return (
      <Animated.View
        ref={viewRef}
        style={animatedStyle}
        className={`w-40 p-2 min-h-[80px] border-r border-b ${
          isDateInRange ? "bg-[#303030]" : "bg-[#363636]"
        } ${ptoOnDate ? "bg-purple-900/30" : ""}`}
      >
        {children}
      </Animated.View>
    );
  }
);

function getWeekDates(startDate: Date): Date[] {
  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    dates.push(addDays(startDate, i));
  }
  return dates;
}

interface ScheduleGridProps {
  startDate: Date;
  employees: EmployeeProfile[];
  selectedRoles: Role[];
  shifts: Shift[];
  periodStartDate: Date;
  periodEndDate: Date;
  onShiftClick: (shift: Shift) => void;
  onAddShift: (employeeId: string, date: string) => void;
  approvedPtoRequests: PTORequest[];
  scheduleId: string;
  scheduleType: "period" | "week";
}

const ScheduleGrid: React.FC<ScheduleGridProps> = ({
  startDate,
  employees,
  selectedRoles,
  shifts,
  periodStartDate,
  periodEndDate,
  onShiftClick,
  onAddShift,
  approvedPtoRequests,
  scheduleId,
  scheduleType,
}) => {
  const weekDates = getWeekDates(startDate);
  const updateShift = useScheduleStore((state) => state.updateShift);
  const scrollViewRef = useRef<ScrollView>(null);

  const getShiftsForDateAndEmployee = (date: Date, employeeId: string) => {
    const dateStr = date.toISOString().split("T")[0];
    const dayShifts = shifts.filter(
      (s) => s.date === dateStr && s.employeeId === employeeId
    );

    if (selectedRoles.length === 0) {
      return dayShifts;
    }

    return dayShifts.filter((shift) => selectedRoles.includes(shift.role));
  };

  const calculateTotalHours = (employeeId: string) => {
    const employeeShifts = shifts.filter((s) => s.employeeId === employeeId);
    const totalMinutes = employeeShifts.reduce((total, shift) => {
      if (!shift.startTime || !shift.endTime) {
        return total;
      }
      let start = parseISO(shift.startTime);
      let end = parseISO(shift.endTime);

      if (!isValid(start) || !isValid(end)) {
        return total;
      }

      // Handle overnight shifts
      if (end < start) {
        end = addDays(end, 1);
      }

      return total + differenceInMinutes(end, start);
    }, 0);

    return totalMinutes / 60;
  };

  const handleShiftDrop = (
    shift: Shift,
    newEmployeeId: string,
    newDate: string
  ) => {
    updateShift(scheduleId, scheduleType, {
      ...shift,
      employeeId: newEmployeeId,
      date: newDate,
    });
  };

  return (
    <View className="flex-1 bg-[#212121]">
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          {/* Header */}
          <View className="flex-row bg-[#212121] sticky top-0 z-10">
            <View className="w-48 bg-[#212121] p-3 border-r border-gray-700">
              <Text className="text-sm font-semibold text-white">Employee</Text>
            </View>
            {weekDates.map((date, i) => (
              <View
                key={i}
                className="w-40 bg-[#212121] p-3 text-center border-r border-gray-700 items-center"
              >
                <Text className="text-xs text-gray-400 uppercase">
                  {format(date, "E")}
                </Text>
                <Text className="text-lg font-semibold text-white">
                  {format(date, "d")}
                </Text>
              </View>
            ))}
          </View>

          {/* Grid Body */}
          <ScrollView ref={scrollViewRef}>
            {employees.map((employee: EmployeeProfile) => (
              <View key={employee.id} className="flex-row">
                <View className="w-48 bg-[#303030] p-3 flex-row items-center border-r border-gray-700 border-b">
                  <View className="w-12 h-12 rounded-full bg-red-500 items-center justify-center mr-3">
                    <Text className="text-white font-bold text-lg">
                      {employee.fullName
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </Text>
                  </View>
                  <View>
                    <Text className="text-base font-medium text-white">
                      {employee.fullName.split(" ")[0]}
                    </Text>
                    <Text className="text-sm text-gray-400">
                      {employee.role}
                    </Text>
                    <Text className="text-xs text-gray-500 mt-1">
                      Total: {calculateTotalHours(employee.id)}h
                    </Text>
                  </View>
                </View>
                {weekDates.map((date, i) => {
                  const dayShifts = getShiftsForDateAndEmployee(
                    date,
                    employee.id
                  );
                  const dateStr = date.toISOString().split("T")[0];
                  const isDateInRange = isWithinInterval(startOfDay(date), {
                    start: startOfDay(periodStartDate),
                    end: startOfDay(periodEndDate),
                  });

                  const ptoOnDate = approvedPtoRequests.find(
                    (pto) =>
                      pto.employeeId === employee.id &&
                      isWithinInterval(startOfDay(date), {
                        start: startOfDay(new Date(pto.startDate)),
                        end: startOfDay(new Date(pto.endDate)),
                      })
                  );

                  return (
                    <ScheduleCell
                      key={`${employee.id}-${i}`}
                      employeeId={employee.id}
                      dateStr={dateStr}
                      isDateInRange={isDateInRange}
                      ptoOnDate={ptoOnDate}
                      ancestor={scrollViewRef as React.RefObject<ScrollView>}
                    >
                      {isDateInRange ? (
                        ptoOnDate ? (
                          <View className="flex-1 h-full w-full items-center justify-center">
                            <Text className="font-bold text-purple-400">
                              PTO
                            </Text>
                          </View>
                        ) : dayShifts.length > 0 ? (
                          <View className="gap-y-2">
                            {dayShifts.map((shift) => (
                              <DraggableShift
                                key={shift.id}
                                shift={shift}
                                onShiftClick={onShiftClick}
                                wage={employee.baseWage}
                                onShiftDrop={handleShiftDrop}
                              />
                            ))}
                          </View>
                        ) : (
                          <TouchableOpacity
                            onPress={() => onAddShift(employee.id, dateStr)}
                            className="flex-1 h-full w-full items-center justify-center border-2 border-dashed border-gray-600 rounded-lg"
                          >
                            <Plus size={16} color="#9CA3AF" />
                            <Text className="text-gray-400 ml-2">
                              Add Shift
                            </Text>
                          </TouchableOpacity>
                        )
                      ) : null}
                    </ScheduleCell>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
};

export default ScheduleGrid;
