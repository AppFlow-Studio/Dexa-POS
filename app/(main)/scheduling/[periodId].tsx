import BottomSheet from "@gorhom/bottom-sheet";
import { useLocalSearchParams } from "expo-router";
import {
  Calendar,
  Download,
  Search,
  Send,
  Settings,
  Sparkles,
  Users,
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
import ShiftEditorModal from "@/components/scheduling/ShiftEditorModal";
import TemplateDrawer from "@/components/scheduling/TemplateDrawer";
import WeekSelector from "@/components/scheduling/WeekSelector";
import { mockShiftsScheudleGrid } from "@/lib/mockData";
import {
  PTORequest,
  Role,
  Shift,
  ShiftRequest as SwapRequest,
} from "@/lib/types";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useScheduleStore } from "@/stores/useScheduleStore";
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

const ScheduleDetailScreen = () => {
  const { periodId } = useLocalSearchParams();
  const { shifts, addShift, updateShift, publishSchedule } = useScheduleStore();
  const { employees } = useEmployeeStore();

  const [startDate, setStartDate] = useState(new Date(2025, 0, 13));
  const [searchQuery, setSearchQuery] = useState("");
  const [publishStatus, setPublishStatus] = useState<
    "draft" | "published" | "archived"
  >("draft");

  // State for modals and drawers
  const [shiftEditorOpen, setShiftEditorOpen] = useState(false);
  const [selectedShift, setSelectedShift] = useState<Partial<Shift> | null>(
    null
  );
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const openShiftsSheetRef = useRef<BottomSheet>(null);

  // State for filters
  const [selectedRoles, setSelectedRoles] = useState<Role[]>([]);
  const [selectedConflicts, setSelectedConflicts] = useState<string[]>([]);

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

  const handlePublish = (notificationSettings: any) => {
    console.log("Publishing with settings:", notificationSettings);
    publishSchedule(periodId as string);
    setPublishStatus("published");
  };

  const handleShiftClick = (shift: Shift) => {
    setSelectedShift(shift);
    setShiftEditorOpen(true);
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
      updateShift(shiftData as Shift);
    } else {
      addShift(shiftData as Omit<Shift, "id">);
    }
  };

  const handleSaveAndDuplicate = (shiftData: Partial<Shift>) => {
    addShift(shiftData as Omit<Shift, "id">);
  };

  const handlePreviousWeek = () => {
    const newDate = new Date(startDate);
    newDate.setDate(newDate.getDate() - 7);
    setStartDate(newDate);
  };

  const handleNextWeek = () => {
    const newDate = new Date(startDate);
    newDate.setDate(newDate.getDate() + 7);
    setStartDate(newDate);
  };

  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) =>
      emp.fullName.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [employees, searchQuery]);

  const publishSummary = {
    assignedShifts: 42,
    openShifts: 3,
    conflicts: [
      {
        type: "OT Risk",
        description: "Sarah Chen scheduled for 42 hours this week",
      },
      {
        type: "Coverage Gap",
        description: "No supervisor on duty Tuesday 2-4 PM",
      },
    ],
  };

  const statusColors = {
    draft: "bg-muted text-muted-foreground",
    published: "bg-green-500/20 text-green-400 border-green-500/30",
    archived: "bg-gray-500/20 text-gray-400",
  };

  const statusTextColor = {
    draft: "text-muted-foreground",
    published: "text-green-400",
    archived: "text-gray-400",
  };

  if (!periodId) {
    return null;
  }

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
              />

              <Badge className={statusColors[publishStatus]}>
                <Text className={statusTextColor[publishStatus]}>
                  {publishStatus.charAt(0).toUpperCase() +
                    publishStatus.slice(1)}
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

              {/* Publish Button */}
              <TouchableOpacity
                onPress={() => {
                  setPublishModalOpen(true);
                }}
                className="flex-row items-center gap-2 rounded-md bg-[#4A44E0] px-3 py-2"
              >
                <Send size={16} color="white" />
                <Text className="text-white">Publish</Text>
              </TouchableOpacity>

              {/* Export Button */}
              <TouchableOpacity className="flex-row items-center gap-2 rounded-md px-3 py-2">
                <Download size={16} color="white" />
                <Text className="text-white">Export</Text>
              </TouchableOpacity>

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
                        {mockShiftsScheudleGrid.filter((s) => s.isOpen).length}
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

            <Text className="text-xs text-gray-400">
              Drag to move • Alt+Drag to duplicate • Right-click for options
            </Text>
          </View>

          <ScheduleGrid
            startDate={startDate}
            employees={filteredEmployees}
            selectedRoles={selectedRoles}
            onShiftClick={handleShiftClick}
            onAddShift={handleAddShift}
          />
        </View>
      </View>

      {/* Modals & Drawers */}
      <ShiftEditorModal
        open={shiftEditorOpen}
        onOpenChange={setShiftEditorOpen}
        shift={selectedShift as Shift}
        onSave={handleSaveShift}
        onSaveAndDuplicate={handleSaveAndDuplicate}
      />
      <PublishModal
        open={publishModalOpen}
        onOpenChange={setPublishModalOpen}
        onPublish={handlePublish}
        summary={publishSummary}
      />
      <OpenShiftsDrawer
        ref={openShiftsSheetRef}
        openShifts={shifts.filter((s) => s.isOpen)}
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
    </View>
  );
};

export default ScheduleDetailScreen;
