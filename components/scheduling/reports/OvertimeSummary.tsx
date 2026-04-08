import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { colors } from "@/lib/theme";
import { AlertTriangle } from "lucide-react-native";
import React from "react";
import { Text, View } from "react-native";

const mockData = [
  {
    employee: "Sarah Chen",
    regularHours: 40,
    overtimeHours: 2,
    totalHours: 42,
    cost: 726,
  },
  {
    employee: "Marcus Johnson",
    regularHours: 40,
    overtimeHours: 3.5,
    totalHours: 43.5,
    cost: 814.5,
  },
  {
    employee: "Emma Rodriguez",
    regularHours: 40,
    overtimeHours: 0,
    totalHours: 40,
    cost: 880,
  },
];

const OvertimeSummary = () => {
  const totalOvertimeHours = mockData.reduce(
    (sum, record) => sum + record.overtimeHours,
    0
  );
  const totalOvertimeCost = mockData.reduce(
    (sum, record) =>
      sum + record.overtimeHours * (record.cost / record.totalHours) * 1.5,
    0
  );

  return (
    <Card className="p-6 bg-panel border-border flex-1">
      <View className="mb-6">
        <Text className="text-lg font-semibold text-white mb-1">
          Overtime Summary
        </Text>
        <Text className="text-sm text-gray-400">
          Employees with overtime hours this week
        </Text>
      </View>

      <View className="gap-y-3">
        {mockData
          .filter((record) => record.overtimeHours > 0)
          .map((record, i) => (
            <View
              key={i}
              className="p-4 rounded-lg bg-screen border border-border"
            >
              <View className="flex-row items-center justify-between mb-2">
                <View className="flex-row items-center gap-2">
                  <Text className="font-medium text-white">
                    {record.employee}
                  </Text>
                  {record.overtimeHours > 3 && (
                    <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 flex-row gap-1">
                      <AlertTriangle size={12} color={colors.warning} />
                      <Text className="text-yellow-400">High OT</Text>
                    </Badge>
                  )}
                </View>
                <Text className="text-sm text-gray-400">
                  ${record.cost.toFixed(2)}
                </Text>
              </View>
              <View className="flex-row justify-between text-sm">
                <View>
                  <Text className="text-xs text-gray-500">Regular</Text>
                  <Text className="font-medium text-white">
                    {record.regularHours}h
                  </Text>
                </View>
                <View>
                  <Text className="text-xs text-gray-500">Overtime</Text>
                  <Text className="font-medium text-yellow-400">
                    {record.overtimeHours}h
                  </Text>
                </View>
                <View>
                  <Text className="text-xs text-gray-500">Total</Text>
                  <Text className="font-medium text-white">
                    {record.totalHours}h
                  </Text>
                </View>
              </View>
            </View>
          ))}
      </View>

      <View className="flex-row justify-around mt-6 pt-6 border-t border-gray-700">
        <View className="items-center">
          <Text className="text-xs text-gray-400 mb-1">Total OT Hours</Text>
          <Text className="text-2xl font-bold text-yellow-400">
            {totalOvertimeHours}h
          </Text>
        </View>
        <View className="items-center">
          <Text className="text-xs text-gray-400 mb-1">OT Cost</Text>
          <Text className="text-2xl font-bold text-yellow-400">
            ${totalOvertimeCost.toFixed(2)}
          </Text>
        </View>
      </View>
    </Card>
  );
};

export default OvertimeSummary;
