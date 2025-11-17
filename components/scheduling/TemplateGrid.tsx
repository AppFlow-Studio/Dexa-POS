import { TemplateShift } from "@/lib/types";
import { EmployeeProfile } from "@/stores/useEmployeeStore";
import {
  addDays,
  differenceInMinutes,
  format,
  getDay,
  isValid,
  parseISO,
} from "date-fns";
import { Plus } from "lucide-react-native";
import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { DraggableTemplateShift } from "./DraggableTemplateShift";

interface TemplateGridProps {
  shifts: TemplateShift[];
  employees: EmployeeProfile[];
  onShiftPress: (shift: TemplateShift) => void;
  onAddShift: (employeeId: string, dayOfWeek: number) => void;
}

const startOfWeek = new Date("2024-01-01T00:00:00.000Z");

function getWeekDates(): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(startOfWeek, i));
}

const TemplateCell = ({ children }: { children: React.ReactNode }) => (
  <View className="flex-1 min-w-[160px] p-2 border-r border-b border-gray-700 bg-[#2a2a2a]">
    {children}
  </View>
);

const TemplateGrid: React.FC<TemplateGridProps> = ({
  shifts,
  employees,
  onShiftPress,
  onAddShift,
}) => {
  const weekDates = getWeekDates();

  const getShiftsForDayAndEmployee = (
    dayOfWeek: number,
    employeeId: string
  ) => {
    return shifts.filter(
      (s) => s.dayOfWeek === dayOfWeek && s.employeeId === employeeId
    );
  };

  const calculateTotalHours = (employeeId: string) => {
    const totalMinutes = shifts
      .filter((s) => s.employeeId === employeeId)
      .reduce((total, shift) => {
        if (!shift.startTime || !shift.endTime) return total;
        const start = parseISO(shift.startTime);
        const end = parseISO(shift.endTime);
        if (!isValid(start) || !isValid(end)) return total;
        return total + differenceInMinutes(end, start);
      }, 0);
    return (totalMinutes / 60).toFixed(1);
  };

  const handleShiftDrop = (
    draggedShift: TemplateShift,
    newDayOfWeek: number
  ) => {
    console.log(`Shift ${draggedShift.tempId} dropped on day ${newDayOfWeek}`);
  };

  return (
    <View className="flex-1 bg-[#1c1c1c] rounded-lg overflow-hidden">
      <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
        <View className="flex-1 flex-col">
          {/* Header */}
          <View className="flex-row bg-[#212121] sticky top-0 z-10">
            <View className="w-56 bg-[#212121] p-4 border-r border-b border-gray-700">
              <Text className="text-base font-bold text-white">Employee</Text>
            </View>
            {weekDates.map((date, i) => (
              <View
                key={i}
                className="flex-1 min-w-[160px] bg-[#212121] p-3 text-center border-r border-b border-gray-700 items-center justify-center"
              >
                <Text className="text-sm font-semibold text-gray-300">
                  {format(date, "E")}
                </Text>
              </View>
            ))}
          </View>

          {/* Grid Body */}
          <ScrollView>
            {employees.map((employee) => (
              <View key={employee.id} className="flex-row items-stretch">
                <View className="w-56 bg-[#2a2a2a] p-3 flex-row items-center border-r border-b border-gray-700">
                  <View className="w-12 h-12 rounded-full bg-blue-600 items-center justify-center mr-4 shadow-md">
                    <Text className="text-white font-bold text-xl">
                      {employee.fullName
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text
                      className="text-lg font-semibold text-white"
                      numberOfLines={1}
                    >
                      {employee.fullName}
                    </Text>
                    <Text className="text-sm text-gray-400">
                      {employee.role}
                    </Text>
                    <Text className="text-xs text-gray-500 mt-1">
                      Total: {calculateTotalHours(employee.id)}h
                    </Text>
                  </View>
                </View>
                {weekDates.map((date) => {
                  const dayOfWeek = getDay(date);
                  const dayShifts = getShiftsForDayAndEmployee(
                    dayOfWeek,
                    employee.id
                  );
                  return (
                    <TemplateCell key={`${employee.id}-${dayOfWeek}`}>
                      <View className="flex-1 justify-center">
                        {dayShifts.length > 0 ? (
                          <View className="gap-y-2">
                            {dayShifts.map((shift) => (
                              <DraggableTemplateShift
                                key={shift.tempId}
                                shift={shift}
                                onShiftClick={onShiftPress}
                                onShiftDrop={handleShiftDrop}
                              />
                            ))}
                          </View>
                        ) : (
                          <TouchableOpacity
                            onPress={() => onAddShift(employee.id, dayOfWeek)}
                            className="flex-1 h-full w-full items-center justify-center border-2 border-dashed border-gray-600 rounded-lg hover:bg-gray-700/50 transition-colors"
                          >
                            <Plus size={20} color="#6b7280" />
                          </TouchableOpacity>
                        )}
                      </View>
                    </TemplateCell>
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

export default TemplateGrid;
