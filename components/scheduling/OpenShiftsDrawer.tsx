import { Card } from "@/components/ui/card";
import { PTORequest, Shift, ShiftRequest as SwapRequest } from "@/lib/types";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  Users,
  X,
} from "lucide-react-native";
import React, { forwardRef, useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Button } from "../ui/button";
import PTORequestCard from "./PTORequestCard";
import SwapRequestCard from "./SwapRequestCard";

const formatTime = (time: string): string => {
  if (!time) return "N/A";
  const [hours, minutes] = time.split(":");
  const h = Number.parseInt(hours);
  const ampm = h >= 12 ? "PM" : "AM";
  const displayHour = h % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
};

interface OpenShiftsDrawerProps {
  openShifts: Shift[];
  swapRequests: SwapRequest[];
  ptoRequests: PTORequest[];
  onAssign: (shiftId: string, employeeId: string) => void;
  onCloseShift: (shiftId: string) => void;
  onApproveSwap: (swapId: string) => void;
  onDenySwap: (swapId: string) => void;
  onApprovePTO: (ptoId: string) => void;
  onDenyPTO: (ptoId: string) => void;
}

interface ShiftApplicant {
  employeeId: string;
  appliedAt: string;
  seniority: number;
  hoursDeficit: number;
}

const mockApplicants: Record<string, ShiftApplicant[]> = {
  s3: [
    {
      employeeId: "4",
      appliedAt: "2025-01-10T14:30:00",
      seniority: 2,
      hoursDeficit: 8,
    },
    {
      employeeId: "6",
      appliedAt: "2025-01-10T15:45:00",
      seniority: 1,
      hoursDeficit: 12,
    },
  ],
};

