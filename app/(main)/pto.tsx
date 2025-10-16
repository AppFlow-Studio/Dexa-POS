import { MOCK_PTO_BALANCE, MOCK_PTO_REQUESTS } from "@/lib/mockData";
import { PTORequest } from "@/lib/types";
import { differenceInDays, format, parseISO } from "date-fns";
import { router } from "expo-router";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  TrendingUp,
  XCircle,
} from "lucide-react-native";
import React, { useState } from "react";
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const MetricCard = ({
  label,
  value,
  icon,
  variant,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  variant: "success" | "warning" | "default";
}) => {
  const variantClasses = {
    success: "text-green-400",
    warning: "text-yellow-400",
    default: "text-white",
  };
  return (
    <View className="flex-1 bg-[#303030] p-4 rounded-2xl border border-gray-700">
      <View className="flex-row items-start justify-between mb-2">{icon}</View>
      <Text className={`text-3xl font-bold mb-1 ${variantClasses[variant]}`}>
        {value}
      </Text>
      <Text className="text-sm text-gray-400">{label}</Text>
    </View>
  );
};

const getStatusIcon = (status: PTORequest["status"]) => {
  switch (status) {
    case "approved":
      return <CheckCircle2 className="h-5 w-5 text-green-400" />;
    case "denied":
      return <XCircle className="h-5 w-5 text-red-400" />;
    case "pending":
      return <AlertCircle className="h-5 w-5 text-yellow-400" />;
    default:
      return null;
  }
};

const PTOPage = () => {
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [note, setNote] = useState("");

  const calculateHours = () => {
    if (!startDate || !endDate) return 0;
    const days = differenceInDays(parseISO(endDate), parseISO(startDate)) + 1;
    return days > 0 ? days * 8 : 0;
  };

  const handleSubmit = () => {
    console.log("PTO request submitted:", {
      startDate,
      endDate,
      hours: calculateHours(),
      note,
    });
    setShowRequestForm(false);
    setStartDate("");
    setEndDate("");
    setNote("");
  };

  return (
    <View className="flex-1 bg-[#212121] p-4">
      <View className="flex-row items-center justify-between mb-6">
        <TouchableOpacity
          onPress={() => router.back()}
          className="flex-row items-center gap-2"
        >
          <ArrowLeft color="#9CA3AF" size={24} />
          <Text className="text-2xl font-bold text-white">PTO Management</Text>
        </TouchableOpacity>
        {!showRequestForm && (
          <TouchableOpacity
            onPress={() => setShowRequestForm(true)}
            className="flex-row items-center gap-2 bg-blue-600 px-4 py-2 rounded-lg"
          >
            <Calendar color="white" size={16} />
            <Text className="text-white font-semibold">Request PTO</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {showRequestForm && (
          <View className="p-4 bg-[#303030] border border-gray-700 rounded-2xl mb-6">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-xl font-semibold text-white">
                New PTO Request
              </Text>
              <TouchableOpacity onPress={() => setShowRequestForm(false)}>
                <Text className="text-gray-400">Cancel</Text>
              </TouchableOpacity>
            </View>
            <View className="space-y-4">
              <View className="flex-row gap-4">
                <View className="flex-1">
                  <Text className="text-gray-300 mb-1">Start Date</Text>
                  <TextInput
                    value={startDate}
                    onChangeText={setStartDate}
                    placeholder="YYYY-MM-DD"
                    className="p-3 bg-[#212121] border border-gray-600 rounded-lg text-white"
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-gray-300 mb-1">End Date</Text>
                  <TextInput
                    value={endDate}
                    onChangeText={setEndDate}
                    placeholder="YYYY-MM-DD"
                    className="p-3 bg-[#212121] border border-gray-600 rounded-lg text-white"
                  />
                </View>
              </View>
              {startDate && endDate && calculateHours() > 0 && (
                <View className="p-3 bg-blue-600/10 border border-blue-500/20 rounded-lg flex-row justify-between items-center">
                  <Text className="text-sm text-gray-400">
                    Total Hours Requested
                  </Text>
                  <Text className="text-lg font-bold text-blue-400">
                    {calculateHours()}h
                  </Text>
                </View>
              )}
              <View>
                <Text className="text-gray-300 mb-1">Note (Optional)</Text>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="Add any additional details..."
                  multiline
                  className="p-3 bg-[#212121] border border-gray-600 rounded-lg text-white min-h-[80px]"
                />
              </View>
              <TouchableOpacity
                onPress={handleSubmit}
                className="py-3 bg-blue-600 rounded-lg items-center"
              >
                <Text className="font-bold text-white">Submit Request</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View className="flex-row gap-4 mb-6">
          <MetricCard
            label="Available"
            value={`${MOCK_PTO_BALANCE.available}h`}
            icon={<Clock size={20} color="#22c55e" />}
            variant="success"
          />
          <MetricCard
            label="Total Accrued"
            value={`${MOCK_PTO_BALANCE.accrued}h`}
            icon={<TrendingUp size={20} color="#9CA3AF" />}
            variant="default"
          />
          <MetricCard
            label="Used This Year"
            value={`${MOCK_PTO_BALANCE.used}h`}
            icon={<CheckCircle2 size={20} color="#9CA3AF" />}
            variant="default"
          />
          <MetricCard
            label="Pending Approval"
            value={`${MOCK_PTO_BALANCE.pending}h`}
            icon={<AlertCircle size={20} color="#f59e0b" />}
            variant="warning"
          />
        </View>

        <View>
          <Text className="text-xl font-semibold text-white mb-4">
            Request History
          </Text>
          <View className="space-y-3">
            {MOCK_PTO_REQUESTS.map((request) => (
              <View
                key={request.id}
                className="p-4 bg-[#303030] rounded-2xl border border-gray-700"
              >
                <View className="flex-row items-start justify-between">
                  <View className="flex-row items-start gap-3">
                    {getStatusIcon(request.status)}
                    <View>
                      <Text className="text-lg font-semibold text-white mb-1">
                        {format(parseISO(request.startDate), "MMM d")} -{" "}
                        {format(parseISO(request.endDate), "MMM d, yyyy")}
                      </Text>
                      <Text className="text-sm text-gray-400 mb-2">
                        {request.hours} hours requested
                      </Text>
                      <Text className="text-xs text-gray-500">
                        Submitted{" "}
                        {format(
                          parseISO(request.submittedAt),
                          "MMM d, yyyy 'at' h:mm a"
                        )}
                      </Text>
                    </View>
                  </View>
                  <Text
                    className={`text-xs font-medium px-2 py-1 rounded-full ${
                      request.status === "approved"
                        ? "bg-green-500/20 text-green-400"
                        : request.status === "denied"
                          ? "bg-red-500/20 text-red-400"
                          : "bg-yellow-500/20 text-yellow-400"
                    }`}
                  >
                    {request.status.charAt(0).toUpperCase() +
                      request.status.slice(1)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

export default PTOPage;
