import { colors } from "@/lib/theme";
import { MerchantRole } from "@/lib/types";
import { useEmployeeStore, EmployeeProfile } from "@/stores/useEmployeeStore";
import { Eye, EyeOff } from "lucide-react-native";
import React, { useState } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";

const ROLE_LABELS: Record<MerchantRole, string> = {
  cashier: "Cashier",
  manager: "Manager",
  admin: "Admin",
  owner: "Owner",
};

const ROLE_COLORS: Record<MerchantRole, { bg: string; text: string }> = {
  cashier: { bg: colors.info + "20", text: colors.info },
  manager: { bg: colors.warning + "20", text: colors.warning },
  admin: { bg: colors.teal + "20", text: colors.teal },
  owner: { bg: colors.danger + "20", text: colors.danger },
};

export default function StaffPinsScreen() {
  const employees = useEmployeeStore((s) => s.employees);
  const [showAll, setShowAll] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const sorted = [...employees].sort((a, b) =>
    a.fullName.localeCompare(b.fullName)
  );

  const toggleOne = (id: string) => {
    setRevealed((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleAll = () => {
    const next = !showAll;
    setShowAll(next);
    if (!next) setRevealed({});
  };

  const isPinVisible = (emp: EmployeeProfile) =>
    showAll || !!revealed[emp.id];

  const renderItem = ({ item: emp }: { item: EmployeeProfile }) => {
    const roleStyle = ROLE_COLORS[emp.role] ?? ROLE_COLORS.cashier;
    const visible = isPinVisible(emp);
    const initial = (emp.displayName || emp.fullName)[0]?.toUpperCase() ?? "?";

    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 12,
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        {/* Avatar */}
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: colors.teal + "25",
            alignItems: "center",
            justifyContent: "center",
            marginRight: 12,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.teal }}>
            {initial}
          </Text>
        </View>

        {/* Name + role */}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.label }}>
            {emp.fullName}
          </Text>
          {emp.displayName && emp.displayName !== emp.fullName && (
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 1 }}>
              {emp.displayName}
            </Text>
          )}
          <View
            style={{
              alignSelf: "flex-start",
              marginTop: 4,
              paddingHorizontal: 7,
              paddingVertical: 2,
              borderRadius: 4,
              backgroundColor: roleStyle.bg,
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: "600", color: roleStyle.text }}>
              {ROLE_LABELS[emp.role] ?? emp.role}
            </Text>
          </View>
        </View>

        {/* PIN + toggle */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View
            style={{
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 8,
              paddingHorizontal: 14,
              paddingVertical: 8,
              minWidth: 72,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: "700",
                color: visible ? colors.label : colors.muted,
                letterSpacing: visible ? 3 : 6,
              }}
            >
              {visible ? (emp.pin ?? "—") : "●●●●"}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => toggleOne(emp.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {visible ? (
              <EyeOff size={18} color={colors.muted} />
            ) : (
              <Eye size={18} color={colors.muted} />
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen }}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 20,
          paddingVertical: 16,
          backgroundColor: colors.panel,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.heading }}>
          Staff PINs
        </Text>

        <TouchableOpacity
          onPress={toggleAll}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 12,
            paddingVertical: 7,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
          }}
        >
          {showAll ? (
            <EyeOff size={15} color={colors.label} />
          ) : (
            <Eye size={15} color={colors.label} />
          )}
          <Text style={{ fontSize: 13, fontWeight: "500", color: colors.label }}>
            {showAll ? "Hide All" : "Show All"}
          </Text>
        </TouchableOpacity>
      </View>

      {sorted.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 15, color: colors.muted }}>
            No employees loaded
          </Text>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(emp) => emp.id}
          renderItem={renderItem}
          style={{ backgroundColor: colors.panel }}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}
    </View>
  );
}
