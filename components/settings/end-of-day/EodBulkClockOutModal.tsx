import { bottomSheetTheme, colors } from "@/lib/theme";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";

interface EodBulkClockOutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatElapsed(clockInTime: Date): string {
  const ms = Date.now() - clockInTime.getTime();
  const totalMinutes = Math.floor(ms / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default function EodBulkClockOutModal({
  isOpen,
  onClose,
}: EodBulkClockOutModalProps) {
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const supabase = useSupabaseClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sessions = useTimeclockStore((s) => s.sessions);
  const forceClockOutAll = useTimeclockStore((s) => s.forceClockOutAll);
  const employees = useEmployeeStore((s) => s.employees);
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const locationId = selectedStore?.id;

  const activeStaff = useMemo(
    () =>
      Object.values(sessions).map((session) => {
        const employee = employees.find((e) => e.id === session.employeeId);
        return { session, employee };
      }),
    [sessions, employees]
  );

  useEffect(() => {
    if (isOpen) {
      bottomSheetRef.current?.present();
    } else {
      bottomSheetRef.current?.dismiss();
    }
  }, [isOpen]);

  const handleConfirm = useCallback(async () => {
    if (!locationId || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await supabase
        .from("staff_shifts")
        .update({
          status: "completed",
          clock_out_time: new Date().toISOString(),
        })
        .eq("location_id", locationId)
        .in("status", ["active", "on_break"]);
    } catch (err) {
      console.warn("[EodBulkClockOut] Supabase update error:", err);
    }
    forceClockOutAll();
    setIsSubmitting(false);
    onClose();
  }, [locationId, isSubmitting, supabase, forceClockOutAll, onClose]);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.6}
      />
    ),
    []
  );

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      snapPoints={["55%"]}
      onDismiss={onClose}
      backdropComponent={renderBackdrop}
      {...bottomSheetTheme}
    >
      <BottomSheetScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
      >
        {/* Header */}
        <View style={{ marginBottom: 16 }}>
          <Text
            style={{ fontSize: 18, fontWeight: "700", color: colors.heading }}
          >
            End All Shifts
          </Text>
          <Text style={{ fontSize: 13, color: colors.label, marginTop: 4 }}>
            {activeStaff.length > 0
              ? `${activeStaff.length} staff member${activeStaff.length > 1 ? "s" : ""} currently clocked in`
              : "All staff are clocked out"}
          </Text>
        </View>

        {activeStaff.length > 0 && (
          <View
            style={{
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.danger + "40",
              backgroundColor: colors.danger + "12",
              padding: 12,
              marginBottom: 16,
            }}
          >
            <Text style={{ fontSize: 12, color: colors.danger, fontWeight: "600" }}>
              This will immediately clock out all active staff. This action cannot be undone.
            </Text>
          </View>
        )}

        {activeStaff.length === 0 ? (
          <View
            style={{
              paddingVertical: 24,
              alignItems: "center",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.screen,
              marginBottom: 16,
            }}
          >
            <Text style={{ fontSize: 14, color: colors.label }}>
              No active shifts — all staff are clocked out.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 8, marginBottom: 16 }}>
            {activeStaff.map(({ session, employee }) => (
              <View
                key={session.employeeId}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                }}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: colors.heading,
                    }}
                  >
                    {employee?.displayName || employee?.fullName || "Unknown"}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.label }}>
                    {employee?.role ?? "Employee"} ·{" "}
                    {formatElapsed(session.clockInTime)}
                  </Text>
                </View>
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 6,
                    backgroundColor:
                      session.status === "onBreak"
                        ? colors.warning + "25"
                        : colors.teal + "25",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "600",
                      color:
                        session.status === "onBreak" ? colors.warning : colors.teal,
                    }}
                  >
                    {session.status === "onBreak" ? "On Break" : "Clocked In"}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Action buttons */}
        {activeStaff.length > 0 && (
          <TouchableOpacity
            onPress={handleConfirm}
            disabled={isSubmitting}
            style={{
              backgroundColor: colors.danger,
              paddingVertical: 14,
              borderRadius: 12,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
              gap: 8,
              marginBottom: 10,
              opacity: isSubmitting ? 0.5 : 1,
            }}
          >
            {isSubmitting && <ActivityIndicator size="small" color={colors.onSolid} />}
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.onSolid }}>
              End All Shifts
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={onClose}
          style={{
            paddingVertical: 12,
            borderRadius: 12,
            alignItems: "center",
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text
            style={{ fontSize: 14, fontWeight: "600", color: colors.label }}
          >
            {activeStaff.length === 0 ? "Close" : "Cancel"}
          </Text>
        </TouchableOpacity>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}
