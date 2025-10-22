import { getWeekDates, mockShifts, Shift } from "@/lib/mock-data";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { ShiftChip } from "./ShiftChip";

interface ScheduleGridProps {
  startDate: Date;
  viewMode: "employee" | "role";
  onShiftClick: (shift: Shift) => void;
}

const ScheduleGrid: React.FC<ScheduleGridProps> = ({
  startDate,
  viewMode,
  onShiftClick,
}) => {
  const weekDates = getWeekDates(startDate);
  const [shifts] = useState<Shift[]>(mockShifts);
  const { employees } = useEmployeeStore();

  const getShiftsForDateAndEmployee = (date: Date, employeeId: string) => {
    const dateStr = date.toISOString().split("T")[0];
    return shifts.filter(
      (s) => s.date === dateStr && s.employeeId === employeeId
    );
  };

  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <View className="flex-1">
      <ScrollView horizontal>
        <View style={{ minWidth: 1200 }}>
          {/* Header */}
          <View className="flex-row bg-gray-800 sticky top-0 z-10">
            <View className="w-48 bg-[#303030] p-3 border-r border-gray-700">
              <Text className="text-sm font-semibold text-white">
                {viewMode === "employee" ? "Employee" : "Role"}
              </Text>
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
            {employees.map((employee) => (
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
                  return (
                    <View
                      key={`${employee.id}-${i}`}
                      className="w-40 bg-[#303030] p-2 min-h-[80px] border-r border-b border-gray-700"
                    >
                      <View className="space-y-2">
                        {dayShifts.map((shift) => (
                          <ShiftChip
                            key={shift.id}
                            role={shift.role}
                            start={shift.start}
                            end={shift.end}
                            requiredCount={shift.requiredCount}
                            wage={employee.baseWage} // This property does not exist on EmployeeProfile, will need to be added or handled
                            isOpen={shift.isOpen}
                            onClick={() => onShiftClick(shift)}
                          />
                        ))}
                      </View>
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
