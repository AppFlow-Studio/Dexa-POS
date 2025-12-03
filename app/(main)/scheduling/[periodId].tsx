import ApplyTemplateBar from "@/components/scheduling/ApplyTemplateBar"; // Import ApplyTemplateBar
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import BottomSheet from "@gorhom/bottom-sheet";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Calendar,
  Download,
  Search,
  Send,
  Settings,
  Sparkles,
  Users,
  X,
} from "lucide-react-native";
import React, { useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView, // <--- Imported
  Platform, // <--- Imported
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import FiltersPanel from "@/components/scheduling/FiltersPanel";
import LaborMeter from "@/components/scheduling/LaborMeter";
import { OpenShiftChip } from "@/components/scheduling/OpenShiftChip";
import OpenShiftsDrawer from "@/components/scheduling/OpenShiftsDrawer";
import { PublishModal } from "@/components/scheduling/PublishModal";
import ScheduleGrid from "@/components/scheduling/ScheduleGrid";
import { ShiftActionModal } from "@/components/scheduling/ShiftActionModal";
import { ShiftChip } from "@/components/scheduling/ShiftChip";
import { ShiftEditorModal } from "@/components/scheduling/ShiftEditorModal";
import TemplateDrawer from "@/components/scheduling/TemplateDrawer";
import WeekSelector from "@/components/scheduling/WeekSelector";
import { Button } from "@/components/ui/button";
import UnsavedChangesDialog from "@/components/ui/UnsavedChangesDialog";
import {
  DropZoneProvider,
  useDropZoneContext,
} from "@/contexts/DropZoneContext";
import { detectTemplateConflicts } from "@/lib/rules"; // Import detectTemplateConflicts
import {
  ApplyMode,
  PTORequest,
  Role,
  SchedulePeriod,
  Shift,
  TemplateShift,
  WeeklySchedule,
} from "@/lib/types";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useScheduleStore } from "@/stores/useScheduleStore";
import { useScheduleTemplateStore } from "@/stores/useScheduleTemplateStore"; // Import template store
import { addDays, isAfter, isBefore, startOfDay, subDays } from "date-fns";
import Animated, { useAnimatedStyle } from "react-native-reanimated";

const DragOverlay = () => {
  const { activeDragItem, dragTranslation } = useDropZoneContext();

  const style = useAnimatedStyle(() => {
    if (!activeDragItem) {
      return { opacity: 0 };
    }

    return {
      // REMOVED position: absolute from here (moved to className)
      width: activeDragItem.width,
      height: activeDragItem.height,
      opacity: 1,

      transform: [
        { translateX: activeDragItem.startX + dragTranslation.value.x },
        { translateY: activeDragItem.startY + dragTranslation.value.y },
      ],
    };
  });

  if (!activeDragItem) return null;

  return (
    // FIX 1: Added 'absolute top-0 left-0 z-50' here.
    // This forces the view to be absolute IMMEDIATELY, preventing the layout shift.
    <Animated.View
      style={style}
      pointerEvents="none"
      className="absolute top-0 left-0 z-50"
    >
      {activeDragItem.shift.status === "open" ? (
        <OpenShiftChip shift={activeDragItem.shift} onClick={() => {}} />
      ) : (
        <ShiftChip
          role={activeDragItem.shift.role}
          start={activeDragItem.shift.startTime}
          end={activeDragItem.shift.endTime}
          requiredCount={activeDragItem.shift.requiredCount}
          wage={activeDragItem.wage}
          onClick={() => {}}
        />
      )}
    </Animated.View>
  );
};

