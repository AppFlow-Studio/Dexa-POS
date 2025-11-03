import BottomSheet from "@gorhom/bottom-sheet";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Calendar,
  Download,
  Search,
  Send,
  Settings,
  Users,
  X,
} from "lucide-react-native";
import React, { useMemo, useRef, useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";

import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import FiltersPanel from "@/components/scheduling/FiltersPanel";
import LaborMeter from "@/components/scheduling/LaborMeter";
import OpenShiftsDrawer from "@/components/scheduling/OpenShiftsDrawer";
import PublishModal from "@/components/scheduling/PublishModal";
import ScheduleGrid from "@/components/scheduling/ScheduleGrid";
import { ShiftActionModal } from "@/components/scheduling/ShiftActionModal";
import ShiftEditorModal from "@/components/scheduling/ShiftEditorModal";
import TemplateDrawer from "@/components/scheduling/TemplateDrawer";
import WeekSelector from "@/components/scheduling/WeekSelector";
import { Button } from "@/components/ui/button";
import UnsavedChangesDialog from "@/components/ui/UnsavedChangesDialog";
import { mockShiftsScheudleGrid } from "@/lib/mockData";
import {
  PTORequest,
  Role,
  SchedulePeriod,
  Shift,
  ShiftRequest as SwapRequest,
  WeeklySchedule,
} from "@/lib/types";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useScheduleStore } from "@/stores/useScheduleStore";
import { addDays, isAfter, isBefore, subDays } from "date-fns";
import { ScrollView } from "react-native-gesture-handler";

const mockSwapRequests: SwapRequest[] = [
  {
    id: "swap1",
    fromEmployeeId: "1",
    toEmployeeId: "6",
    shift: mockShiftsScheudleGrid[0],
    status: "pending",
    note: "Schedule conflict",
    type: "swap",
    submittedAt: new Date().toISOString(),
  },
  {
    id: "swap2",
    fromEmployeeId: "2",
    toEmployeeId: "5",
    shift: mockShiftsScheudleGrid[1],
    status: "pending",
    type: "swap",
    submittedAt: new Date().toISOString(),
  },
];

const mockPtoRequests: PTORequest[] = [
  {
    id: "pto1",
    employeeId: "4",
    startDate: "2025-01-15",
    endDate: "2025-01-16",
    note: "Family event",
    status: "pending",
    hours: 16,
    submittedAt: new Date().toISOString(),
  },
  {
    id: "pto2",
    employeeId: "7",
    startDate: "2025-01-17",
    endDate: "2025-01-17",
    note: "Medical appointment",
    status: "pending",
    hours: 8,
    submittedAt: new Date().toISOString(),
  },
];

