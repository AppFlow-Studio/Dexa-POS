import { colors } from "@/lib/theme";
import { useEmployeeStore, type EmployeeProfile } from "@/stores/useEmployeeStore";
import React, { useMemo } from "react";
import { Text, View } from "react-native";
import { initials } from "../../lib/format";
import { tint } from "../../lib/tokens";
import { type } from "../../lib/type";
import { BottomSheet, ListRow } from "../../primitives";

/**
 * Who can take the tables: clocked-in staff other than the signed-in server
 * — the register's ServerSelectSheet rule, without its search (a shift's
 * clocked-in list fits one sheet).
 */
export function ServerPickerSheet({
  selectedId,
  onPick,
  onClose,
}: {
  selectedId: string | null;
  onPick: (employee: EmployeeProfile) => void;
  onClose: () => void;
}) {
  const employees = useEmployeeStore((s) => s.employees);
  const me = useEmployeeStore((s) => s.loggedInEmployee?.profileId ?? null);
  const staff = useMemo(
    () =>
      employees
        .filter((e) => e.shiftStatus === "clocked_in" && e.profileId !== me)
        .sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [employees, me],
  );

  return (
    <BottomSheet visible onClose={onClose} title="Transfer to" subtitle="Clocked-in staff">
      {staff.length === 0 ? (
        <Text className="px-5 pb-6" style={[type.sheetDesc, { color: colors.label }]}>
          No one else is clocked in.
        </Text>
      ) : (
        <View className="pb-4">
          {staff.map((e, i) => (
            <ListRow
              key={e.profileId}
              tile={{ bg: tint.accentSoft, fg: colors.teal, label: initials(e.fullName) }}
              title={e.fullName}
              detail={e.role ? e.role.charAt(0).toUpperCase() + e.role.slice(1) : undefined}
              selected={e.profileId === selectedId}
              divider={i > 0}
              onPress={() => {
                onPick(e);
                onClose();
              }}
            />
          ))}
        </View>
      )}
    </BottomSheet>
  );
}