const ScheduleDetail = ({
  currentSchedule,
  approvedPtoRequests,
  pendingSwapRequestsCount,
  pendingPtoRequestsCount,
  pendingDropRequestsCount,
}: {
  currentSchedule: {
    schedule: SchedulePeriod | WeeklySchedule;
    type: "period" | "week";
  };
  approvedPtoRequests: PTORequest[];
  pendingSwapRequestsCount: number;
  pendingPtoRequestsCount: number;
  pendingDropRequestsCount: number;
}) => {
  const router = useRouter();
  const {
    addShift,
    updateShift,
    deleteShift,
    discardDraft,
    compareSchedules,
    applyTemplate,
  } = useScheduleStore();
  const { employees } = useEmployeeStore();
  const {
    templates,
    actions: { updateTemplate },
  } = useScheduleTemplateStore(); // Get templates and actions

  const [startDate, setStartDate] = useState(
    startOfDay(new Date(currentSchedule.schedule.startDate))
  );
  const [searchQuery, setSearchQuery] = useState("");

  // State for modals and drawers
  const [shiftEditorOpen, setShiftEditorOpen] = useState(false);
  const [selectedShift, setSelectedShift] = useState<Partial<
    Shift & TemplateShift
  > | null>(null); // Updated type
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [isDiscardModalOpen, setIsDiscardModalOpen] = useState(false);
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);
  const openShiftsSheetRef = useRef<BottomSheet>(null);

  // State for template overlay
  const [overlayTemplateId, setOverlayTemplateId] = useState<string | null>(
    null
  );
  const [applyMode, setApplyMode] = useState<ApplyMode>("merge");

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
    setOverlayTemplateId(templateId);
  };

  const handleCancelApplyTemplate = () => {
    setOverlayTemplateId(null);
  };

  const handleApplyTemplateAction = () => {
    if (!overlayTemplate) return;

    applyTemplate(
      currentSchedule.schedule.id,
      currentSchedule.type,
      overlayTemplate,
      applyMode
    );

    updateTemplate(overlayTemplate.id, { lastUsed: new Date() });
    handleCancelApplyTemplate(); // Close the bar after applying
  };

  const handleViewDetails = () => {
    // TODO: Implement viewing conflict details
    console.log("Viewing conflict details...");
  };

  const handleSaveShift = (shiftData: Partial<Shift & TemplateShift>) => {
    // Updated parameter type
    if (shiftData.id) {
      updateShift(
        currentSchedule.schedule.id,
        currentSchedule.type,
        shiftData as Shift // Cast back to Shift for store
      );
    } else {
      addShift(
        currentSchedule.schedule.id,
        currentSchedule.type,
        shiftData as Omit<Shift, "id"> // Cast back to Omit<Shift, "id"> for store
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
      setStartDate(startOfDay(newDate));
    }
  };

  const handleNextWeek = () => {
    const newDate = addDays(startDate, 7);
    if (!isAfter(newDate, new Date(currentSchedule.schedule.endDate))) {
      setStartDate(startOfDay(newDate));
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

  const totalPendingRequests =
    pendingSwapRequestsCount +
    pendingPtoRequestsCount +
    pendingDropRequestsCount;

  const overlayTemplate = useMemo(() => {
    return templates.find((t) => t.id === overlayTemplateId);
  }, [overlayTemplateId, templates]);

  const templateConflictSummary = useMemo(() => {
    if (!overlayTemplate) {
      return { shiftsToAdd: 0, conflictsDetected: 0, conflictDetails: [] };
    }
    return detectTemplateConflicts(
      overlayTemplate,
      currentSchedule.schedule,
      new Date(currentSchedule.schedule.startDate), // Pass full schedule start date
      new Date(currentSchedule.schedule.endDate), // Pass full schedule end date
      approvedPtoRequests
    );
  }, [
    overlayTemplate,
    currentSchedule.schedule,
    currentSchedule.schedule.startDate, // New dependency
    currentSchedule.schedule.endDate, // New dependency
    approvedPtoRequests,
  ]);

  return (
    <DropZoneProvider>
      <DragOverlay />
      <View className="flex-1 bg-[#212121]">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
        >
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

                  <Badge
                    className={statusColors[currentSchedule.schedule.status]}
                  >
                    <Text
                      className={
                        statusTextColor[currentSchedule.schedule.status]
                      }
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
                  {/* Generate Draft Button */}
                  <TouchableOpacity className="flex-row items-center gap-2 rounded-md border border-gray-600 bg-transparent px-3 py-2">
                    <Sparkles size={16} color="white" />

                    <Text className="text-white">Generate Draft</Text>
                  </TouchableOpacity>
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
          <View className="flex-1 flex-row">
            {/* Left Sidebar */}
            <View className="w-64 border-r border-gray-700 bg-[#303030] p-4">
              <ScrollView
                contentContainerStyle={{
                  paddingBottom: overlayTemplateId ? 80 : 0, // Conditional padding for sidebar
                }}
              >
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
                        <Badge
                          className={`ml-auto ${
                            currentSchedule.schedule.shifts.filter(
                              (s) => s.status === "open"
                            ).length > 0
                              ? "bg-red-500 text-white"
                              : "bg-gray-700 text-white"
                          }`}
                        >
                          <Text className="text-white">
                            {
                              currentSchedule.schedule.shifts.filter(
                                (s) => s.status === "open"
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
                        <Badge
                          className={`ml-auto ${
                            totalPendingRequests > 0
                              ? "bg-red-500 text-white"
                              : "bg-gray-700 text-white"
                          }`}
                        >
                          <Text
                            className={
                              totalPendingRequests > 0
                                ? "text-white"
                                : "text-white"
                            }
                          >
                            {totalPendingRequests}
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
                approvedPtoRequests={approvedPtoRequests}
                scheduleId={currentSchedule.schedule.id}
                scheduleType={currentSchedule.type}
                overlayTemplateId={overlayTemplateId}
                templates={templates}
                templateConflictSummary={templateConflictSummary}
                isApplyTemplateBarVisible={!!overlayTemplateId}
              />
            </View>
          </View>
        </KeyboardAvoidingView>

        {/* Modals & Drawers */}
        <ShiftEditorModal
          open={shiftEditorOpen}
          onOpenChange={setShiftEditorOpen}
          shift={selectedShift} // No need to cast here, type is already Partial<Shift & TemplateShift>
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
          openShifts={currentSchedule.schedule.shifts.filter(
            (s) => s.status === "open"
          )}
          onAssign={(shiftId, empId) =>
            console.log(`Assign shift ${shiftId} to ${empId}`)
          }
          onCloseShift={(shiftId) => console.log(`Close shift ${shiftId}`)}
        />
        <UnsavedChangesDialog
          isOpen={isDiscardModalOpen}
          onCancel={() => setIsDiscardModalOpen(false)}
          onDiscard={handleDiscard}
        />

        {overlayTemplateId && overlayTemplate && (
          <ApplyTemplateBar
            templateName={overlayTemplate.name}
            shiftsToAdd={templateConflictSummary.shiftsToAdd}
            conflictsDetected={templateConflictSummary.conflictsDetected}
            applyMode={applyMode}
            onApplyModeChange={setApplyMode}
            onCancel={handleCancelApplyTemplate}
            onViewDetails={handleViewDetails}
            onApply={handleApplyTemplateAction}
          />
        )}
      </View>
    </DropZoneProvider>
  );
};

const ScheduleDetailScreen = () => {
  const { periodId } = useLocalSearchParams();
  const {
    schedulePeriods,
    weeklySchedules,
    ptoRequests,
    swapRequests,
    dropRequests,
  } = useScheduleStore();
  const { templates } = useScheduleTemplateStore(); // Get templates

  const approvedPtoRequests = useMemo(
    () => ptoRequests.filter((r) => r.status === "approved"),
    [ptoRequests]
  );

  const pendingPtoRequestsCount = useMemo(
    () => ptoRequests.filter((r) => r.status === "pending").length,
    [ptoRequests]
  );

  const pendingSwapRequestsCount = useMemo(
    () =>
      swapRequests.filter(
        (r) => r.status === "pending-manager" || r.status === "pending-peer"
      ).length,
    [swapRequests]
  );

  const pendingDropRequestsCount = useMemo(
    () => dropRequests.filter((r) => r.status === "pending").length,
    [dropRequests]
  );

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

  return (
    <ScheduleDetail
      currentSchedule={currentSchedule}
      approvedPtoRequests={approvedPtoRequests}
      pendingSwapRequestsCount={pendingSwapRequestsCount}
      pendingPtoRequestsCount={pendingPtoRequestsCount}
      pendingDropRequestsCount={pendingDropRequestsCount}
    />
  );
};

export default ScheduleDetailScreen;
