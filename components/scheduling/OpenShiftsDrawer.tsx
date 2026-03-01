import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal"; // Imported ConfirmationModal
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/contexts/ToastContext";
import { useUndoableToast } from "@/hooks/useUndoableToast";
import { colors } from "@/lib/theme";
import { PTORequest, Shift, ShiftRequest } from "@/lib/types";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useScheduleStore } from "@/stores/useScheduleStore";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { format, parseISO } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import {
  ArrowDownCircle,
  ArrowRightLeft,
  Calendar,
  Edit2, // Added
  Plus,
  Trash2, // Added
} from "lucide-react-native";
import React, { forwardRef, useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { bottomSheetTheme } from "@/lib/theme";
import { DenyRequestModal } from "./DenyRequestModal";
import DropRequestCard from "./DropRequestCard";
import PTORequestCard from "./PTORequestCard";
import ShiftEditorModal from "./ShiftEditorModal";
import SwapRequestCard from "./SwapRequestCard";

interface OpenShiftsDrawerProps {
  scheduleId: string;
  scheduleType: "period" | "week";
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
  ({ scheduleId, scheduleType, onAssign, onCloseShift }, ref) => {
    const snapPoints = useMemo(() => ["90%"], []);
    const [selectedShift, setSelectedShift] = useState<string | null>(null);
    const [editingShift, setEditingShift] = useState<Shift | null>(null); // State for editing shift
    const [deletingShift, setDeletingShift] = useState<Shift | null>(null); // State for deleting shift
    const [isDeleteModalOpen, setDeleteModalOpen] = useState(false); // State for delete confirmation modal
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
      addShift,
      updateShift, // Import updateShift
      deleteShift, // Import deleteShift
    } = useScheduleStore();
    const { show } = useToast();

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

    const currentSchedule = useMemo(() => {
      const schedule =
        scheduleType === "period"
          ? schedulePeriods.find((s) => s.id === scheduleId)
          : weeklySchedules.find((s) => s.id === scheduleId);
      return schedule;
    }, [schedulePeriods, weeklySchedules, scheduleId, scheduleType]);

    const openShifts = useMemo(() => {
      return currentSchedule?.shifts.filter((s) => s.status === "open") || [];
    }, [currentSchedule]);

    // Calculate counts for tabs
    const openShiftsCount = openShifts.length;
    const dropRequestsCount = pendingDrops.length;
    const swapsCount = pendingManagerSwaps.length;
    const ptoCount = ptoRequests.length;

    const [isDenyModalOpen, setDenyModalOpen] = useState(false);
    const [requestToDeny, setRequestToDeny] = useState<
      ShiftRequest | PTORequest | null
    >(null);
    const [isAddShiftModalOpen, setAddShiftModalOpen] = useState(false); // State for add shift modal

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

    const handleAddOpenShift = (data: Partial<Shift>) => {
      if (editingShift) {
        // Handle Update
        if (!currentSchedule) return;
        updateShift(scheduleId, scheduleType, {
          ...editingShift,
          ...data,
          id: editingShift.id,
        });
        show({
          title: "Open Shift Updated",
          message: "The open shift has been successfully updated.",
          type: "success",
        });
      } else {
        // Handle Create (Existing logic, slightly adapted)
        // Note: The previous logic tried to find targetSchedule by date.
        // Since we now have scheduleId/Type props, we should use them if the date falls within range (or just trust the user aims for this schedule).
        // However, if the user picks a date completely outside, we might want to warn or switch schedules.
        // For simplicity, we use passed props as primary target, assuming validation happens or it's acceptable.

        // Use props directly
        if (!data.date) return;
        addShift(scheduleId, scheduleType, {
          ...data,
          employeeId: null, // Open shift
          status: "open",
          location: "Dexa – 5th Ave", // hardcoded for now
        } as any);

        show({
          title: "Open Shift Added",
          message: "The open shift has been successfully created.",
          type: "success",
        });
      }
      setAddShiftModalOpen(false);
      setEditingShift(null);
    };

    const handleEditClick = (shift: Shift) => {
      setEditingShift(shift);
      setAddShiftModalOpen(true);
    };

    const handleDeleteClick = (shift: Shift) => {
      setDeletingShift(shift);
      setDeleteModalOpen(true);
    };

    const handleConfirmDelete = () => {
      if (deletingShift) {
        deleteShift(scheduleId, scheduleType, deletingShift.id);
        show({
          title: "Shift Deleted",
          message: "The open shift has been removed.",
          type: "success",
        });
        setDeleteModalOpen(false);
        setDeletingShift(null);
      }
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
              <Button
                onPress={() => {
                  setEditingShift(null); // Ensure we are in create mode
                  setAddShiftModalOpen(true);
                }}
                className="flex-row items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 w-full"
              >
                <Plus size={20} color="white" />
                <Text className="text-white font-semibold">Add Open Shift</Text>
              </Button>

              {openShifts.length === 0 ? (
                <View className="items-center py-12">
                  <Calendar
                    size={48}
                    className="text-gray-600 mb-3"
                    color={colors.muted}
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
                      className="p-4 bg-panel border-border gap-y-3"
                    >
                      <View className="flex-row items-start justify-between">
                        <View className="gap-1">
                          <Text className="text-white font-bold text-lg">
                            {shift.role}
                          </Text>
                          <Text className="text-gray-400 text-sm">
                            {format(parseISO(shift.date), "EEE, MMM d")}
                          </Text>
                          <Text className="text-gray-400 text-sm">
                            {formatInTimeZone(shift.startTime, "UTC", "h:mm a")}{" "}
                            - {formatInTimeZone(shift.endTime, "UTC", "h:mm a")}
                          </Text>
                        </View>
                        <View className="flex-row gap-2">
                          <TouchableOpacity
                            onPress={() => handleEditClick(shift)}
                            className="p-2 bg-gray-700 rounded-md"
                          >
                            <Edit2 size={16} color={colors.label} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleDeleteClick(shift)}
                            className="p-2 bg-red-500/10 rounded-md"
                          >
                            <Trash2 size={16} color={colors.danger} />
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* Applicants Section */}
                      {applicants.length > 0 && (
                        <View className="mt-2 pt-2 border-t border-gray-600">
                          <View className="flex-row justify-between items-center mb-2">
                            <Text className="text-gray-300 text-sm font-medium">
                              {applicants.length} Applicants
                            </Text>
                            <Button
                              size="sm"
                              variant="ghost"
                              onPress={() => handleAssignBest(shift.id)}
                              className="h-8"
                            >
                              <Text className="text-blue-400 text-xs">
                                Auto Assign Best
                              </Text>
                            </Button>
                          </View>
                          <View className="gap-2">
                            {applicants.map((app) => (
                              <View
                                key={app.employeeId}
                                className="flex-row justify-between items-center bg-screen p-2 rounded"
                              >
                                <Text className="text-gray-300 text-sm">
                                  {getEmployeeName(app.employeeId)}
                                </Text>
                                <Button
                                  size="sm"
                                  className="h-7 bg-blue-600"
                                  onPress={() =>
                                    onAssign(shift.id, app.employeeId)
                                  }
                                >
                                  <Text className="text-white text-xs">
                                    Assign
                                  </Text>
                                </Button>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}
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
                    color={colors.muted}
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
                    color={colors.muted}
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
                      submittedAt={req.submittedAt}
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
                    color={colors.muted}
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
          {...bottomSheetTheme}
        >
          <View className="flex-1 bg-screen">
            <View className="px-6 py-4 border-b border-border">
              <View className="flex-row items-center gap-2">
                <Calendar
                  size={20}
                  className="text-blue-400"
                  color={colors.info}
                />
                <Text className="text-white text-xl font-bold">
                  Open Shifts & Requests
                </Text>
              </View>
            </View>
            <View className="flex-row w-full rounded-none border-b border-border bg-transparent px-6">
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
        <ShiftEditorModal
          open={isAddShiftModalOpen}
          onOpenChange={setAddShiftModalOpen}
          onSave={handleAddOpenShift}
          shift={editingShift || ({ employeeId: null, role: "Cashier" } as any)}
          enableDateChange={true}
        />
        <ConfirmationModal
          isOpen={isDeleteModalOpen}
          onClose={() => setDeleteModalOpen(false)}
          onConfirm={handleConfirmDelete}
          title="Delete Shift"
          description="Are you sure you want to delete this open shift? This action cannot be undone."
          confirmText="Delete"
          variant="destructive"
        />
      </>
    );
  }
);

export default OpenShiftsDrawer;
