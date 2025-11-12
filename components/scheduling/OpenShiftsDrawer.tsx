import { Card } from "@/components/ui/card";
import { useUndoableToast } from "@/hooks/useUndoableToast";
import { PTORequest, Shift, ShiftRequest } from "@/lib/types";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useScheduleStore } from "@/stores/useScheduleStore";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { ArrowDownCircle, ArrowRightLeft, Calendar } from "lucide-react-native";
import React, { forwardRef, useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { DenyRequestModal } from "./DenyRequestModal";
import DropRequestCard from "./DropRequestCard";
import PTORequestCard from "./PTORequestCard";
import SwapRequestCard from "./SwapRequestCard";

interface OpenShiftsDrawerProps {
  openShifts: Shift[];
  onAssign: (shiftId: string, employeeId: string) => void;
  onCloseShift: (shiftId: string) => void;
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
  ({ openShifts, onAssign, onCloseShift }, ref) => {
    const snapPoints = useMemo(() => ["90%"], []);
    const [selectedShift, setSelectedShift] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState("open-shifts");
    const { showUndoableToast } = useUndoableToast();

    const { employees, loggedInEmployee } = useEmployeeStore();
    const {
      dropRequests,
      swapRequests,
      ptoRequests: allPtoRequests,
      approveDropRequest,
      denyDropRequest,
      approvePTORequest,
      denyPTORequest,
      approveSwap,
      denySwap,
      schedulePeriods,
      weeklySchedules,
      revertPTORequestApproval,
      revertDropRequestApproval,
      revertSwapApproval,
    } = useScheduleStore();

    const ptoRequests = useMemo(
      () => allPtoRequests.filter((r) => r.status === "pending"),
      [allPtoRequests]
    );

    const pendingDrops = useMemo(
      () => dropRequests.filter((r) => r.status === "pending"),
      [dropRequests]
    );

    const pendingManagerSwaps = useMemo(
      () => swapRequests.filter((r) => r.status === "pending-manager"),
      [swapRequests]
    );

    // Calculate counts for tabs
    const openShiftsCount = openShifts.length;
    const dropRequestsCount = pendingDrops.length;
    const swapsCount = pendingManagerSwaps.length;
    const ptoCount = ptoRequests.length;

    const [isDenyModalOpen, setDenyModalOpen] = useState(false);
    const [requestToDeny, setRequestToDeny] = useState<
      ShiftRequest | PTORequest | null
    >(null);

    const getApplicants = (shiftId: string) => mockApplicants[shiftId] || [];
    const getEmployeeName = (employeeId: string) =>
      employees.find((e) => e.id === employeeId)?.fullName || "Unknown";

    const findShiftById = (shiftId: string | undefined) => {
      if (!shiftId) return undefined;
      const allSchedules = [...schedulePeriods, ...weeklySchedules];
      for (const schedule of allSchedules) {
        const foundShift = schedule.shifts.find((s) => s.id === shiftId);
        if (foundShift) return foundShift;
      }
      return undefined;
    };

    const handleAssignBest = (shiftId: string) => {
      const applicants = getApplicants(shiftId);
      if (applicants.length > 0) {
        const best = [...applicants].sort(
          (a, b) => b.hoursDeficit - a.hoursDeficit || b.seniority - a.seniority
        )[0];
        onAssign(shiftId, best.employeeId);
      }
    };

    const handleDenyClick = (request: ShiftRequest | PTORequest) => {
      setRequestToDeny(request);
      setDenyModalOpen(true);
    };

    const handleConfirmDeny = (reason: string) => {
      if (requestToDeny && loggedInEmployee) {
        if ("shift" in requestToDeny) {
          denyDropRequest(requestToDeny.id, loggedInEmployee.id, reason);
        } else {
          denyPTORequest(requestToDeny.id, loggedInEmployee.id, reason);
        }
      }
    };

    const handleApprovePTO = (request: PTORequest) => {
      if (!loggedInEmployee) return;
      approvePTORequest(request.id, loggedInEmployee.id);
      showUndoableToast(
        "PTO Request Approved",
        `${getEmployeeName(request.employeeId)}'s request has been approved.`,
        () => {
          revertPTORequestApproval(request.id);
        }
      );
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
                      {/* ... existing open shift card content ... */}
                    </Card>
                  );
                })
              )}
            </View>
          );
        case "drop-requests":
          return (
            <View className="p-6 gap-y-4">
              {pendingDrops.length === 0 ? (
                <View className="items-center py-12">
                  <ArrowDownCircle
                    size={48}
                    className="text-gray-600 mb-3"
                    color={"#4b5563"}
                  />
                  <Text className="text-sm text-gray-500">
                    No pending drop requests
                  </Text>
                </View>
              ) : (
                pendingDrops.map((req) => (
                  <DropRequestCard
                    key={req.id}
                    request={req}
                    employeeName={getEmployeeName(req.shift.employeeId!)}
                    onApprove={() => {
                      if (!loggedInEmployee) return;
                      approveDropRequest(req.id, loggedInEmployee.id);
                      showUndoableToast(
                        "Drop Request Approved",
                        `${getEmployeeName(
                          req.shift.employeeId!
                        )}'s request has been approved.`,
                        () => {
                          revertDropRequestApproval(req.id);
                        }
                      );
                    }}
                    onDeny={() => handleDenyClick(req)}
                  />
                ))
              )}
            </View>
          );
        case "swaps":
          return (
            <View className="p-6 gap-y-4">
              {pendingManagerSwaps.length === 0 ? (
                <View className="items-center py-12">
                  <ArrowRightLeft
                    size={48}
                    className="text-gray-600 mb-3"
                    color={"#4b5563"}
                  />
                  <Text className="text-sm text-gray-500">
                    No pending swap requests
                  </Text>
                </View>
              ) : (
                pendingManagerSwaps.map((req) => {
                  const myShift = findShiftById(req.myShiftId);
                  const peerShift = findShiftById(req.peerShiftId);
                  if (!myShift || !peerShift) return null;

                  return (
                    <SwapRequestCard
                      key={req.id}
                      ownerName={getEmployeeName(req.ownerId)}
                      peerName={getEmployeeName(req.peerId!)}
                      myShift={myShift}
                      peerShift={peerShift}
                      onApprove={() => {
                        approveSwap(req.id);
                        showUndoableToast(
                          "Swap Request Approved",
                          `The swap between ${getEmployeeName(
                            req.ownerId
                          )} and ${getEmployeeName(
                            req.peerId!
                          )} has been approved.`,
                          () => {
                            revertSwapApproval(req.id);
                          }
                        );
                      }}
                      onDeny={() => denySwap(req.id)}
                    />
                  );
                })
              )}
            </View>
          );
        case "pto":
          return (
            <View className="p-6 gap-y-4">
              {ptoRequests.length === 0 ? (
                <View className="items-center py-12">
                  <Calendar
                    size={48}
                    className="text-gray-600 mb-3"
                    color={"#4b5563"}
                  />
                  <Text className="text-sm text-gray-500">
                    No pending PTO requests
                  </Text>
                </View>
              ) : (
                ptoRequests.map((req) => (
                  <PTORequestCard
                    key={req.id}
                    employee={getEmployeeName(req.employeeId)}
                    startDate={new Date(req.startDate).toLocaleDateString()}
                    endDate={new Date(req.endDate).toLocaleDateString()}
                    reason={req.note}
                    onApprove={() => handleApprovePTO(req)}
                    onDeny={() => handleDenyClick(req)}
                  />
                ))
              )}
            </View>
          );
        default:
          return null;
      }
    };

    return (
      <>
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
                <Calendar
                  size={20}
                  className="text-blue-400"
                  color={"#60a5fa"}
                />
                <Text className="text-white text-xl font-bold">
                  Open Shifts & Requests
                </Text>
              </View>
            </View>
            <View className="flex-row w-full rounded-none border-b border-gray-700 bg-transparent px-6">
              <TouchableOpacity
                onPress={() => setActiveTab("open-shifts")}
                className={`flex-1 py-3 items-center border-b-2 ${
                  activeTab === "open-shifts"
                    ? "border-blue-400"
                    : "border-transparent"
                }`}
              >
                <View className="flex-row items-center">
                  <Text
                    className={`font-semibold ${
                      activeTab === "open-shifts"
                        ? "text-blue-400"
                        : "text-gray-400"
                    }`}
                  >
                    Open Shifts
                  </Text>
                  {openShiftsCount > 0 && (
                    <View className="ml-1 bg-red-500 rounded-full w-5 h-5 items-center justify-center">
                      <Text className="text-white text-xs font-bold">
                        {openShiftsCount}
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setActiveTab("drop-requests")}
                className={`flex-1 py-3 items-center border-b-2 ${
                  activeTab === "drop-requests"
                    ? "border-blue-400"
                    : "border-transparent"
                }`}
              >
                <View className="flex-row items-center">
                  <Text
                    className={`font-semibold ${
                      activeTab === "drop-requests"
                        ? "text-blue-400"
                        : "text-gray-400"
                    }`}
                  >
                    Drop Requests
                  </Text>
                  {dropRequestsCount > 0 && (
                    <View className="ml-1 bg-red-500 rounded-full w-5 h-5 items-center justify-center">
                      <Text className="text-white text-xs font-bold">
                        {dropRequestsCount}
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setActiveTab("swaps")}
                className={`flex-1 py-3 items-center border-b-2 ${
                  activeTab === "swaps"
                    ? "border-blue-400"
                    : "border-transparent"
                }`}
              >
                <View className="flex-row items-center">
                  <Text
                    className={`font-semibold ${
                      activeTab === "swaps" ? "text-blue-400" : "text-gray-400"
                    }`}
                  >
                    Swaps
                  </Text>
                  {swapsCount > 0 && (
                    <View className="ml-1 bg-red-500 rounded-full w-5 h-5 items-center justify-center">
                      <Text className="text-white text-xs font-bold">
                        {swapsCount}
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setActiveTab("pto")}
                className={`flex-1 py-3 items-center border-b-2 ${
                  activeTab === "pto" ? "border-blue-400" : "border-transparent"
                }`}
              >
                <View className="flex-row items-center">
                  <Text
                    className={`font-semibold ${
                      activeTab === "pto" ? "text-blue-400" : "text-gray-400"
                    }`}
                  >
                    PTO
                  </Text>
                  {ptoCount > 0 && (
                    <View className="ml-1 bg-red-500 rounded-full w-5 h-5 items-center justify-center">
                      <Text className="text-white text-xs font-bold">
                        {ptoCount}
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            </View>
            <BottomSheetScrollView>{renderContent()}</BottomSheetScrollView>
          </View>
        </BottomSheet>
        <DenyRequestModal
          isOpen={isDenyModalOpen}
          onClose={() => setDenyModalOpen(false)}
          onConfirm={handleConfirmDeny}
          title="Deny Request"
          description="Are you sure you want to deny this request? You can provide an optional reason below."
        />
      </>
    );
  }
);

export default OpenShiftsDrawer;