const ScheduleDetail = ({
  currentSchedule,
}: {
  currentSchedule: {
    schedule: SchedulePeriod | WeeklySchedule;
    type: "period" | "week";
  };
}) => {
  const router = useRouter();
  const { addShift, updateShift, deleteShift, discardDraft, compareSchedules } =
    useScheduleStore();
  const { employees } = useEmployeeStore();

  const [startDate, setStartDate] = useState(
    new Date(currentSchedule.schedule.startDate)
  );
  const [searchQuery, setSearchQuery] = useState("");

  // State for modals and drawers
  const [shiftEditorOpen, setShiftEditorOpen] = useState(false);
  const [selectedShift, setSelectedShift] = useState<Partial<Shift> | null>(
    null
  );
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [isDiscardModalOpen, setIsDiscardModalOpen] = useState(false);
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);
  const openShiftsSheetRef = useRef<BottomSheet>(null);

  // State for filters
  const [selectedRoles, setSelectedRoles] = useState<Role[]>([]);
  const [selectedConflicts, setSelectedConflicts] = useState<string[]>([]);

  const hasUnsavedChanges = useMemo(() => {
    if (currentSchedule.schedule.status !== "draft-edit") return false;
    const { added, updated, removed } = compareSchedules(
      currentSchedule.schedule.originalScheduleId!,
      currentSchedule.schedule.id
    );
    return added > 0 || updated > 0 || removed > 0;
  }, [currentSchedule, compareSchedules]);

  const handleRoleToggle = (role: Role) => {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const handleConflictToggle = (conflictId: string) => {
    setSelectedConflicts((prev) =>
      prev.includes(conflictId)
        ? prev.filter((c) => c !== conflictId)
        : [...prev, conflictId]
    );
  };

  const handlePublish = () => {
    setPublishModalOpen(true);
  };

  const handleDiscard = () => {
    discardDraft(currentSchedule.schedule.id, currentSchedule.type);
    router.back();
  };

  const handleShiftClick = (shift: Shift) => {
    setSelectedShift(shift);
    setIsActionModalOpen(true);
  };

  const handleAddShift = (employeeId: string, date: string) => {
    setSelectedShift({ employeeId, date });
    setShiftEditorOpen(true);
  };

  const handleApplyTemplate = (templateId: string) => {
    console.log("Applying template:", templateId);
  };

  const handleSaveShift = (shiftData: Partial<Shift>) => {
    if (shiftData.id) {
      updateShift(
        currentSchedule.schedule.id,
        currentSchedule.type,
        shiftData as Shift
      );
    } else {
      addShift(
        currentSchedule.schedule.id,
        currentSchedule.type,
        shiftData as Omit<Shift, "id">
      );
    }
    setShiftEditorOpen(false);
    setSelectedShift(null);
  };

  const handleSaveAndDuplicate = (shiftData: Partial<Shift>) => {
    addShift(
      currentSchedule.schedule.id,
      currentSchedule.type,
      shiftData as Omit<Shift, "id">
    );
    setShiftEditorOpen(false);
    setSelectedShift(null);
  };

  const handleDeleteShift = () => {
    if (selectedShift?.id) {
      deleteShift(
        currentSchedule.schedule.id,
        currentSchedule.type,
        selectedShift.id
      );
    }
    setIsActionModalOpen(false);
    setSelectedShift(null);
  };

  const handleEditShift = () => {
    setIsActionModalOpen(false);
    setShiftEditorOpen(true);
  };

  const handlePreviousWeek = () => {
    const newDate = subDays(startDate, 7);
    if (!isBefore(newDate, new Date(currentSchedule.schedule.startDate))) {
      setStartDate(newDate);
    }
  };

  const handleNextWeek = () => {
    const newDate = addDays(startDate, 7);
    if (!isAfter(newDate, new Date(currentSchedule.schedule.endDate))) {
      setStartDate(newDate);
    }
  };

  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) =>
      emp.fullName.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [employees, searchQuery]);

  const statusColors = {
    draft: "bg-muted text-muted-foreground",
    active: "bg-green-500/20 text-green-400 border-green-500/30",
    completed: "bg-gray-500/20 text-gray-400",
    "draft-edit": "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  };

  const statusTextColor = {
    draft: "text-muted-foreground",
    active: "text-green-400",
    completed: "text-gray-400",
    "draft-edit": "text-yellow-400",
  };

  return (
    <View className="flex-1 bg-[#212121]">
      {/* Header */}
      <View className="border-b border-gray-700 bg-[#303030]">
        <View className="px-6 py-4">
          <View className="flex-row items-center justify-between mb-6">
            <View className="flex-row items-center gap-4">
              <View>
                <Text className="text-white">
                  Plan and manage weekly schedules
                </Text>
              </View>
            </View>

            <View className="flex-row items-center gap-4">
              <Select
                defaultValue={{
                  value: "location-1",
                  label: "Downtown Location",
                }}
                className="text-white"
              >
                <SelectTrigger className="w-[180px] bg-[#212121] border border-gray-600 rounded-lg">
                  <SelectValue
                    placeholder="Select a location"
                    className="text-white"
                  />
                </SelectTrigger>
                <SelectContent className="bg-[#212121] border-gray-600 rounded-lg text-white">
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

              <WeekSelector
                startDate={startDate}
                onPrevious={handlePreviousWeek}
                onNext={handleNextWeek}
                minDate={new Date(currentSchedule.schedule.startDate)}
                maxDate={new Date(currentSchedule.schedule.endDate)}
              />

              <Badge className={statusColors[currentSchedule.schedule.status]}>
                <Text
                  className={statusTextColor[currentSchedule.schedule.status]}
                >
                  {currentSchedule.schedule.status.charAt(0).toUpperCase() +
                    currentSchedule.schedule.status.slice(1)}
                </Text>
              </Badge>
            </View>
          </View>

          {/* Bottom Section */}
          <View className="flex-row items-center justify-between">
            <LaborMeter
              projectedCost={12500}
              forecastSales={45000}
              period="week"
            />

            <View className="flex-row items-center gap-2">
              {currentSchedule.schedule.status === "draft-edit" ? (
                <>
                  {hasUnsavedChanges && (
                    <TouchableOpacity
                      onPress={() => setIsDiscardModalOpen(true)}
                      disabled={!hasUnsavedChanges}
                      className={`flex-row items-center gap-2 rounded-md border border-red-500/50 bg-transparent px-3 py-2 ${
                        !hasUnsavedChanges && "opacity-50"
                      }`}
                    >
                      <X size={16} color="#f87171" />
                      <Text className="text-red-400">Discard Changes</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    onPress={handlePublish}
                    className="flex-row items-center gap-2 rounded-md bg-blue-600 px-3 py-2"
                  >
                    <Send size={16} color="white" />
                    <Text className="text-white">Publish Changes</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  onPress={handlePublish}
                  className="flex-row items-center gap-2 rounded-md bg-gray-600 px-3 py-2"
                >
                  <Send size={16} color="white" />
                  <Text className="text-white">Published</Text>
                </TouchableOpacity>
              )}

              {/* Export Button */}
              <Button
                variant="outline"
                size="sm"
                className="gap-2 bg-transparent flex-row items-center"
              >
                <Download size={16} color="white" />
                <Text className="text-white">Export</Text>
              </Button>
              {/* Settings Icon Button */}
              <TouchableOpacity className="h-9 w-9 items-center justify-center rounded-md">
                <Settings size={16} color="white" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      {/* Main Content */}
      <View className="flex-1 flex-row overflow-hidden">
        {/* Left Sidebar */}
        <View className="w-64 border-r border-gray-700 bg-[#303030] p-4">
          <ScrollView>
            <View className="gap-y-6">
              <TemplateDrawer onApplyTemplate={handleApplyTemplate} />

              <View className="border-t border-gray-700 pt-6">
                <FiltersPanel
                  selectedRoles={selectedRoles}
                  selectedConflicts={selectedConflicts}
                  onRoleToggle={handleRoleToggle}
                  onConflictToggle={handleConflictToggle}
                />
              </View>

              <View className="border-t border-gray-700 pt-6">
                <TouchableOpacity
                  onPress={() => openShiftsSheetRef.current?.expand()}
                  className="w-full text-left hover:bg-gray-700/50 p-2 rounded-lg transition-colors"
                >
                  <View className="flex-row items-center gap-2 mb-2">
                    <Calendar
                      className="w-4 h-4 text-blue-400"
                      color={"#60a5fa"}
                    />
                    <Text className="text-sm font-semibold text-white">
                      Open Shifts
                    </Text>
                    <Badge className="ml-auto bg-gray-700">
                      <Text className="text-white">
                        {
                          currentSchedule.schedule.shifts.filter(
                            (s) => s.isOpen
                          ).length
                        }
                      </Text>
                    </Badge>
                  </View>
                  <Text className="text-xs text-gray-400">
                    View and manage open shifts
                  </Text>
                </TouchableOpacity>
              </View>

              <View className="border-t border-gray-700 pt-6">
                <TouchableOpacity
                  onPress={() => openShiftsSheetRef.current?.expand()} // Also opens the same drawer
                  className="w-full text-left hover:bg-gray-700/50 p-2 rounded-lg transition-colors"
                >
                  <View className="flex-row items-center gap-2 mb-2">
                    <Users
                      className="w-4 h-4 text-blue-400"
                      color={"#60a5fa"}
                    />
                    <Text className="text-sm font-semibold text-white">
                      Swaps & Requests
                    </Text>
                    <Badge className="ml-auto bg-gray-700">
                      <Text className="text-white">
                        {mockSwapRequests.length + mockPtoRequests.length}
                      </Text>
                    </Badge>
                  </View>
                  <Text className="text-xs text-gray-400">
                    Pending swap requests and PTO
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
        {/* Schedule Grid */}
        <View className="flex-1 flex-col overflow-hidden">
          <View className="border-b border-gray-700 bg-[#303030] px-6 py-3 flex-row items-center justify-between">
            <View className="w-full border border-gray-600 rounded-lg p-3">
              <View className="flex-row items-center bg-[#212121] border border-gray-600 rounded-lg px-2 w-64">
                <Search size={16} color="#9CA3AF" />
                <TextInput
                  placeholder="Search employees..."
                  placeholderTextColor="#9CA3AF"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  className="p-2 text-white flex-1"
                />
              </View>
            </View>
          </View>

          <ScheduleGrid
            startDate={startDate}
            employees={filteredEmployees}
            selectedRoles={selectedRoles}
            onShiftClick={handleShiftClick}
            onAddShift={handleAddShift}
            shifts={currentSchedule.schedule.shifts}
            periodStartDate={new Date(currentSchedule.schedule.startDate)}
            periodEndDate={new Date(currentSchedule.schedule.endDate)}
          />
        </View>
      </View>

      {/* Modals & Drawers */}
      <ShiftEditorModal
        open={shiftEditorOpen}
        onOpenChange={setShiftEditorOpen}
        shift={selectedShift as Shift}
        periodId={currentSchedule.schedule.id!}
        scheduleType={currentSchedule.type}
        onSave={handleSaveShift}
        onSaveAndDuplicate={handleSaveAndDuplicate}
      />
      {selectedShift && (
        <ShiftActionModal
          open={isActionModalOpen}
          onOpenChange={setIsActionModalOpen}
          shift={selectedShift as Shift}
          onEdit={handleEditShift}
          onDelete={handleDeleteShift}
        />
      )}
      <PublishModal
        open={publishModalOpen}
        onOpenChange={setPublishModalOpen}
        scheduleId={currentSchedule.schedule.id}
        scheduleType={currentSchedule.type}
        originalScheduleId={currentSchedule.schedule.originalScheduleId}
      />
      <OpenShiftsDrawer
        ref={openShiftsSheetRef}
        openShifts={currentSchedule.schedule.shifts.filter((s) => s.isOpen)}
        swapRequests={mockSwapRequests}
        ptoRequests={mockPtoRequests}
        onAssign={(shiftId, empId) =>
          console.log(`Assign shift ${shiftId} to ${empId}`)
        }
        onCloseShift={(shiftId) => console.log(`Close shift ${shiftId}`)}
        onApproveSwap={(id) => console.log(`Approve swap ${id}`)}
        onDenySwap={(id) => console.log(`Deny swap ${id}`)}
        onApprovePTO={(id) => console.log(`Approve PTO ${id}`)}
        onDenyPTO={(id) => console.log(`Deny PTO ${id}`)}
      />
      <UnsavedChangesDialog
        isOpen={isDiscardModalOpen}
        onCancel={() => setIsDiscardModalOpen(false)}
        onDiscard={handleDiscard}
      />
    </View>
  );
};

const ScheduleDetailScreen = () => {
  const { periodId } = useLocalSearchParams();
  const { schedulePeriods, weeklySchedules } = useScheduleStore();

  const currentSchedule = useMemo(() => {
    const period = schedulePeriods.find((p) => p.id === periodId);
    if (period) return { schedule: period, type: "period" as const };
    const weekly = weeklySchedules.find((w) => w.id === periodId);

    if (weekly) return { schedule: weekly, type: "week" as const };
    return null;
  }, [periodId, schedulePeriods, weeklySchedules]);

  if (!currentSchedule) {
    return (
      <Text className="text-white">
        Loading schedule or schedule not found...
      </Text>
    );
  }

  return <ScheduleDetail currentSchedule={currentSchedule} />;
};

export default ScheduleDetailScreen;
