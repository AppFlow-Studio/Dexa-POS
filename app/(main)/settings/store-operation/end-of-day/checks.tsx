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
    Pending: "bg-orange-900/30 text-orange-400 border",
    Cleared: "bg-green-900/30 text-green-400 border",
    Voided: "bg-red-900/30 text-red-400 border",
  };
  const statusClass =
    statusClasses[check.status] ||
    "bg-gray-700 text-gray-300 border border-gray-600";

  return (
    <View className="flex-row items-center p-4 border-b border-gray-700 bg-[#212121]">
      <Text className="w-[10%] text-lg font-semibold text-gray-300">
        {check.serialNo}
      </Text>
      <Text className="w-[15%] text-lg font-semibold text-gray-300">
        {check.checkNo}
      </Text>
      <Text className="w-[20%] text-lg font-semibold text-white">
        {check.payee}
      </Text>
      <Text className="w-[15%] text-lg font-semibold text-gray-300">
        ${check.amount.toFixed(2)}
      </Text>
      <View className="w-[20%]">
        <Text className="text-lg font-semibold text-white">
          {check.dateIssued}
        </Text>
        <Text className="text-base text-gray-400">{check.timeIssued}</Text>
      </View>
      <View className="w-[15%]">
        <View className={`px-2 py-1 rounded-full self-start ${statusClass}`}>
          <Text className={`font-bold text-sm ${statusClass}`}>
            {check.status}
          </Text>
        </View>
      </View>
      <View className="w-[5%] items-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <TouchableOpacity className="p-2 rounded-md hover:bg-gray-700">
              <MoreHorizontal size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48 bg-[#303030] border-gray-600">
            <DropdownMenuItem onPress={() => onAction("view")}>
              <FileText className="mr-2 h-5 w-5 text-gray-300" />
              <Text className="text-lg text-gray-300">View Details</Text>
            </DropdownMenuItem>
            <DropdownMenuItem onPress={() => alert("Printing...")}>
              <Printer className="mr-2 h-5 w-5 text-gray-300" />
              <Text className="text-lg text-gray-300">Print</Text>
            </DropdownMenuItem>
            <DropdownMenuItem onPress={() => onAction("delete")}>
              <Trash2 className="mr-2 h-5 w-5 text-red-400" />
              <Text className="text-lg text-red-400">Delete</Text>
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
    <View className="flex-1 bg-[#212121] p-4">
      {/* Toolbar */}
      <View className="flex-row justify-between items-center mb-4">
        <View className="flex-row items-center bg-[#303030] rounded-lg border border-gray-600 px-3 w-[400px]">
          <Search color="#9CA3AF" size={20} />
          <TextInput
            placeholder="Search by Check Number or Payee"
            placeholderTextColor="#9CA3AF"
            className="ml-2 text-lg text-white flex-1 h-12"
          />
        </View>
        <DatePicker date={selectedDate} onDateChange={setSelectedDate} />
      </View>

      {/* Table */}
      <View className="flex-1 rounded-xl overflow-hidden border border-gray-700">
        <View className="flex-row p-4 bg-[#303030] border-b border-gray-700">
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
              className={`font-bold text-base text-gray-400 ${
                h === "Payee"
                  ? "w-[20%]"
                  : h === "Date Issued"
                  ? "w-[20%]"
                  : h === "Amount" || h === "Payment Status"
                  ? "w-[15%]"
                  : h === "# Serial No"
                  ? "w-[10%]"
                  : h === "# Check No"
                  ? "w-[15%]"
                  : "w-[5%]"
              }`}
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
        <TouchableOpacity className="p-2 border border-gray-600 rounded-full">
          <ChevronLeft color="#9CA3AF" size={20} />
        </TouchableOpacity>
        <TouchableOpacity className="p-2 rounded-full bg-blue-600">
          <ChevronRight color="white" size={20} />
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
