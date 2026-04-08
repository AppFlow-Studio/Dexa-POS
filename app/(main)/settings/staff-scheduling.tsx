import PeriodWizard, { PeriodData } from "@/components/scheduling/PeriodWizard";
import QuickScheduleModal from "@/components/scheduling/QuickScheduleModal";
import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import { Switch } from "@/components/ui/switch";
import { colors } from "@/lib/theme";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useScheduleStore } from "@/stores/useScheduleStore";
import { useScheduleTemplateStore } from "@/stores/useScheduleTemplateStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { addDays, format, parseISO } from "date-fns";
import { useRouter } from "expo-router";
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
import { Modal, ScrollView, Text, TouchableOpacity, View } from "react-native";

const StaffSchedulingScreen = () => {
  const router = useRouter();
  const { templates, activeTemplateIds, actions } = useScheduleTemplateStore();
  const scheduling = useStoreSettingsStore((s) => s.scheduling);
  const updateSchedulingSettings = useStoreSettingsStore((s) => s.updateSchedulingSettings);
  const { addWeeklySchedule, addSchedulePeriod } = useScheduleStore();
  const { loggedInEmployee } = useEmployeeStore();

  const [isScheduleTypeOpen, setIsScheduleTypeOpen] = useState(false);
  const [isQuickScheduleOpen, setIsQuickScheduleOpen] = useState(false);
  const [isPeriodWizardOpen, setIsPeriodWizardOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
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
    setIsScheduleTypeOpen(false);

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
    <View style={{ flex: 1, backgroundColor: colors.screen, padding: 20 }}>
      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontSize: 15, fontWeight: "700", color: colors.heading }}>Staff & Scheduling</Text>
        <Text style={{ fontSize: 12, color: colors.label, marginTop: 2 }}>Manage staff schedules, templates, and conflicts.</Text>
      </View>

      <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 16 }} />

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={{ gap: 14, paddingBottom: 40 }}>

          {/* Schedule Templates Section */}
          <View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <View>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.heading }}>Schedule Templates</Text>
                <Text style={{ fontSize: 11, color: colors.label, marginTop: 2 }}>Pre-built schedules for common shifts</Text>
              </View>
              <TouchableOpacity
                onPress={handleCreateTemplate}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  backgroundColor: colors.teal + "20",
                  borderWidth: 1,
                  borderColor: colors.teal + "50",
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <Plus size={14} color={colors.teal} />
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.teal }}>Create Template</Text>
              </TouchableOpacity>
            </View>

            {templates.length === 0 ? (
              <View style={{
                backgroundColor: colors.panel,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                padding: 28,
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
              }}>
                <View style={{
                  width: 52,
                  height: 52,
                  backgroundColor: colors.card,
                  borderRadius: 26,
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <FileText size={24} color={colors.label} />
                </View>
                <Text style={{ fontSize: 13, color: colors.label, fontWeight: "600" }}>No templates created yet</Text>
                <TouchableOpacity
                  onPress={() => {
                    actions.addTemplate({
                      name: "Standard Weekday",
                      description: "9 AM - 5 PM shifts for M-F",
                      tags: ["weekday", "standard"],
                      lastUsed: new Date(),
                      shifts: [],
                    });
                  }}
                  style={{
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 8,
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                  }}
                >
                  <Text style={{ fontSize: 12, color: colors.label }}>Create your first template</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {templates.map((template) => (
                  <View
                    key={template.id}
                    style={{
                      backgroundColor: colors.panel,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 10,
                      padding: 12,
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                      <View style={{
                        width: 32,
                        height: 32,
                        backgroundColor: colors.teal + "15",
                        borderRadius: 8,
                        alignItems: "center",
                        justifyContent: "center",
                      }}>
                        <Calendar size={16} color={colors.teal} />
                      </View>
                      <View>
                        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.heading }}>{template.name}</Text>
                        <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>{template.shifts.length} shifts configured</Text>
                      </View>
                    </View>

                    <View style={{ flexDirection: "row", gap: 6 }}>
                      <TouchableOpacity
                        onPress={() => handleUseTemplate(template.id)}
                        style={{
                          backgroundColor: colors.teal + "15",
                          borderWidth: 1,
                          borderColor: colors.teal + "40",
                          borderRadius: 6,
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                        }}
                      >
                        <Text style={{ fontSize: 11, color: colors.teal, fontWeight: "600" }}>Use Template</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => actions.duplicateTemplate(template.id)}
                        style={{
                          padding: 7,
                          borderWidth: 1,
                          borderColor: colors.border,
                          borderRadius: 6,
                          backgroundColor: "transparent",
                        }}
                      >
                        <Copy size={14} color={colors.label} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setTemplateToDelete(template.id)}
                        style={{
                          padding: 7,
                          borderWidth: 1,
                          borderColor: colors.danger + "30",
                          borderRadius: 6,
                          backgroundColor: colors.danger + "15",
                        }}
                      >
                        <Trash2 size={14} color={colors.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Conflict Detection Section */}
          <View style={{
            backgroundColor: colors.panel,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
          }}>
            <View style={{
              padding: 14,
              borderBottomWidth: scheduling?.autoDetectConflicts ? 1 : 0,
              borderBottomColor: colors.border,
            }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                  <View style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    backgroundColor: colors.warning + "15",
                    alignItems: "center",
                    justifyContent: "center",
                  }}>
                    <AlertTriangle size={16} color={colors.warning} />
                  </View>
                  <View>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: colors.heading }}>Conflict Detection</Text>
                    <Text style={{ fontSize: 11, color: colors.label, marginTop: 1 }}>Automatically identify scheduling issues</Text>
                  </View>
                </View>
                <Switch
                  checked={scheduling?.autoDetectConflicts}
                  onCheckedChange={(val) => updateSchedulingSettings({ autoDetectConflicts: val })}
                />
              </View>
            </View>

            {scheduling?.autoDetectConflicts && (
              <View style={{ padding: 14, gap: 14 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.heading }}>Conflict Types Tracked</Text>

                <View style={{ gap: 10 }}>
                  {[
                    { label: "Double-booked shifts", key: "doubleBooked" as const, value: scheduling.conflictTypes?.doubleBooked },
                    { label: "Overtime approaching (>40h)", key: "overtime" as const, value: scheduling.conflictTypes?.overtime },
                    { label: "Minimum staffing not met", key: "minStaffing" as const, value: scheduling.conflictTypes?.minStaffing },
                    { label: "Back-to-back shifts (<10hr gap)", key: "backToBack" as const, value: scheduling.conflictTypes?.backToBack },
                  ].map((item, idx, arr) => (
                    <View
                      key={item.key}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingBottom: idx < arr.length - 1 ? 10 : 0,
                        borderBottomWidth: idx < arr.length - 1 ? 1 : 0,
                        borderBottomColor: colors.border,
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.warning }} />
                        <Text style={{ fontSize: 12, color: colors.label }}>{item.label}</Text>
                      </View>
                      <Switch
                        checked={item.value}
                        onCheckedChange={(val) =>
                          updateSchedulingSettings({
                            conflictTypes: {
                              ...scheduling.conflictTypes,
                              [item.key]: val,
                            },
                          })
                        }
                      />
                    </View>
                  ))}
                </View>

                <View style={{
                  backgroundColor: colors.card,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                  padding: 10,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <AlertTriangle size={14} color={colors.warning} />
                    <Text style={{ fontSize: 12, color: colors.label }}>View Current Conflicts</Text>
                  </View>
                  <View style={{
                    backgroundColor: colors.warning + "20",
                    borderWidth: 1,
                    borderColor: colors.warning + "50",
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 20,
                  }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: colors.warning }}>0 Active</Text>
                  </View>
                </View>
              </View>
            )}
          </View>

        </View>
      </ScrollView>

      {/* Select Schedule Type Modal */}
      <Modal
        visible={isScheduleTypeOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsScheduleTypeOpen(false)}
        statusBarTranslucent
      >
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.7)", paddingHorizontal: 16 }}>
          <View style={{
            width: "100%",
            maxWidth: 500,
            backgroundColor: colors.panel,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: "hidden",
          }}>
            <View style={{
              padding: 16,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
              backgroundColor: colors.card,
            }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.heading }}>Create New Schedule</Text>
            </View>

            <View style={{ padding: 16, gap: 10 }}>
              <Text style={{ fontSize: 12, color: colors.label, marginBottom: 4 }}>Where would you like to apply this template?</Text>

              <TouchableOpacity
                onPress={() => {
                  setIsScheduleTypeOpen(false);
                  setIsQuickScheduleOpen(true);
                }}
                style={{
                  backgroundColor: colors.card,
                  padding: 14,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.border,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <View style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: colors.teal + "15",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <Clock size={20} color={colors.teal} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: colors.heading }}>Quick Schedule</Text>
                  <Text style={{ fontSize: 11, color: colors.label, marginTop: 2 }}>Create a standard 7-day schedule</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setIsScheduleTypeOpen(false);
                  setIsPeriodWizardOpen(true);
                }}
                style={{
                  backgroundColor: colors.card,
                  padding: 14,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.border,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <View style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: "#8b5cf6" + "20",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <Calendar size={20} color="#A855F7" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: colors.heading }}>Custom Period</Text>
                  <Text style={{ fontSize: 11, color: colors.label, marginTop: 2 }}>Define a specific date range (e.g. Month)</Text>
                </View>
              </TouchableOpacity>
            </View>

            <View style={{ padding: 14, borderTopWidth: 1, borderTopColor: colors.border }}>
              <TouchableOpacity
                onPress={() => setIsScheduleTypeOpen(false)}
                style={{
                  paddingVertical: 10,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 12, color: colors.label, fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
