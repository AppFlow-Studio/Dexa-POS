import DatePicker from "@/components/date-picker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MOCK_DRAWER_SUMMARIES } from "@/lib/mockData";
import { DrawerSummary } from "@/lib/types";
import {
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Search,
} from "lucide-react-native";
import React from "react";
import {
  FlatList,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// Reusable Row Component for the Drawer List
const DrawerRow = ({ drawer }: { drawer: DrawerSummary }) => {
  const statusClasses: Record<string, string> = {
    Open: "bg-orange-100 text-orange-800",
    Closed: "bg-green-100 text-green-800",
    Cleared: "bg-blue-100 text-blue-800",
  };
  return (
    <View className="flex-row items-center p-3 border-b border-background-400">
      <View className="w-[11%]">
        <View
          className={`px-1.5 py-0.5 rounded-full self-start ${
            statusClasses[drawer.status]
          }`}
        >
          <Text
            className={`font-bold text-[10px] ${statusClasses[drawer.status]}`}
          >
            {drawer.status}
          </Text>
        </View>
      </View>
      <Text className="w-[11%] font-semibold text-gray-800 text-sm">
        {drawer.cashier}
      </Text>
      <Text className="w-[12%] font-semibold text-gray-600 text-sm">
        {drawer.drawerName}
      </Text>
      <Text className="w-[11%] font-semibold text-gray-600 text-sm">
        ${drawer.startingCash.toFixed(2)}
      </Text>
      <Text className="w-[11%] font-semibold text-gray-600 text-sm">
        ${drawer.expectedCash.toFixed(2)}
      </Text>
      <Text className="w-[11%] font-semibold text-gray-600 text-sm">
        {drawer.actualCash !== null
          ? `$${drawer.actualCash.toFixed(2)}`
          : "(Not counted)"}
      </Text>
      <Text className="w-[11%] font-semibold text-gray-600 text-sm">
        {drawer.difference !== null
          ? `$${drawer.difference.toFixed(2)}`
          : "(N/A)"}
      </Text>
      <View className="w-[12%]">
        <Text className="font-semibold text-gray-800 text-sm">
          {drawer.dateIssued}
        </Text>
        <Text className="text-xs text-gray-500">{drawer.timeIssued}</Text>
      </View>
      <View className="w-[10%] items-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <TouchableOpacity className="p-1.5">
              <MoreHorizontal color="#6b7280" />
            </TouchableOpacity>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48">
            <DropdownMenuItem onPress={() => alert("Closing Drawer...")}>
              <Text className="text-sm">Close Drawer</Text>
            </DropdownMenuItem>
            <DropdownMenuItem onPress={() => alert("Deleting Drawer...")}>
              <Text className="text-red-500 text-sm">Delete</Text>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </View>
    </View>
  );
};

const DrawerSummaryScreen = () => {
  const [selectedDate, setSelectedDate] = React.useState(new Date());

  return (
    <View className="flex-1 bg-background-100 p-4">
      {/* Toolbar */}
      <View className="flex-row justify-between items-center mb-3">
        <View className="flex-row items-center bg-background-300 rounded-lg border border-background-400 p-2 w-[300px]">
          <Search color="#6b7280" size={18} />
          <TextInput
            placeholder="Search..."
            className="ml-1.5 text-sm flex-1 h-16"
          />
        </View>
        <DatePicker date={selectedDate} onDateChange={setSelectedDate} />
      </View>

      {/* Table */}
      <View className="flex-1 rounded-xl">
        <View className="flex-row p-3 rounded-t-xl border-b border-background-400">
          {[
            "Status",
            "Cashier",
            "Drawer Name/ID",
            "Starting",
            "Expected",
            "Actual",
            "Difference",
            "Date Issued",
            "",
          ].map((h) => (
            <Text
              key={h}
              className={`font-bold text-xs text-gray-500 ${
                h.includes("Name")
                  ? "w-[12%]"
                  : h === "Date Issued"
                  ? "w-[12%]"
                  : h === ""
                  ? "w-[10%]"
                  : "w-[11%]"
              }`}
            >
              {h}
            </Text>
          ))}
        </View>
        <FlatList
          data={MOCK_DRAWER_SUMMARIES}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <DrawerRow drawer={item} />}
        />
      </View>

      {/* Footer */}
      <View className="flex-row justify-end items-center mt-3 gap-2">
        <TouchableOpacity className="p-2 rounded-full">
          <ChevronLeft size={20} />
        </TouchableOpacity>
        <TouchableOpacity className="p-2 rounded-full bg-primary-400">
          <ChevronRight color="white" size={20} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default DrawerSummaryScreen;