const OpenShiftsDrawer = forwardRef<BottomSheet, OpenShiftsDrawerProps>(
  (
    {
      openShifts,
      swapRequests,
      ptoRequests,
      onAssign,
      onCloseShift,
      onApproveSwap,
      onDenySwap,
      onApprovePTO,
      onDenyPTO,
    },
    ref
  ) => {
    const snapPoints = useMemo(() => ["90%"], []);
    const [selectedShift, setSelectedShift] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState("open-shifts");
    const { employees } = useEmployeeStore();

    const getApplicants = (shiftId: string) => mockApplicants[shiftId] || [];
    const getEmployeeName = (employeeId: string) =>
      employees.find((e) => e.id === employeeId)?.fullName || "Unknown";

    const handleAssignBest = (shiftId: string) => {
      const applicants = getApplicants(shiftId);
      if (applicants.length > 0) {
        const best = [...applicants].sort(
          (a, b) => b.hoursDeficit - a.hoursDeficit || b.seniority - a.seniority
        )[0];
        onAssign(shiftId, best.employeeId);
      }
    };

    const renderContent = () => {
      switch (activeTab) {
        case "open-shifts":
          return (
            <View className="p-6 gap-y-4">
              {openShifts.length === 0 ? (
                <View className="items-center py-12">
                  <Calendar
                    size={48}
                    className="text-gray-600 mb-3"
                    color={"#4b5563"}
                  />
                  <Text className="text-sm text-gray-500">No open shifts</Text>
                </View>
              ) : (
                openShifts.map((shift) => {
                  const applicants = getApplicants(shift.id);
                  const isExpanded = selectedShift === shift.id;
                  return (
                    <Card
                      key={shift.id}
                      className="p-4 bg-[#303030] border-gray-700 gap-y-3"
                    >
                      <View className="flex-row justify-between items-start">
                        <View className="gap-y-2">
                          <View className="border-none px-2.5 py-0.5 ">
                            <Text className="text-white">{shift.role}</Text>
                          </View>
                          <View className="flex-row items-center gap-2 text-sm">
                            <Clock
                              size={16}
                              className="text-gray-400"
                              color={"#9ca3af"}
                            />
                            <Text className="text-white">
                              {formatTime(shift.startTime)} - $
                              {formatTime(shift.endTime)}
                            </Text>
                          </View>
                          <View className="flex-row items-center gap-2 text-sm">
                            <Calendar
                              size={16}
                              className="text-gray-400"
                              color={"#9ca3af"}
                            />
                            <Text className="text-gray-400">
                              {new Date(shift.date).toLocaleDateString(
                                "en-US",
                                {
                                  weekday: "short",
                                  month: "short",
                                  day: "numeric",
                                }
                              )}
                            </Text>
                          </View>
                        </View>
                        {(shift.requiredCount || 1) > 1 && (
                          <View className="border-none px-2.5 py-0.5 items-center gap-2 flex-row">
                            <Users size={12} color={"#9ca3af"} />
                            <Text className="text-gray-400">
                              {shift.requiredCount}
                            </Text>
                          </View>
                        )}
                      </View>

                      {applicants.length > 0 && (
                        <View className="pt-3 border-t border-gray-700">
                          <View className="flex-row justify-between items-center mb-2">
                            <Text className="text-xs text-gray-400">
                              {applicants.length} applicant
                              {applicants.length !== 1 ? "s" : ""}
                            </Text>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-xs flex-row"
                              onPress={() =>
                                setSelectedShift(isExpanded ? null : shift.id)
                              }
                            >
                              <Text className="text-blue-400">
                                {isExpanded ? "Hide" : "View"}
                              </Text>
                            </Button>
                          </View>
                          {isExpanded && (
                            <View className="gap-y-2 mt-3">
                              {applicants.map((applicant) => (
                                <View
                                  key={applicant.employeeId}
                                  className="flex-row items-center justify-between p-2 rounded bg-[#212121] border border-gray-600"
                                >
                                  <View>
                                    <Text className="text-sm font-medium text-white">
                                      {getEmployeeName(applicant.employeeId)}
                                    </Text>
                                    <Text className="text-xs text-gray-500">
                                      {applicant.hoursDeficit}h deficit •{" "}
                                      {applicant.seniority}y seniority
                                    </Text>
                                  </View>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 gap-2 bg-transparent border-gray-600 flex-row"
                                    onPress={() =>
                                      onAssign(shift.id, applicant.employeeId)
                                    }
                                  >
                                    <Text className="text-white">Assign</Text>
                                    <ArrowRight
                                      size={12}
                                      className="text-white"
                                      color={"#FFFFFF"}
                                    />
                                  </Button>
                                </View>
                              ))}
                            </View>
                          )}
                        </View>
                      )}

                      <View className="flex-row gap-2 pt-2">
                        {applicants.length > 0 && (
                          <Button
                            size="sm"
                            className="flex-1 gap-2 bg-blue-600 flex-row"
                            onPress={() => handleAssignBest(shift.id)}
                          >
                            <CheckCircle2 size={16} color="#FFFFFF" />
                            <Text className="text-white font-semibold">
                              Assign Best
                            </Text>
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-2 bg-transparent border-gray-600 flex-row"
                          onPress={() => onCloseShift(shift.id)}
                        >
                          <X size={16} color="#FFFFFF" />
                          <Text className="text-white">Close</Text>
                        </Button>
                      </View>
                    </Card>
                  );
                })
              )}
            </View>
          );
        case "swaps":
          return (
            <View className="p-6 gap-y-4">
              {swapRequests.map((req) => (
                <SwapRequestCard
                  key={req.id}
                  fromEmployee={getEmployeeName(req.fromEmployeeId!)}
                  toEmployee={getEmployeeName(req.toEmployeeId!)}
                  shift={{
                    role: req.shift.role,
                    date: new Date(req.shift.date).toLocaleDateString(),
                    time: `${formatTime(req.shift.startTime)} - ${formatTime(req.shift.endTime)}`,
                  }}
                  reason={req.note}
                  onApprove={() => onApproveSwap(req.id)}
                  onDeny={() => onDenySwap(req.id)}
                />
              ))}
            </View>
          );
        case "pto":
          return (
            <View className="p-6 gap-y-4">
              {ptoRequests.map((req) => (
                <PTORequestCard
                  key={req.id}
                  employee={getEmployeeName(req.employeeId)}
                  startDate={new Date(req.startDate).toLocaleDateString()}
                  endDate={new Date(req.endDate).toLocaleDateString()}
                  reason={req.note}
                  onApprove={() => onApprovePTO(req.id)}
                  onDeny={() => onDenyPTO(req.id)}
                />
              ))}
            </View>
          );
        default:
          return null;
      }
    };

    return (
      <BottomSheet
        ref={ref}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={(props) => (
          <BottomSheetBackdrop
            {...props}
            disappearsOnIndex={-1}
            appearsOnIndex={0}
          />
        )}
        backgroundStyle={{ backgroundColor: "#212121" }}
        handleIndicatorStyle={{ backgroundColor: "#9CA3AF" }}
      >
        <View className="flex-1 bg-[#212121]">
          <View className="px-6 py-4 border-b border-gray-700">
            <View className="flex-row items-center gap-2">
              <Calendar size={20} className="text-blue-400" color={"#60a5fa"} />
              <Text className="text-white text-xl font-bold">
                Open Shifts & Requests
              </Text>
            </View>
          </View>
          <View className="flex-row w-full rounded-none border-b border-gray-700 bg-transparent px-6">
            <TouchableOpacity
              onPress={() => setActiveTab("open-shifts")}
              className={`flex-1 py-3 items-center border-b-2 ${activeTab === "open-shifts" ? "border-blue-400" : "border-transparent"}`}
            >
              <Text
                className={`font-semibold ${activeTab === "open-shifts" ? "text-blue-400" : "text-gray-400"}`}
              >
                Open Shifts
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveTab("swaps")}
              className={`flex-1 py-3 items-center border-b-2 ${activeTab === "swaps" ? "border-blue-400" : "border-transparent"}`}
            >
              <Text
                className={`font-semibold ${activeTab === "swaps" ? "text-blue-400" : "text-gray-400"}`}
              >
                Swaps
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveTab("pto")}
              className={`flex-1 py-3 items-center border-b-2 ${activeTab === "pto" ? "border-blue-400" : "border-transparent"}`}
            >
              <Text
                className={`font-semibold ${activeTab === "pto" ? "text-blue-400" : "text-gray-400"}`}
              >
                PTO
              </Text>
            </TouchableOpacity>
          </View>
          <BottomSheetScrollView>{renderContent()}</BottomSheetScrollView>
        </View>
      </BottomSheet>
    );
  }
);

export default OpenShiftsDrawer;
