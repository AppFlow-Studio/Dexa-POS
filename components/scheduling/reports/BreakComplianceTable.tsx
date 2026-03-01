import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { colors } from "@/lib/theme";
import { AlertCircle, CheckCircle2, XCircle } from "lucide-react-native";
import React from "react";
import { Text, View } from "react-native";

const mockData = [
  {
    employee: "Sarah Chen",
    date: "Jan 13",
    shiftHours: 8,
    breaksTaken: 2,
    breaksRequired: 2,
    status: "compliant",
  },
  {
    employee: "Marcus Johnson",
    date: "Jan 13",
    shiftHours: 8,
    breaksTaken: 1,
    breaksRequired: 2,
    status: "short",
  },
  {
    employee: "Emma Rodriguez",
    date: "Jan 14",
    shiftHours: 6,
    breaksTaken: 1,
    breaksRequired: 1,
    status: "compliant",
  },
  {
    employee: "Tyler Kim",
    date: "Jan 14",
    shiftHours: 8,
    breaksTaken: 0,
    breaksRequired: 2,
    status: "missed",
  },
  {
    employee: "Aisha Patel",
    date: "Jan 15",
    shiftHours: 7,
    breaksTaken: 2,
    breaksRequired: 2,
    status: "compliant",
  },
];

const BreakComplianceTable = () => {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "compliant":
        return <CheckCircle2 size={16} color={colors.success} />;
      case "short":
        return <AlertCircle size={16} color={colors.warning} />;
      case "missed":
        return <XCircle size={16} color={colors.danger} />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      compliant: "bg-green-500/20 text-green-400 border-green-500/30",
      short: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
      missed: "bg-red-500/20 text-red-400 border-red-500/30",
    };
    return (
      <Badge className={variants[status as keyof typeof variants]}>
        <Text className="text-white">
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </Text>
      </Badge>
    );
  };

  return (
    <Card className="p-6 bg-panel border-border">
      <View className="mb-6">
        <Text className="text-lg font-semibold text-white mb-1">
          Break Compliance
        </Text>
        <Text className="text-sm text-gray-400">
          Employee break tracking and compliance status
        </Text>
      </View>

      <View className="rounded-lg border border-gray-700 overflow-hidden">
        {/* Header */}
        <View className="flex-row bg-screen p-3 border-b border-border gap-4">
          <Text className="flex-1 font-semibold text-white">Employee</Text>
          <Text className="flex-1 font-semibold text-white text-right">
            Shift Hours
          </Text>
          <Text className="flex-1 font-semibold text-white text-right">
            Breaks Taken
          </Text>
          <Text className="flex-1 font-semibold text-white text-right">
            Required
          </Text>
          <Text className="flex-1 font-semibold text-white">Status</Text>
        </View>
        {/* Body */}
        <View>
          {mockData.map((record, i) => (
            <View
              key={i}
              className="flex-row p-3 border-b border-gray-700 items-center gap-4"
            >
              <Text className="flex-1 font-medium text-white">
                {record.employee}
              </Text>
              <Text className="flex-1 text-right text-white">
                {record.shiftHours}h
              </Text>
              <Text className="flex-1 text-right text-white">
                {record.breaksTaken}
              </Text>
              <Text className="flex-1 text-right text-white">
                {record.breaksRequired}
              </Text>
              <View className="flex-1 flex-row items-center gap-2">
                {getStatusIcon(record.status)}
                {getStatusBadge(record.status)}
              </View>
            </View>
          ))}
        </View>
      </View>
    </Card>
  );
};

export default BreakComplianceTable;
