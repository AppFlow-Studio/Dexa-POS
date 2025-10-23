import BottomSheet from "@gorhom/bottom-sheet";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Calendar,
  Download,
  Send,
  Settings,
  Sparkles,
  Users,
} from "lucide-react-native";
import React, { useRef, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  const router = useRouter();
  const [startDate, setStartDate] = useState(new Date(2025, 0, 13));
  const [viewMode, setViewMode] = useState<"employee" | "role">("employee");
  const [publishStatus, setPublishStatus] = useState<
    "draft" | "published" | "archived"
  >("draft");

  // State for modals and drawers
  const [shiftEditorOpen, setShiftEditorOpen] = useState(false);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
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
    setPublishStatus("published");
  };

  const handleShiftClick = (shift: Shift) => {
    setSelectedShift(shift);
    setShiftEditorOpen(true);
  };

  const handleApplyTemplate = (templateId: string) => {
    console.log("Applying template:", templateId);
  };

  const handleSaveShift = (shiftData: Partial<Shift>) => {
    console.log("Saving shift:", shiftData);
  };

  const handleSaveAndDuplicate = (shiftData: Partial<Shift>) => {
    console.log("Saving and duplicating shift:", shiftData);
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

  return (
    <View className="flex-1 bg-[#212121]">
      {/* Header */}
      <View className="border-b border-gray-700 bg-[#303030]">
        <View className="px-6 py-4">
          <View className="flex-row items-center justify-between mb-6">
            <View className="flex-row items-center gap-4">
              <TouchableOpacity onPress={() => router.back()}>
                <ArrowLeft size={24} color="#FFFFFF" />
              </TouchableOpacity>
              <View>
                <Text className="text-xl font-bold text-white">
                  Scheduling Dashboard
                </Text>
                <Text className="text-sm text-gray-400">
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
                <Text>
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
                  <Calendar className="w-4 h-4 text-blue-400" />
                  <Text className="text-sm font-semibold text-white">
                    Open Shifts
                  </Text>
                  <Badge className="ml-auto">
                    <Text>
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
                  <Users className="w-4 h-4 text-blue-400" />
                  <Text className="text-sm font-semibold text-white">
                    Swaps & Requests
                  </Text>
                  <Badge className="ml-auto">
                    <Text>
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
        </View>

        {/* Schedule Grid */}
        <View className="flex-1 flex-col overflow-hidden">
          <View className="border-b border-gray-700 bg-[#303030] px-6 py-3 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Button
                variant={viewMode === "employee" ? "default" : "ghost"}
                size="sm"
                onPress={() => setViewMode("employee")}
              >
                <Text>By Employee</Text>
              </Button>
              <Button
                variant={viewMode === "role" ? "default" : "ghost"}
                size="sm"
                onPress={() => setViewMode("role")}
              >
                <Text>By Role</Text>
              </Button>
            </View>

            <Text className="text-xs text-gray-400">
              Drag to move • Alt+Drag to duplicate • Right-click for options
            </Text>
          </View>

          <ScheduleGrid
            startDate={startDate}
            viewMode={viewMode}
            onShiftClick={handleShiftClick}
          />
        </View>
      </View>

      {/* Modals & Drawers */}
      <ShiftEditorModal
        open={shiftEditorOpen}
        onOpenChange={setShiftEditorOpen}
        shift={selectedShift}
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
        openShifts={mockShiftsScheudleGrid.filter((s) => s.isOpen)}
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
