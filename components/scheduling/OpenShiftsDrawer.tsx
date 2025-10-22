import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shift } from "@/lib/mock-data";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { PTORequest, ShiftRequest as SwapRequest } from "@/lib/types";
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
import { Text, View } from "react-native";
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
            <Text className="text-white text-xl font-bold flex-row items-center gap-2">
              <Calendar size={20} className="text-blue-400" /> Open Shifts &
              Requests
            </Text>
          </View>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
            <TabsList className="w-full rounded-none border-b border-gray-700 bg-transparent px-6">
              <TabsTrigger value="open-shifts" className="flex-1">
                <Text className="text-white">Open Shifts</Text>
                <Badge className="ml-2">
                  <Text>{openShifts.length}</Text>
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="swaps" className="flex-1">
                <Text className="text-white">Swaps</Text>
                <Badge className="ml-2">
                  <Text>2</Text>
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="pto" className="flex-1">
                <Text className="text-white">PTO</Text>
                <Badge className="ml-2">
                  <Text>2</Text>
                </Badge>
              </TabsTrigger>
            </TabsList>
            <BottomSheetScrollView>
              <TabsContent value="open-shifts">
                <View className="p-6 space-y-4">
                  {openShifts.length === 0 ? (
                    <View className="items-center py-12">
                      <Calendar size={48} className="text-gray-600 mb-3" />
                      <Text className="text-sm text-gray-500">
                        No open shifts
                      </Text>
                    </View>
                  ) : (
                    openShifts.map((shift) => {
                      const applicants = getApplicants(shift.id);
                      const isExpanded = selectedShift === shift.id;
                      return (
                        <Card
                          key={shift.id}
                          className="p-4 bg-[#303030] border-gray-700 space-y-3"
                        >
                          <View className="flex-row justify-between items-start">
                            <View className="space-y-2">
                              <Badge variant="outline" className="text-xs">
                                {shift.role}
                              </Badge>
                              <View className="flex-row items-center gap-2 text-sm">
                                <Clock size={16} className="text-gray-400" />
                                <Text className="text-white">
                                  {formatTime(shift.start)} -
                                  {formatTime(shift.end)}
                                </Text>
                              </View>
                              <View className="flex-row items-center gap-2 text-sm">
                                <Calendar size={16} className="text-gray-400" />
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
                            {shift.requiredCount > 1 && (
                              <Badge variant="secondary" className="gap-1">
                                <Users size={12} />
                                <Text>{shift.requiredCount}</Text>
                              </Badge>
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
                                  className="h-6 text-xs"
                                  onPress={() =>
                                    setSelectedShift(
                                      isExpanded ? null : shift.id
                                    )
                                  }
                                >
                                  <Text className="text-blue-400">
                                    {isExpanded ? "Hide" : "View"}
                                  </Text>
                                </Button>
                              </View>
                              {isExpanded && (
                                <View className="space-y-2 mt-3">
                                  {applicants.map((applicant) => (
                                    <View
                                      key={applicant.employeeId}
                                      className="flex-row items-center justify-between p-2 rounded bg-[#212121] border border-gray-600"
                                    >
                                      <View>
                                        <Text className="text-sm font-medium text-white">
                                          {getEmployeeName(
                                            applicant.employeeId
                                          )}
                                        </Text>
                                        <Text className="text-xs text-gray-500">
                                          {applicant.hoursDeficit}h deficit •{" "}
                                          {applicant.seniority}y seniority
                                        </Text>
                                      </View>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 gap-1 bg-transparent border-gray-600"
                                        onPress={() =>
                                          onAssign(
                                            shift.id,
                                            applicant.employeeId
                                          )
                                        }
                                      >
                                        <Text className="text-white">
                                          Assign
                                        </Text>
                                        <ArrowRight
                                          size={12}
                                          className="text-white"
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
                                className="flex-1 gap-2 bg-blue-600"
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
                              className="gap-2 bg-transparent border-gray-600"
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
              </TabsContent>
              <TabsContent value="swaps">
                <View className="p-6 space-y-4">
                  {swapRequests.map((req) => (
                    <SwapRequestCard
                      key={req.id}
                      fromEmployee={getEmployeeName(req.fromEmployeeId!)}
                      toEmployee={getEmployeeName(req.toEmployeeId!)}
                      shift={{
                        role: req.shift.role,
                        date: new Date(req.shift.date).toLocaleDateString(),
                        time: `${formatTime(req.shift.startTime)} - ${formatTime(
                          req.shift.endTime
                        )}`,
                      }}
                      reason={req.note}
                      onApprove={() => onApproveSwap(req.id)}
                      onDeny={() => onDenySwap(req.id)}
                    />
                  ))}
                </View>
              </TabsContent>
              <TabsContent value="pto">
                <View className="p-6 space-y-4">
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
              </TabsContent>
            </BottomSheetScrollView>
          </Tabs>
        </View>
      </BottomSheet>
    );
  }
);

export default OpenShiftsDrawer;
