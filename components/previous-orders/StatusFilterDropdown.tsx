import { PaymentStatus } from "@/lib/types";
import { Check, Filter } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

interface StatusFilterDropdownProps {
  selected: PaymentStatus[];
  onChange: (selected: PaymentStatus[]) => void;
}

const STATUS_OPTIONS: PaymentStatus[] = [
  "Paid",
  "In Progress",
  "Refunded",
  "Partially Refunded",
  "Unpaid",
];

export default function StatusFilterDropdown({
  selected,
  onChange,
}: StatusFilterDropdownProps) {
  const toggleStatus = (status: PaymentStatus) => {
    if (selected.includes(status)) {
      onChange(selected.filter((s) => s !== status));
    } else {
      onChange([...selected, status]);
    }
  };

  const clearAll = () => {
    onChange([]);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <TouchableOpacity className="flex-row items-center gap-2 px-4 py-2 bg-[#303030] rounded-lg">
          <Filter size={18} color="#9ca3af" />
          <Text className="text-white text-base">
            {`Status${selected.length > 0 ? ` (${selected.length})` : ""}`}
          </Text>
        </TouchableOpacity>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64 bg-[#1a1a1a] border border-[#404040]">
        {STATUS_OPTIONS.map((status) => (
          <DropdownMenuItem
            key={status}
            onPress={() => toggleStatus(status)}
            className="flex-row items-center justify-between py-3 px-4"
          >
            <Text className="text-white text-base">{status}</Text>
            {selected.includes(status) && (
              <Check size={18} color="#4ade80" />
            )}
          </DropdownMenuItem>
        ))}
        {selected.length > 0 && (
          <>
            <View className="h-px bg-[#404040] my-1" />
            <DropdownMenuItem
              onPress={clearAll}
              className="py-3 px-4"
            >
              <Text className="text-red-400 text-base">Clear All</Text>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
