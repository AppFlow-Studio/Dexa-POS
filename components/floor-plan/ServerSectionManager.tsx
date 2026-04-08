/**
 * ServerSectionManager
 *
 * Shows sections for the active floor plan with their assigned servers.
 * Managers can tap to assign/unassign clocked-in servers to sections.
 * Presented as a bottom sheet from the tables screen.
 */

import { colors } from "@/lib/theme";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { ServerSection } from "@/types/db-floor-plan-types";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { bottomSheetTheme } from "@/lib/theme";
import { Check, UserMinus, UserPlus, Users } from "lucide-react-native";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface ServerSectionManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

const ServerSectionManager: React.FC<ServerSectionManagerProps> = ({
  isOpen,
  onClose,
}) => {
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const sections = useFloorPlanStore((s) => s.sections);
  const sectionsById = useFloorPlanStore((s) => s.sectionsById);
  const assignServer = useFloorPlanStore((s) => s.assignServerToSection);
  const unassignServer = useFloorPlanStore((s) => s.unassignServerFromSection);
  const employees = useEmployeeStore((s) => s.employees);
  const sessions = useTimeclockStore((s) => s.sessions);

  const [selectingSection, setSelectingSection] = useState<string | null>(null);

  // Get clocked-in servers (have active timeclock session)
  const clockedInServers = useMemo(() => {
    return employees.filter((emp) => {
      return sessions[emp.id] != null;
    });
  }, [employees, sessions]);

  // Map staff profile IDs to employee display info
  const getEmployeeByProfileId = useCallback(
    (profileId: string) => {
      return employees.find((e) => e.profileId === profileId);
    },
    [employees]
  );

  // Handle sheet presentation
  React.useEffect(() => {
    if (isOpen) {
      bottomSheetRef.current?.present();
    } else {
      bottomSheetRef.current?.dismiss();
    }
  }, [isOpen]);

  const handleAssign = useCallback(
    async (sectionId: string, staffProfileId: string) => {
      await assignServer(sectionId, staffProfileId);
      setSelectingSection(null);
    },
    [assignServer]
  );

  const handleUnassign = useCallback(
    async (sectionId: string) => {
      await unassignServer(sectionId);
    },
    [unassignServer]
  );

  const renderSection = useCallback(
    (section: ServerSection) => {
      const assignedEmployee = section.assigned_staff_id
        ? getEmployeeByProfileId(section.assigned_staff_id)
        : null;
      const isSelecting = selectingSection === section.id;

      return (
        <View
          key={section.id}
          className="bg-panel border border-border rounded-xl p-4 mb-3"
        >
          {/* Section Header */}
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-row items-center gap-3">
              <View
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: section.color }}
              />
              <Text className="text-lg font-bold text-white">
                {section.name}
              </Text>
            </View>

            {assignedEmployee && !isSelecting ? (
              <TouchableOpacity
                onPress={() => handleUnassign(section.id)}
                className="flex-row items-center gap-2 px-3 py-1.5 rounded-lg bg-red-900/30 border border-red-800"
              >
                <UserMinus size={16} color={colors.danger} />
                <Text className="text-sm font-semibold text-red-400">
                  Unassign
                </Text>
              </TouchableOpacity>
            ) : !isSelecting ? (
              <TouchableOpacity
                onPress={() => setSelectingSection(section.id)}
                className="flex-row items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-900/30 border border-blue-800"
              >
                <UserPlus size={16} color={colors.info} />
                <Text className="text-sm font-semibold text-blue-400">
                  Assign
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => setSelectingSection(null)}
                className="px-3 py-1.5 rounded-lg bg-gray-700"
              >
                <Text className="text-sm font-semibold text-gray-300">
                  Cancel
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Current Assignment */}
          {assignedEmployee && !isSelecting && (
            <View className="flex-row items-center gap-2 px-3 py-2 rounded-lg bg-surface">
              <View className="w-8 h-8 rounded-full bg-teal items-center justify-center">
                <Text className="text-sm font-bold text-black">
                  {assignedEmployee.displayName
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2)}
                </Text>
              </View>
              <Text className="text-base font-semibold text-white">
                {assignedEmployee.displayName}
              </Text>
              <View className="px-2 py-0.5 rounded-full bg-green-900/30 border border-green-800">
                <Text className="text-xs text-green-400">Active</Text>
              </View>
            </View>
          )}

          {/* No Assignment */}
          {!assignedEmployee && !isSelecting && (
            <Text className="text-sm text-label italic">
              No server assigned
            </Text>
          )}

          {/* Server Selection List */}
          {isSelecting && (
            <View className="gap-2">
              <Text className="text-sm text-label mb-1">
                Select a clocked-in server:
              </Text>
              {clockedInServers.length === 0 ? (
                <Text className="text-sm text-label italic">
                  No servers currently clocked in
                </Text>
              ) : (
                clockedInServers.map((server) => {
                  const isCurrentlyAssigned =
                    section.assigned_staff_id === server.profileId;
                  // Check if server is assigned to another section
                  const otherSection = sections.find(
                    (s) =>
                      s.id !== section.id &&
                      s.assigned_staff_id === server.profileId
                  );

                  return (
                    <TouchableOpacity
                      key={server.id}
                      onPress={() =>
                        handleAssign(section.id, server.profileId)
                      }
                      className={`flex-row items-center gap-3 px-3 py-2.5 rounded-lg border ${
                        isCurrentlyAssigned
                          ? "bg-teal/10 border-teal"
                          : "bg-surface border-border"
                      }`}
                    >
                      <View className="w-8 h-8 rounded-full bg-gray-600 items-center justify-center">
                        <Text className="text-sm font-bold text-white">
                          {server.displayName
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .toUpperCase()
                            .slice(0, 2)}
                        </Text>
                      </View>
                      <View className="flex-1">
                        <Text className="text-base font-semibold text-white">
                          {server.displayName}
                        </Text>
                        {otherSection && (
                          <Text className="text-xs text-label">
                            Currently in: {otherSection.name}
                          </Text>
                        )}
                      </View>
                      {isCurrentlyAssigned && (
                        <Check size={18} color={colors.teal} />
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          )}
        </View>
      );
    },
    [
      getEmployeeByProfileId,
      selectingSection,
      clockedInServers,
      handleAssign,
      handleUnassign,
      sections,
    ]
  );

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      snapPoints={["60%", "85%"]}
      onDismiss={onClose}
      enablePanDownToClose
      {...bottomSheetTheme}
      backdropComponent={(props) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.5}
        />
      )}
    >
      <BottomSheetScrollView
        contentContainerStyle={{ padding: 16 }}
      >
        {/* Header */}
        <View className="flex-row items-center gap-3 mb-4">
          <Users size={24} color={colors.teal} />
          <Text className="text-2xl font-bold text-white">
            Server Sections
          </Text>
        </View>

        <Text className="text-sm text-label mb-4">
          Assign clocked-in servers to sections. Tables in assigned sections
          will auto-assign the server when guests are seated.
        </Text>

        {/* Sections List */}
        {sections.length === 0 ? (
          <View className="items-center py-8">
            <Text className="text-base text-label">
              No sections configured for this floor plan.
            </Text>
            <Text className="text-sm text-label mt-1">
              Add sections in the floor plan editor.
            </Text>
          </View>
        ) : (
          sections.map(renderSection)
        )}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
};

export default ServerSectionManager;
