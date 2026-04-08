import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDropZoneContext } from "@/contexts/DropZoneContext";
import { TemplateConflictSummary } from "@/lib/rules";
import {
  PTORequest,
  Role,
  ScheduleTemplate,
  Shift,
  ShiftRequest,
  TemplateShift,
} from "@/lib/types";
import { EmployeeProfile } from "@/stores/useEmployeeStore";
import { useScheduleStore } from "@/stores/useScheduleStore";
import {
  addDays,
  areIntervalsOverlapping,
  differenceInMinutes,
  format,
  getDay,
  isValid,
  isWithinInterval,
  parseISO,
  startOfDay,
} from "date-fns";
import { colors } from "@/lib/theme";
import { Plus } from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
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
import OverlayShiftChip from "./OverlayShiftChip";

const ScheduleCell = React.memo(
  ({
    children,
    employeeId,
    dateStr,
    isDateInRange,
    ptoOnDate,
    dropOnDate,
    ancestor,
    overlayShifts,
    conflictingShiftTempIds,
  }: {
    children: React.ReactNode;
    employeeId: string;
    dateStr: string;
    isDateInRange: boolean;
    ptoOnDate: PTORequest | undefined;
    dropOnDate: ShiftRequest | undefined;
    ancestor: React.RefObject<ScrollView>;
    overlayShifts: TemplateShift[];
    conflictingShiftTempIds: Set<string>;
    isApplyTemplateBarVisible?: boolean;
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
        borderColor: isHovered ? colors.success : colors.border, // Green when hovered, otherwise gray
        borderWidth: isHovered ? 2 : 1,
        zIndex: 1, // Keep cell z-index low
      };
    });

    return (
      <Animated.View
        ref={viewRef}
        style={animatedStyle}
        className={`w-40 p-2 min-h-[80px] border-r border-b ${
          isDateInRange ? "bg-panel" : "bg-card"
        } ${ptoOnDate ? "bg-purple-900/30" : ""} ${dropOnDate ? "bg-orange-900/30" : ""}`}
      >
        {overlayShifts.map((shift) => (
          <OverlayShiftChip
            key={shift.tempId}
            shift={shift}
            isConflicting={conflictingShiftTempIds.has(shift.tempId)}
          />
        ))}
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
  overlayTemplateId?: string | null;
  templates?: ScheduleTemplate[];
  templateConflictSummary?: TemplateConflictSummary;
  isApplyTemplateBarVisible: boolean;
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
  overlayTemplateId,
  templates,
  templateConflictSummary,
  isApplyTemplateBarVisible,
}) => {
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const { dropResult } = useDropZoneContext();
  const weekDates = getWeekDates(startDate);
  const updateShift = useScheduleStore((state) => state.updateShift);
  const dropRequests = useScheduleStore((state) => state.dropRequests);
  const scrollViewRef = useRef<ScrollView>(null);

  const overlayTemplate = templates?.find((t) => t.id === overlayTemplateId);

  const conflictingShiftTempIds = useMemo(() => {
    if (!templateConflictSummary) return new Set<string>();
    return new Set(
      templateConflictSummary.conflictDetails.map(
        (cd) => cd.templateShift.tempId
      )
    );
  }, [templateConflictSummary]);

  const getShiftsForDateAndEmployee = (date: Date, employeeId: string) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const dayShifts = shifts.filter(
      (s) => s.date === dateStr && s.employeeId === employeeId
    );

    if (selectedRoles.length === 0) {
      return dayShifts;
    }

    return dayShifts.filter((shift) => selectedRoles.includes(shift.role));
  };

  const getOverlayShiftsForDate = (date: Date, employeeId: string) => {
    if (!overlayTemplate) return [];
    const dayOfWeek = getDay(date);
    const isCurrentDateInRange = isWithinInterval(startOfDay(date), {
      start: startOfDay(periodStartDate),
      end: startOfDay(periodEndDate),
    });

    if (!isCurrentDateInRange) {
      return [];
    }

    return overlayTemplate.shifts.filter(
      (shift) =>
        shift.dayOfWeek === dayOfWeek && shift.employeeId === employeeId
    );
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

      if (end < start) {
        end = addDays(end, 1);
      }

      return total + differenceInMinutes(end, start);
    }, 0);

    return totalMinutes / 60;
  };

  const handleShiftDrop = (
    draggedShift: Shift,
    newEmployeeId: string,
    newDate: string
  ) => {
    // Check if target cell has PTO
    const targetHasPto = approvedPtoRequests.some(
      (pto) =>
        pto.employeeId === newEmployeeId &&
        isWithinInterval(startOfDay(parseISO(newDate)), {
          start: startOfDay(new Date(pto.startDate)),
          end: startOfDay(new Date(pto.endDate)),
        })
    );

    // Check if target cell has approved drop
    const targetHasApprovedDrop = dropRequests.some(
      (dr) =>
        dr.status === "approved" &&
        dr.shift.employeeId === newEmployeeId &&
        dr.shift.date === newDate
    );

    if (targetHasPto || targetHasApprovedDrop) {
      if (targetHasPto) {
        setConflictMessage("This employee is on PTO for this day.");
      } else {
        setConflictMessage(
          "This employee has dropped their shift for this day."
        );
      }
      dropResult.value = "failure";
      return;
    }

    const startTimeStr = format(parseISO(draggedShift.startTime), "HH:mm:ss");
    const endTimeStr = format(parseISO(draggedShift.endTime), "HH:mm:ss");
    const newStartTime = `${newDate}T${startTimeStr}`;
    const newEndTime = `${newDate}T${endTimeStr}`;

    const targetEmployeeShifts = shifts.filter(
      (s) =>
        s.employeeId === newEmployeeId &&
        s.date === newDate &&
        s.id !== draggedShift.id
    );

    const draggedShiftInterval = {
      start: parseISO(newStartTime),
      end: parseISO(newEndTime),
    };

    const hasOverlap = targetEmployeeShifts.some((existingShift) =>
      areIntervalsOverlapping(draggedShiftInterval, {
        start: parseISO(existingShift.startTime),
        end: parseISO(existingShift.endTime),
      })
    );

    if (hasOverlap) {
      setConflictMessage("This employee already has an overlapping shift.");
      dropResult.value = "failure";
    } else {
      updateShift(scheduleId, scheduleType, {
        ...draggedShift,
        employeeId: newEmployeeId,
        date: newDate,
        startTime: newStartTime,
        endTime: newEndTime,
        // If the shift was open, assign it as confirmed now
        status:
          draggedShift.status === "open" ? "confirmed" : draggedShift.status,
      });
      dropResult.value = "success";
    }
  };

  return (
    // Ensure 'relative' so the absolute overlay positions relative to this container if needed,
    // though normally pageX/Y are screen absolute. If using pageX, this container should be top-level.
    <View className="flex-1 bg-screen relative">
      <AlertDialog
        open={!!conflictMessage}
        onOpenChange={(open) => !open && setConflictMessage(null)}
      >
        <AlertDialogContent className="bg-panel border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              Shift Conflict
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              {conflictMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onPress={() => setConflictMessage(null)}
              className="bg-blue-600"
            >
              <Text className="text-white">OK</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* The Overlay is placed HERE, as a direct child of the root View, ABOVE the ScrollViews */}
      {/* <DragOverlay /> */}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: isApplyTemplateBarVisible ? 80 : 0,
        }}
      >
        <View>
          {/* Header */}
          <View className="flex-row bg-screen sticky top-0 z-10">
            <View className="w-48 bg-screen p-3 border-r border-gray-700">
              <Text className="text-sm font-semibold text-white">Employee</Text>
            </View>
            {weekDates.map((date, i) => (
              <View
                key={i}
                className="w-40 bg-screen p-3 text-center border-r border-gray-700 items-center"
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
                <View className="w-48 bg-panel p-3 flex-row items-center border-r border-border border-b">
                  <View className="w-12 h-12 rounded-full bg-purple-500 items-center justify-center mr-3">
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
                  const overlayShifts = getOverlayShiftsForDate(
                    date,
                    employee.id
                  );
                  const dateStr = format(date, "yyyy-MM-dd");

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

                  // Find approved drop request for this employee on this date
                  const dropOnDate = dropRequests.find(
                    (dr) =>
                      dr.status === "approved" &&
                      dr.shift.employeeId === employee.id &&
                      dr.shift.date === dateStr
                  );

                  return (
                    <ScheduleCell
                      key={`${employee.id}-${i}`}
                      employeeId={employee.id}
                      dateStr={dateStr}
                      isDateInRange={isDateInRange}
                      ptoOnDate={ptoOnDate}
                      dropOnDate={dropOnDate}
                      ancestor={scrollViewRef as React.RefObject<ScrollView>}
                      overlayShifts={overlayShifts}
                      conflictingShiftTempIds={conflictingShiftTempIds}
                    >
                      {isDateInRange ? (
                        ptoOnDate ? (
                          <View className="flex-1 h-full w-full items-center justify-center">
                            <Text className="font-bold text-purple-400">
                              PTO
                            </Text>
                          </View>
                        ) : dropOnDate ? (
                          <View className="flex-1 h-full w-full items-center justify-center">
                            <Text className="font-bold text-orange-400">
                              Drop
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
                        ) : overlayShifts.length === 0 ? (
                          <TouchableOpacity
                            onPress={() => onAddShift(employee.id, dateStr)}
                            className="flex-1 h-full w-full items-center justify-center border-2 border-dashed border-gray-600 rounded-lg"
                          >
                            <Plus size={16} color={colors.label} />
                            <Text className="text-gray-400 ml-2">
                              Add Shift
                            </Text>
                          </TouchableOpacity>
                        ) : null
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
