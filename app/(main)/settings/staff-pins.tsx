import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { MerchantRole } from "@/lib/types";
import { useEmployeeStore, EmployeeProfile } from "@/stores/useEmployeeStore";
import { Eye, EyeOff } from "lucide-react-native";
import React, { useState } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";

const ROLE_LABELS: Record<MerchantRole, string> = {
  "merchant.cashier": "Cashier",
  "merchant.manager": "Manager",
  "merchant.admin": "Admin",
  "merchant.owner": "Owner",
};

const ROLE_COLORS: Record<MerchantRole, { bg: string; text: string }> = {
  "merchant.cashier": { bg: colors.info + "20", text: colors.info },
  "merchant.manager": { bg: colors.warning + "20", text: colors.warning },
  "merchant.admin": { bg: colors.teal + "20", text: colors.teal },
  "merchant.owner": { bg: colors.danger + "20", text: colors.danger },
};

export default function StaffPinsScreen() {
  const employees = useEmployeeStore((s) => s.employees);
  const [showAll, setShowAll] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);

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
    const roleStyle = ROLE_COLORS[emp.role] ?? ROLE_COLORS["merchant.cashier"];
    const visible = isPinVisible(emp);
    const initial = (emp.displayName || emp.fullName)[0]?.toUpperCase() ?? "?";

    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: s(12),
          paddingHorizontal: s(16),
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        {/* Avatar */}
        <View
          style={{
            width: s(40),
            height: s(40),
            borderRadius: s(20),
            backgroundColor: colors.teal + "25",
            alignItems: "center",
            justifyContent: "center",
            marginRight: s(12),
          }}
        >
          <Text style={{ fontSize: s(16), fontWeight: "700", color: colors.teal }}>
            {initial}
          </Text>
        </View>

        {/* Name + role */}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: s(14), fontWeight: "600", color: colors.label }}>
            {emp.fullName}
          </Text>
          {emp.displayName && emp.displayName !== emp.fullName && (
            <Text style={{ fontSize: s(12), color: colors.muted, marginTop: s(1) }}>
              {emp.displayName}
            </Text>
          )}
          <View
            style={{
              alignSelf: "flex-start",
              marginTop: s(4),
              paddingHorizontal: s(7),
              paddingVertical: s(2),
              borderRadius: s(4),
              backgroundColor: roleStyle.bg,
            }}
          >
            <Text style={{ fontSize: s(10), fontWeight: "600", color: roleStyle.text }}>
              {ROLE_LABELS[emp.role] ?? emp.role}
            </Text>
          </View>
        </View>

        {/* PIN + toggle */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: s(10) }}>
          <View
            style={{
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: s(8),
              paddingHorizontal: s(14),
              paddingVertical: s(8),
              minWidth: s(72),
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: s(16),
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
            hitSlop={{ top: s(8), bottom: s(8), left: s(8), right: s(8) }}
          >
            {visible ? (
              <EyeOff size={s(18)} color={colors.muted} />
            ) : (
              <Eye size={s(18)} color={colors.muted} />
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
          paddingHorizontal: s(20),
          paddingVertical: s(16),
          backgroundColor: colors.panel,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Text style={{ fontSize: s(18), fontWeight: "700", color: colors.heading }}>
          Staff PINs
        </Text>

        <TouchableOpacity
          onPress={toggleAll}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: s(6),
            paddingHorizontal: s(12),
            paddingVertical: s(7),
            borderRadius: s(8),
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
          }}
        >
          {showAll ? (
            <EyeOff size={s(15)} color={colors.label} />
          ) : (
            <Eye size={s(15)} color={colors.label} />
          )}
          <Text style={{ fontSize: s(13), fontWeight: "500", color: colors.label }}>
            {showAll ? "Hide All" : "Show All"}
          </Text>
        </TouchableOpacity>
      </View>

      {sorted.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: s(15), color: colors.muted }}>
            No employees loaded
          </Text>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(emp) => emp.id}
          renderItem={renderItem}
          style={{ backgroundColor: colors.panel }}
          contentContainerStyle={{ paddingBottom: s(24) }}
        />
      )}
    </View>
  );
}
