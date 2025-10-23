import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Filter } from "lucide-react-native";
import React from "react";
import { Text, View } from "react-native";

// Assuming Role is a string literal type as in the reference
export type Role = "Cashier" | "Barista" | "Line Cook" | "Prep" | "Supervisor";

const roles: Role[] = ["Cashier", "Barista", "Line Cook", "Prep", "Supervisor"];

const conflicts = [
  { id: "ot", label: "Overtime Risk", color: "bg-red-500" },
  { id: "gap", label: "Coverage Gaps", color: "bg-red-500" },
  { id: "pto", label: "PTO Conflicts", color: "bg-purple-500" },
  { id: "clopening", label: "Clopening", color: "bg-yellow-500" },
];

interface FiltersPanelProps {
  selectedRoles: Role[];
  selectedConflicts: string[];
  onRoleToggle: (role: Role) => void;
  onConflictToggle: (conflictId: string) => void;
}

const FiltersPanel: React.FC<FiltersPanelProps> = ({
  selectedRoles,
  selectedConflicts,
  onRoleToggle,
  onConflictToggle,
}) => {
  return (
    <View className="gap-y-4">
      <View className="flex-row items-center gap-2 mb-4">
        <Filter className="text-blue-400" size={16} color={"#60a5fa"} />
        <Text className="text-sm font-semibold text-white">Filters</Text>
      </View>

      <View>
        <Text className="text-xs text-gray-400 mb-3">Roles</Text>
        <View className="gap-y-2">
          {roles.map((role) => (
            <View key={role} className="flex-row items-center gap-2">
              <Checkbox
                id={`role-${role}`}
                checked={selectedRoles.includes(role)}
                onCheckedChange={() => onRoleToggle(role)}
                className="text-white"
              />
              <Label htmlFor={`role-${role}`} className="text-sm text-white">
                {role}
              </Label>
            </View>
          ))}
        </View>
      </View>

      <View>
        <Text className="text-xs text-gray-400 mb-3">Conflicts</Text>
        <View className="gap-y-2">
          {conflicts.map((conflict) => (
            <View key={conflict.id} className="flex-row items-center gap-2">
              <Checkbox
                id={`conflict-${conflict.id}`}
                checked={selectedConflicts.includes(conflict.id)}
                onCheckedChange={() => onConflictToggle(conflict.id)}
              />
              <View className="text-sm text-white flex-row items-center gap-2">
                <View className={`w-2 h-2 rounded-full ${conflict.color}`} />
                <Text className="text-white">{conflict.label}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
};

export default FiltersPanel;
