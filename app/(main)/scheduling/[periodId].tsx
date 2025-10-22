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
import { SafeAreaView } from "react-native-safe-area-context";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Placeholder Imports - These will be fleshed out in later tasks
import FiltersPanel from "@/components/scheduling/FiltersPanel";
import LaborMeter from "@/components/scheduling/LaborMeter";
import OpenShiftsDrawer from "@/components/scheduling/OpenShiftsDrawer";
import PublishModal from "@/components/scheduling/PublishModal";
import ScheduleGrid from "@/components/scheduling/ScheduleGrid";
import ShiftEditorModal from "@/components/scheduling/ShiftEditorModal";
import TemplateDrawer from "@/components/scheduling/TemplateDrawer";
import WeekSelector from "@/components/scheduling/WeekSelector";
import { Role } from "@/lib/types";
import { Shift } from "@/lib/mock-data";

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
    // Here you would typically show a toast notification
  };

  const handleShiftClick = (shift: Shift) => {
    setSelectedShift(shift);
    setShiftEditorOpen(true);
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
    <SafeAreaView edges={["top"]} className="flex-1 bg-[#212121]">
      {/* Header */}
      <View className="border-b border-gray-700 bg-[#303030]">
        <View className="px-6 py-4">
          <View className="flex-row items-center justify-between mb-4">
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

            <View className="flex-row items-center gap-3">
              <Select
                defaultValue={{
                  value: "location-1",
                  label: "Downtown Location",
                }}
              >
                <SelectTrigger className="w-[180px] bg-[#212121]">
                  <SelectValue placeholder="Select a location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem label="Downtown Location" value="location-1" />
                  {/* Add other locations here */}
                </SelectContent>
              </Select>

              <WeekSelector />

              <Badge
                className={statusColors[publishStatus]}
              >
                {publishStatus.charAt(0).toUpperCase() + publishStatus.slice(1)}
              </Badge>
            </View>
          </View>

          <View className="flex-row items-center justify-between">
            <LaborMeter
              projectedCost={12500}
              forecastSales={45000}
              period="week"
            />

            <View className="flex-row items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 bg-transparent"
              >
                <Sparkles className="w-4 h-4 text-white" />
                <Text className="text-white">Generate Draft</Text>
              </Button>
              <Button
                size="sm"
                className="gap-2"
                onPress={() => setPublishModalOpen(true)}
              >
                <Send className="w-4 h-4 text-white" />
                <Text>Publish</Text>
              </Button>
              <Button variant="ghost" size="sm" className="gap-2">
                <Download className="w-4 h-4 text-white" />
                <Text className="text-white">Export</Text>
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Settings className="w-4 h-4 text-white" />
              </Button>
            </View>
          </View>
        </View>
      </View>

      {/* Main Content */}
      <View className="flex-1 flex-row overflow-hidden">
        {/* Left Sidebar */}
        <View className="w-64 border-r border-gray-700 bg-[#303030] p-4">
          <View className="space-y-6">
            <TemplateDrawer />

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
                  <Badge className="ml-auto">0</Badge>
                </View>
                <Text className="text-xs text-gray-400">
                  View and manage open shifts
                </Text>
              </TouchableOpacity>
            </View>

            <View className="border-t border-gray-700 pt-6">
              <TouchableOpacity
                onPress={() => {}}
                className="w-full text-left hover:bg-gray-700/50 p-2 rounded-lg transition-colors"
              >
                <View className="flex-row items-center gap-2 mb-2">
                  <Users className="w-4 h-4 text-blue-400" />
                  <Text className="text-sm font-semibold text-white">
                    Swaps & Requests
                  </Text>
                  <Badge className="ml-auto">0</Badge>
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

          <ScheduleGrid startDate={startDate} viewMode={viewMode} onShiftClick={handleShiftClick} />
        </View>
      </View>

      {/* Modals & Drawers */}
      <ShiftEditorModal />
      <PublishModal
        open={publishModalOpen}
        onOpenChange={setPublishModalOpen}
        onPublish={handlePublish}
        summary={publishSummary}
      />
      <OpenShiftsDrawer
        ref={openShiftsSheetRef}
        openShifts={[]}
        onAssign={() => {}}
        onCloseShift={() => {}}
      />
    </SafeAreaView>
  );
};

export default ScheduleDetailScreen;
