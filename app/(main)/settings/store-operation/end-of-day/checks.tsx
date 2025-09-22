import DatePicker from "@/components/date-picker";
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
    <View className="flex-row items-center p-6 border-b border-background-400">
      <Text className="w-[10%] text-2xl font-semibold text-gray-600">
        {check.serialNo}
      </Text>
      <Text className="w-[15%] text-2xl font-semibold text-gray-600">
        {check.checkNo}
      </Text>
      <Text className="w-[20%] text-2xl font-semibold text-gray-800">
        {check.payee}
      </Text>
      <Text className="w-[15%] text-2xl font-semibold text-gray-600">
        ${check.amount.toFixed(2)}
      </Text>
      <View className="w-[20%]">
        <Text className="text-2xl font-semibold text-gray-800">
          {check.dateIssued}
        </Text>
        <Text className="text-xl text-gray-500">{check.timeIssued}</Text>
      </View>
      <View className="w-[15%]">
        <View
          className={`px-3 py-2 rounded-full self-start ${statusClasses[check.status]}`}
        >
          <Text className={`font-bold text-xl ${statusClasses[check.status]}`}>
            {check.status}
          </Text>
        </View>
      </View>
      <View className="w-[5%] items-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <TouchableOpacity className="p-2">
              <MoreHorizontal size={24} color="#6b7280" />
            </TouchableOpacity>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48">
            <DropdownMenuItem onPress={() => onAction("view")}>
              <FileText className="mr-2 h-6 w-6" />
              <Text className="text-2xl">View Details</Text>
            </DropdownMenuItem>
            <DropdownMenuItem onPress={() => onAction("view")}>
              <Printer className="mr-2 h-6 w-6" />
              <Text className="text-2xl">Print</Text>
            </DropdownMenuItem>
            <DropdownMenuItem onPress={() => onAction("delete")}>
              <Trash2 className="mr-2 h-6 w-6 text-red-500" />
              <Text className="text-2xl text-red-500">Delete</Text>
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
  const [selectedDate, setSelectedDate] = useState(new Date());

  const handleRowAction = (check: Check, action: "view" | "delete") => {
    setSelectedCheck(check);
    if (action === "view") {
      setDetailModalOpen(true);
    } else if (action === "delete") {
      alert(`Deleting check #${check.checkNo}`);
    }
  };

  return (
    <View className="flex-1 bg-background-100 p-6">
      {/* Toolbar */}
      <View className="flex-row justify-between items-center mb-4">
        <View className="flex-row items-center bg-background-300 rounded-lg border border-background-400 p-4 w-[400px]">
          <Search color="#6b7280" size={24} />
          <TextInput
            placeholder="Search by Check Number or Payee"
            className="ml-3 text-2xl flex-1 h-20"
          />
        </View>
        <DatePicker date={selectedDate} onDateChange={setSelectedDate} />
      </View>

      {/* Table */}
      <View className="flex-1">
        <View className="flex-row p-6 rounded-t-xl border-b border-background-400">
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
              className={`font-bold text-xl text-gray-500 ${h === "Payee" ? "w-[20%]" : h === "Date Issued" ? "w-[20%]" : h === "Amount" || h === "Payment Status" ? "w-[15%]" : h === "# Serial No" ? "w-[10%]" : h === "# Check No" ? "w-[15%]" : "w-[5%]"}`}
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
        <TouchableOpacity className="p-3 rounded-full">
          <ChevronLeft size={24} />
        </TouchableOpacity>
        <TouchableOpacity className="p-3 rounded-full bg-primary-400">
          <ChevronRight color="white" size={24} />
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
