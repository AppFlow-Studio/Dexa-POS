import { Role, Shift } from "@/lib/types";
import { EmployeeProfile } from "@/stores/useEmployeeStore";
import { useScheduleStore } from "@/stores/useScheduleStore";
import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { ShiftChip } from "./ShiftChip";

function getWeekDates(startDate: Date): Date[] {
  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    dates.push(date);
  }
  return dates;
}

interface ScheduleGridProps {
  startDate: Date;
  employees: EmployeeProfile[];
  selectedRoles: Role[];
  onShiftClick: (shift: Shift) => void;
  onAddShift: (employeeId: string, date: string) => void;
}

const ScheduleGrid: React.FC<ScheduleGridProps> = ({
  startDate,
  employees,
  selectedRoles,
  onShiftClick,
  onAddShift,
}) => {
  const weekDates = getWeekDates(startDate);
  const { shifts } = useScheduleStore();

  const getShiftsForDateAndEmployee = (date: Date, employeeId: string) => {
    const dateStr = date.toISOString().split("T")[0];
    const dayShifts = shifts.filter(
      (s) => s.date === dateStr && s.employeeId === employeeId
    );

    if (selectedRoles.length === 0) {
      return dayShifts;
    }

    return dayShifts.filter(shift => selectedRoles.includes(shift.role));
  };

  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <View className="flex-1">
      <ScrollView horizontal>
        <View style={{ minWidth: 1200 }}>
          {/* Header */}
          <View className="flex-row bg-gray-800 sticky top-0 z-10">
            <View className="w-48 bg-[#303030] p-3 border-r border-gray-700">
              <Text className="text-sm font-semibold text-white">Employee</Text>
            </View>
            {weekDates.map((date, i) => (
              <View
                key={i}
                className="w-40 bg-[#303030] p-3 text-center border-r border-gray-700 items-center"
              >
                <Text className="text-xs text-gray-400">{dayNames[i]}</Text>
                <Text className="text-sm font-semibold text-white">
                  {date.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </Text>
              </View>
            ))}
          </View>

          {/* Grid Body */}
          <ScrollView>
            {employees.map((employee: EmployeeProfile) => (
              <View key={employee.id} className="flex-row">
                <View className="w-48 bg-[#303030] p-3 flex-row items-center border-r border-gray-700 border-b">
                  <View>
                    <Text className="text-sm font-medium text-white">
                      {employee.fullName}
                    </Text>
                    <Text className="text-xs text-gray-400">
                      {employee.role}
                    </Text>
                  </View>
                </View>
                {weekDates.map((date, i) => {
                  const dayShifts = getShiftsForDateAndEmployee(
                    date,
                    employee.id
                  );
                  const dateStr = date.toISOString().split("T")[0];
                  return (
                    <View
                      key={`${employee.id}-${i}`}
                      className="w-40 bg-[#303030] p-2 min-h-[80px] border-r border-b border-gray-700"
                    >
                      {dayShifts.length > 0 ? (
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
                          className="flex-1 h-full"
                        />
                      )}
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
