import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { Calendar } from "lucide-react-native";
import React, { forwardRef, useMemo, useState } from "react";
import { Text, View } from "react-native";
import PTORequestCard from "./PTORequestCard";
import SwapRequestCard from "./SwapRequestCard";

// Mock data and types for demonstration
export type Role = "Cashier" | "Barista" | "Line Cook" | "Prep" | "Supervisor";
export interface Shift {
  id: string;
  employeeId: string | null;
  role: Role;
  start: string;
  end: string;
  date: string;
  requiredCount: number;
  isOpen: boolean;
}
const mockEmployees = [
  { id: "4", name: "Tyler Kim" },
  { id: "6", name: "Jordan Lee" },
];
const formatTime = (time: string) => time; // Placeholder

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

    const getApplicants = (shiftId: string) => mockApplicants[shiftId] || [];
    const getEmployeeName = (employeeId: string) =>
      mockEmployees.find((e) => e.id === employeeId)?.name || "Unknown";

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
          <Tabs value="open-shifts" onValueChange={() => {}} className="flex-1">
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
                          className="p-4 bg-[#303030] border-gray-700"
                        >
                          {/* Open Shift Card Content */}
                        </Card>
                      );
                    })
                  )}
                </View>
              </TabsContent>
              <TabsContent value="swaps">
                <View className="p-6 space-y-4">
                  <SwapRequestCard
                    fromEmployee="Sarah Chen"
                    toEmployee="Jordan Lee"
                    shift={{
                      role: "Cashier",
                      date: "Jan 13",
                      time: "8:00 AM - 4:00 PM",
                    }}
                    reason="Schedule conflict"
                    onApprove={() => {}}
                    onDeny={() => {}}
                  />
                  <SwapRequestCard
                    fromEmployee="Marcus Johnson"
                    toEmployee="Aisha Patel"
                    shift={{
                      role: "Line Cook",
                      date: "Jan 13",
                      time: "10:00 AM - 6:00 PM",
                    }}
                    onApprove={() => {}}
                    onDeny={() => {}}
                  />
                </View>
              </TabsContent>
              <TabsContent value="pto">
                <View className="p-6 space-y-4">
                  <PTORequestCard
                    employee="Tyler Kim"
                    startDate="Jan 15"
                    endDate="Jan 16"
                    reason="Family event"
                    onApprove={() => {}}
                    onDeny={() => {}}
                  />
                  <PTORequestCard
                    employee="Maya Thompson"
                    startDate="Jan 17"
                    endDate="Jan 17"
                    reason="Medical appointment"
                    onApprove={() => {}}
                    onDeny={() => {}}
                  />
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
