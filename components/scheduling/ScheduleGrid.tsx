import { Role, Shift } from "@/lib/types";
import { EmployeeProfile } from "@/stores/useEmployeeStore";
import {
  addDays,
  differenceInHours,
  format,
  isWithinInterval,
  parse,
  startOfDay,
} from "date-fns";
import { Plus } from "lucide-react-native";
import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { ShiftChip } from "./ShiftChip";
import { isWithinInterval, startOfDay, addDays, format } from "date-fns";

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
}) => {
  const weekDates = getWeekDates(startDate);

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
    return employeeShifts.reduce((total, shift) => {
      const start = parse(shift.startTime, "HH:mm", new Date());
      const end = parse(shift.endTime, "HH:mm", new Date());
      return total + differenceInHours(end, start);
    }, 0);
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
          <ScrollView>
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

                  return (
                    <View
                      key={`${employee.id}-${i}`}
                      className={`w-40 p-2 min-h-[80px] border-r border-b border-gray-700 ${
                        isDateInRange ? "bg-[#303030]" : "bg-[#363636]"
                      }`}
                    >
                      {isDateInRange ? (
                        dayShifts.length > 0 ? (
                          <View className="gap-y-2">
                            {dayShifts.map((shift) => (
                              <ShiftChip
                                key={shift.id}
                                role={shift.role}
                                start={shift.startTime}
                                end={shift.endTime}
                                requiredCount={shift.requiredCount}
                                wage={employee.baseWage}
                                isOpen={shift.isOpen}
                                onClick={() => onShiftClick(shift)}
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
                    </View>
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
