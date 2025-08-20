import CheckDetailsModal from "@/components/settings/end-of-day/CheckDetailsModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MOCK_CHECKS } from "@/lib/mockData";
import { Check } from "@/lib/types";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  FileText,
  MoreHorizontal,
  Printer,
  Search,
  Trash2,
} from "lucide-react-native";
import React, { useState } from "react";
import {
  FlatList,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// Reusable Row Component
const CheckRow = ({
  check,
  onAction,
}: {
  check: Check;
  onAction: (action: "view" | "delete") => void;
}) => {
  const statusClasses: Record<string, string> = {
    Pending: "bg-orange-100 text-orange-800",
    Cleared: "bg-green-100 text-green-800",
    Voided: "bg-red-100 text-red-800",
  };
  return (
    <View className="flex-row items-center p-4 border-b border-gray-100">
      <Text className="w-[10%] font-semibold text-gray-600">
        {check.serialNo}
      </Text>
      <Text className="w-[15%] font-semibold text-gray-600">
        {check.checkNo}
      </Text>
      <Text className="w-[20%] font-semibold text-gray-800">{check.payee}</Text>
      <Text className="w-[15%] font-semibold text-gray-600">
        ${check.amount.toFixed(2)}
      </Text>
      <View className="w-[20%]">
        <Text className="font-semibold text-gray-800">{check.dateIssued}</Text>
        <Text className="text-sm text-gray-500">{check.timeIssued}</Text>
      </View>
      <View className="w-[15%]">
        <View
          className={`px-2 py-1 rounded-full self-start ${statusClasses[check.status]}`}
        >
          <Text className={`font-bold text-xs ${statusClasses[check.status]}`}>
            {check.status}
          </Text>
        </View>
      </View>
      <View className="w-[5%] items-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <TouchableOpacity className="p-2">
              <MoreHorizontal color="#6b7280" />
            </TouchableOpacity>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48">
            <DropdownMenuItem onPress={() => onAction("view")}>
              <FileText className="mr-2 h-4 w-4" />
              <Text>View Details</Text>
            </DropdownMenuItem>
            <DropdownMenuItem onPress={() => onAction("view")}>
              <Printer className="mr-2 h-4 w-4" />
              <Text>Print</Text>
            </DropdownMenuItem>
            <DropdownMenuItem onPress={() => onAction("delete")}>
              <Trash2 className="mr-2 h-4 w-4 text-red-500" />
              <Text className="text-red-500">Delete</Text>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </View>
    </View>
  );
};

const ChecksScreen = () => {
  const [isDetailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedCheck, setSelectedCheck] = useState<Check | null>(null);

  const handleRowAction = (check: Check, action: "view" | "delete") => {
    setSelectedCheck(check);
    if (action === "view") {
      setDetailModalOpen(true);
    } else if (action === "delete") {
      alert(`Deleting check #${check.checkNo}`);
    }
  };

  return (
    <View className="flex-1 bg-white p-6">
      {/* Toolbar */}
      <View className="flex-row justify-between items-center mb-4">
        <View className="flex-row items-center bg-gray-100 rounded-lg p-3 w-[300px]">
          <Search color="#6b7280" size={20} />
          <TextInput
            placeholder="Search by Check Number or Payee"
            className="ml-2 text-base flex-1"
          />
        </View>
        <TouchableOpacity className="flex-row items-center p-3 bg-gray-100 rounded-lg">
          <Text className="font-semibold text-gray-600 mr-2">
            Date: 02/03/25
          </Text>
          <Calendar color="#6b7280" size={20} />
        </TouchableOpacity>
      </View>

      {/* Table */}
      <View className="flex-1 border border-gray-200 rounded-xl">
        <View className="flex-row p-4 bg-gray-50 rounded-t-xl border-b border-gray-200">
          {[
            "# Serial No",
            "# Check No",
            "Payee",
            "Amount",
            "Date Issued",
            "Payment Status",
            "",
          ].map((h) => (
            <Text
              key={h}
              className={`font-bold text-sm text-gray-500 ${h === "Payee" ? "w-[20%]" : h === "Date Issued" ? "w-[20%]" : h === "Amount" || h === "Payment Status" ? "w-[15%]" : h === "# Serial No" ? "w-[10%]" : h === "# Check No" ? "w-[15%]" : "w-[5%]"}`}
            >
              {h}
            </Text>
          ))}
        </View>
        <FlatList
          data={MOCK_CHECKS}
          keyExtractor={(item) => item.serialNo}
          renderItem={({ item }) => (
            <CheckRow
              check={item}
              onAction={(action) => handleRowAction(item, action)}
            />
          )}
        />
      </View>

      {/* Footer */}
      <View className="flex-row justify-end items-center mt-4 gap-2">
        <TouchableOpacity className="p-2 border rounded-md">
          <ChevronLeft />
        </TouchableOpacity>
        <TouchableOpacity className="p-2 border rounded-md bg-primary-400">
          <ChevronRight color="white" />
        </TouchableOpacity>
      </View>

      <CheckDetailsModal
        isOpen={isDetailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        check={selectedCheck}
      />
    </View>
  );
};

export default ChecksScreen;
