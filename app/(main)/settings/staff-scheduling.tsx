import PeriodWizard, { PeriodData } from "@/components/scheduling/PeriodWizard";
import QuickScheduleModal from "@/components/scheduling/QuickScheduleModal";
import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useScheduleStore } from "@/stores/useScheduleStore"; // Import schedule store
import { useScheduleTemplateStore } from "@/stores/useScheduleTemplateStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { addDays, format, parseISO } from "date-fns";
import { useRouter } from "expo-router"; // Import router
import {
  AlertTriangle,
  Calendar,
  Clock,
  Copy,
  FileText,
  Plus,
  Trash2,
} from "lucide-react-native";
import React, { useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

const StaffSchedulingScreen = () => {
  const router = useRouter();
  const { templates, activeTemplateIds, actions } = useScheduleTemplateStore();
  const { scheduling, updateSchedulingSettings } = useStoreSettingsStore();
  const { addWeeklySchedule, addSchedulePeriod } = useScheduleStore(); // Get actions
  const { loggedInEmployee } = useEmployeeStore();

  const [isScheduleTypeOpen, setIsScheduleTypeOpen] = useState(false);
  const [isQuickScheduleOpen, setIsQuickScheduleOpen] = useState(false);
  const [isPeriodWizardOpen, setIsPeriodWizardOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null
  );
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null);

  const handleCreateTemplate = () => {
    router.push({
      pathname: "/scheduling/templates",
      params: { returnTo: "/settings/staff-scheduling" },
    });
  };

  const handleUseTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    setIsScheduleTypeOpen(true);
  };

  const handleCreateWeeklySchedule = (startDate: string) => {
    const newId = addWeeklySchedule({
      name: `Week of ${format(parseISO(startDate), "MMM d")}`,
      startDate: startDate,
      endDate: format(addDays(parseISO(startDate), 6), "yyyy-MM-dd"),
      status: "draft",
      type: "weekly",
      createdBy: loggedInEmployee?.id || "system",
    });

    setIsQuickScheduleOpen(false);
    setIsScheduleTypeOpen(false); // Ensure this is closed too

    if (newId && selectedTemplateId) {
      router.push({
        pathname: "/(main)/scheduling/[periodId]",
        params: { periodId: newId, applyTemplateId: selectedTemplateId },
      });
      setSelectedTemplateId(null);
    }
  };

  const handleCreatePeriodSchedule = (data: PeriodData) => {
    const newId = addSchedulePeriod({
      name: data.name,
      startDate: data.startDate,
      endDate: data.endDate,
      status: "draft",
      type: "period",
      createdBy: loggedInEmployee?.id || "system",
    });

    setIsPeriodWizardOpen(false);
    setIsScheduleTypeOpen(false);

    if (newId && selectedTemplateId) {
      router.push({
        pathname: "/(main)/scheduling/[periodId]",
        params: { periodId: newId, applyTemplateId: selectedTemplateId },
      });
      setSelectedTemplateId(null);
    }
  };

  const stats = {
    totalTemplates: templates.length,
    activeTemplates: activeTemplateIds.length,
  };

  return (
    <View className="flex-1 bg-[#212121] p-6">
      <View className="mb-6">
        <Text className="text-3xl font-bold text-white">
          Staff & Scheduling
        </Text>
        <Text className="text-gray-400 mt-2">
          Manage staff schedules, templates, and conflicts.
        </Text>
      </View>

      <View className="h-[1px] w-full bg-gray-700 mb-6" />

      <ScrollView showsVerticalScrollIndicator={false}>
        <View className="gap-8 pb-10">
          {/* Schedule Templates Section */}
          <View className="gap-4">
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-xl font-bold text-white">
                  Schedule Templates
                </Text>
                <Text className="text-gray-400 text-sm">
                  Pre-built schedules for common shifts
                </Text>
              </View>
              <Button
                className="flex-row items-center gap-2 bg-blue-600 hover:bg-blue-700 data-[active=true]:bg-blue-700"
                onPress={handleCreateTemplate}
              >
                <Plus size={16} color="white" />
                <Text className="text-white font-semibold">
                  Create Template
                </Text>
              </Button>
            </View>

            {templates.length === 0 ? (
              <View className="bg-[#303030] border border-gray-600 rounded-xl p-8 items-center justify-center gap-4">
                <View className="h-16 w-16 bg-gray-700 rounded-full items-center justify-center">
                  <FileText size={32} color="#9CA3AF" />
                </View>
                <Text className="text-gray-300 font-medium">
                  No templates created yet
                </Text>
                <Button
                  variant="outline"
                  className="border-gray-500"
                  onPress={() => {
                    actions.addTemplate({
                      name: "Standard Weekday",
                      description: "9 AM - 5 PM shifts for M-F",
                      tags: ["weekday", "standard"],
                      lastUsed: new Date(),
                      shifts: [], // Would normally open editor
                    });
                  }}
                >
                  <Text className="text-gray-300">
                    Create your first template
                  </Text>
                </Button>
              </View>
            ) : (
              <View className="gap-3">
                {templates.map((template) => (
                  <View
                    key={template.id}
                    className="bg-[#303030] border border-gray-600 rounded-lg p-4 flex-row justify-between items-center"
                  >
                    <View className="flex-row items-center gap-4">
                      <View className="h-10 w-10 bg-blue-500/20 rounded-lg items-center justify-center">
                        <Calendar size={20} color="#3B82F6" />
                      </View>
                      <View>
                        <Text className="text-white font-semibold text-lg">
                          {template.name}
                        </Text>
                        <Text className="text-gray-400 text-sm">
                          {template.shifts.length} shifts configured
                        </Text>
                      </View>
                    </View>

                    <View className="flex-row gap-2">
                      <TouchableOpacity
                        className="bg-[#212121] px-3 py-2 rounded-md border border-gray-600"
                        onPress={() => handleUseTemplate(template.id)}
                      >
                        <Text className="text-gray-300 font-medium">
                          Use Template
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        className="p-2 border border-gray-600 rounded-md bg-[#212121]"
                        onPress={() => actions.duplicateTemplate(template.id)}
                      >
                        <Copy size={16} color="#9CA3AF" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        className="p-2 border border-red-900/50 bg-red-900/20 rounded-md"
                        onPress={() => setTemplateToDelete(template.id)}
                      >
                        <Trash2 size={16} color="#F87171" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Conflict Detection Section */}
          <Card className="bg-[#303030] border-gray-600">
            <CardHeader>
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-3">
                  <AlertTriangle color="#F59E0B" size={24} />
                  <View>
                    <CardTitle className="text-white">
                      Conflict Detection
                    </CardTitle>
                    <CardDescription className="text-gray-400">
                      Automatically identify scheduling issues
                    </CardDescription>
                  </View>
                </View>
                <Switch
                  checked={scheduling?.autoDetectConflicts}
                  onCheckedChange={(val) =>
                    updateSchedulingSettings({ autoDetectConflicts: val })
                  }
                />
              </View>
            </CardHeader>

            {scheduling?.autoDetectConflicts && (
              <CardContent className="gap-6 pt-0">
                <View className="h-[1px] bg-gray-700 w-full" />

                <View className="gap-4">
                  <Text className="text-white font-medium">
                    Conflict Types Tracked
                  </Text>

                  <View className="gap-3">
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center gap-2">
                        <View className="h-2 w-2 rounded-full bg-orange-500" />
                        <Text className="text-gray-300">
                          Double-booked shifts
                        </Text>
                      </View>
                      <Switch
                        checked={scheduling.conflictTypes?.doubleBooked}
                        onCheckedChange={(val) =>
                          updateSchedulingSettings({
                            conflictTypes: {
                              ...scheduling.conflictTypes,
                              doubleBooked: val,
                            },
                          })
                        }
                      />
                    </View>

                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center gap-2">
                        <View className="h-2 w-2 rounded-full bg-orange-500" />
                        <Text className="text-gray-300">
                          Overtime approaching ({">"}40h)
                        </Text>
                      </View>
                      <Switch
                        checked={scheduling.conflictTypes?.overtime}
                        onCheckedChange={(val) =>
                          updateSchedulingSettings({
                            conflictTypes: {
                              ...scheduling.conflictTypes,
                              overtime: val,
                            },
                          })
                        }
                      />
                    </View>

                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center gap-2">
                        <View className="h-2 w-2 rounded-full bg-orange-500" />
                        <Text className="text-gray-300">
                          Minimum staffing not met
                        </Text>
                      </View>
                      <Switch
                        checked={scheduling.conflictTypes?.minStaffing}
                        onCheckedChange={(val) =>
                          updateSchedulingSettings({
                            conflictTypes: {
                              ...scheduling.conflictTypes,
                              minStaffing: val,
                            },
                          })
                        }
                      />
                    </View>

                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center gap-2">
                        <View className="h-2 w-2 rounded-full bg-orange-500" />
                        <Text className="text-gray-300">
                          Back-to-back shifts ({"<"}10hr gap)
                        </Text>
                      </View>
                      <Switch
                        checked={scheduling.conflictTypes?.backToBack}
                        onCheckedChange={(val) =>
                          updateSchedulingSettings({
                            conflictTypes: {
                              ...scheduling.conflictTypes,
                              backToBack: val,
                            },
                          })
                        }
                      />
                    </View>
                  </View>
                </View>

                <View className="bg-[#212121] rounded-lg border border-gray-700 p-3 flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <AlertTriangle size={16} color="#F59E0B" />
                    <Text className="text-gray-300">
                      View Current Conflicts
                    </Text>
                  </View>
                  <Badge className="bg-orange-500/20 border-orange-500/50">
                    <Text className="text-orange-500 font-bold">0 Active</Text>
                  </Badge>
                </View>
              </CardContent>
            )}
          </Card>
        </View>
      </ScrollView>

      {/* Select Schedule Type Modal */}
      <Dialog open={isScheduleTypeOpen} onOpenChange={setIsScheduleTypeOpen}>
        <DialogContent className="w-[500px] max-w-lg bg-[#303030] rounded-2xl border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white text-xl font-bold">
              Create New Schedule
            </DialogTitle>
          </DialogHeader>
          <View className="py-2 gap-4">
            <Text className="text-gray-400">
              Where would you like to apply this template?
            </Text>

            <TouchableOpacity
              className="bg-[#212121] p-4 rounded-xl border border-gray-600 flex-row items-center gap-4 hover:bg-gray-800"
              onPress={() => {
                setIsScheduleTypeOpen(false);
                setIsQuickScheduleOpen(true);
              }}
            >
              <View className="h-12 w-12 rounded-full bg-blue-500/10 items-center justify-center">
                <Clock size={24} color="#3B82F6" />
              </View>
              <View className="flex-1">
                <Text className="text-white font-bold text-lg">
                  Quick Schedule
                </Text>
                <Text className="text-gray-400">
                  Create a standard 7-day schedule
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              className="bg-[#212121] p-4 rounded-xl border border-gray-600 flex-row items-center gap-4 hover:bg-gray-800"
              onPress={() => {
                setIsScheduleTypeOpen(false);
                setIsPeriodWizardOpen(true);
              }}
            >
              <View className="h-12 w-12 rounded-full bg-purple-500/10 items-center justify-center">
                <Calendar size={24} color="#A855F7" />
              </View>
              <View className="flex-1">
                <Text className="text-white font-bold text-lg">
                  Custom Period
                </Text>
                <Text className="text-gray-400">
                  Define a specific date range (e.g. Month)
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </DialogContent>
      </Dialog>

      {/* Creation Modals */}
      <QuickScheduleModal
        isOpen={isQuickScheduleOpen}
        onClose={() => setIsQuickScheduleOpen(false)}
        onCreate={handleCreateWeeklySchedule}
      />

      <PeriodWizard
        isOpen={isPeriodWizardOpen}
        onClose={() => setIsPeriodWizardOpen(false)}
        onComplete={handleCreatePeriodSchedule}
      />

      <ConfirmationModal
        isOpen={!!templateToDelete}
        onClose={() => setTemplateToDelete(null)}
        onConfirm={() => {
          if (templateToDelete) {
            actions.deleteTemplate(templateToDelete);
            setTemplateToDelete(null);
          }
        }}
        title="Delete Template"
        description="Are you sure you want to delete this template? This action cannot be undone."
        confirmText="Delete"
        variant="destructive"
      />
    </View>
  );
};

export default StaffSchedulingScreen;
