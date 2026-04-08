import BreakComplianceTable from "@/components/scheduling/reports/BreakComplianceTable";
import OvertimeSummary from "@/components/scheduling/reports/OvertimeSummary";
import StatCard from "@/components/scheduling/reports/StatCard";
import VarianceChart from "@/components/scheduling/reports/VarianceChart";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Download, FileText } from "lucide-react-native";
import React from "react";
import { ScrollView, Text, View } from "react-native";

const ReportsScreen = () => {
  const isDSTWeek = false; // Mock DST check

  return (
    <View className="flex-1 bg-screen">
      <View className="border-b border-gray-700 bg-panel">
        <View className="px-6 py-4">
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-row items-center gap-4">
              <View>
                <Text className="text-white">
                  Weekly performance and compliance reports
                </Text>
              </View>
            </View>
            <View className="flex-row items-center gap-3">
              <Select
                defaultValue={{
                  value: "location-1",
                  label: "Downtown Location",
                }}
              >
                <SelectTrigger className="w-[180px] bg-screen border border-gray-600 rounded-lg">
                  <SelectValue
                    placeholder="Select a location"
                    className="text-white"
                  />
                </SelectTrigger>
                <SelectContent className="bg-screen border-gray-600 rounded-lg text-white">
                  <SelectItem
                    value="location-1"
                    label="Downtown Location"
                    className="text-white"
                  >
                    <Text className="text-white">Downtown Location</Text>
                  </SelectItem>
                  <SelectItem value="location-2" label="Westside Location">
                    Westside Location
                  </SelectItem>
                  <SelectItem value="location-3" label="Airport Location">
                    Airport Location
                  </SelectItem>
                </SelectContent>
              </Select>
              <Select
                defaultValue={{ value: "current", label: "Current Week" }}
              >
                <SelectTrigger className="w-[180px] bg-screen border border-gray-600 rounded-lg">
                  <SelectValue
                    placeholder="Select a week"
                    className="text-white"
                  />
                </SelectTrigger>
                <SelectContent className="bg-screen border-gray-600 rounded-lg text-white">
                  <SelectItem label="Current Week" value="current" />
                  <SelectItem label="Last Week" value="last" />
                </SelectContent>
              </Select>
            </View>
          </View>
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-gray-400">
              Showing data for Jan 13 - Jan 19, 2025 • Downtown Location
            </Text>
            <View className="flex-row items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 bg-transparent flex-row items-center"
              >
                <Download size={16} className="text-white" color={"#FFFFFF"} />
                <Text className="text-white">Export Payroll CSV</Text>
              </Button>
              <Button size="sm" className="gap-2 flex-row items-center">
                <FileText size={16} className="text-white" color={"#FFFFFF"} />
                <Text className="text-white">Export Full Report</Text>
              </Button>
            </View>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 24, gap: 24 }}>
        {isDSTWeek && (
          <View className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30 flex-row items-start gap-3">
            <AlertTriangle
              size={20}
              className="text-yellow-400 mt-1"
              color={"#facc15"}
            />
            <View className="flex-1">
              <Text className="font-semibold text-yellow-300 mb-1">
                Daylight Saving Time Adjustment
              </Text>
              <Text className="text-sm text-gray-400 leading-relaxed">
                This week includes a DST transition. Please verify all time
                entries are accurate and adjust payroll calculations
                accordingly.
              </Text>
            </View>
          </View>
        )}

        <VarianceChart />

        <View className="flex-row w-full gap-4">
          <OvertimeSummary />

          <View className="flex-1 gap-y-6">
            <View className="flex-row gap-4">
              <StatCard
                title="Total Labor Cost"
                value="$12,847"
                trend="-2.3% vs forecast"
                trendColor="text-green-400"
              />
              <StatCard
                title="Labor %"
                value="28.5%"
                trend="Within target"
                trendColor="text-green-400"
              />
            </View>
            <View className="p-6 rounded-lg bg-panel border border-gray-700">
              <Text className="text-lg font-semibold text-white mb-4">
                Week Summary
              </Text>
              <View className="gap-y-3">
                <View className="flex-row justify-between items-center text-sm">
                  <Text className="text-gray-400">Total Employees</Text>
                  <Text className="font-medium text-white">10</Text>
                </View>
                <View className="flex-row justify-between items-center text-sm">
                  <Text className="text-gray-400">Total Shifts</Text>
                  <Text className="font-medium text-white">87</Text>
                </View>
                <View className="flex-row justify-between items-center text-sm">
                  <Text className="text-gray-400">Avg Shift Length</Text>
                  <Text className="font-medium text-white">6.8 hours</Text>
                </View>
                <View className="flex-row justify-between items-center text-sm">
                  <Text className="text-gray-400">Call-offs</Text>
                  <Text className="font-medium text-yellow-400">2</Text>
                </View>
                <View className="flex-row justify-between items-center text-sm">
                  <Text className="text-gray-400">Late Clock-ins</Text>
                  <Text className="font-medium text-yellow-400">3</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        <BreakComplianceTable />
      </ScrollView>
    </View>
  );
};

export default ReportsScreen;
