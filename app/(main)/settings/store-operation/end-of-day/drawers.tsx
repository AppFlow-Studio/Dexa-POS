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
    <View className="flex-row items-center p-4 border-b border-background-400">
      <View className="w-[11%]">
        <View
          className={`px-2 py-1 rounded-full self-start ${statusClasses[drawer.status]}`}
        >
          <Text className={`font-bold text-xs ${statusClasses[drawer.status]}`}>
            {drawer.status}
          </Text>
        </View>
      </View>
      <Text className="w-[11%] font-semibold text-gray-800">
        {drawer.cashier}
      </Text>
      <Text className="w-[12%] font-semibold text-gray-600">
        {drawer.drawerName}
      </Text>
      <Text className="w-[11%] font-semibold text-gray-600">
        ${drawer.startingCash.toFixed(2)}
      </Text>
      <Text className="w-[11%] font-semibold text-gray-600">
        ${drawer.expectedCash.toFixed(2)}
      </Text>
      <Text className="w-[11%] font-semibold text-gray-600">
        {drawer.actualCash !== null
          ? `$${drawer.actualCash.toFixed(2)}`
          : "(Not yet counted)"}
      </Text>
      <Text className="w-[11%] font-semibold text-gray-600">
        {drawer.difference !== null
          ? `$${drawer.difference.toFixed(2)}`
          : "(N/A)"}
      </Text>
      <View className="w-[12%]">
        <Text className="font-semibold text-gray-800">{drawer.dateIssued}</Text>
        <Text className="text-sm text-gray-500">{drawer.timeIssued}</Text>
      </View>
      <View className="w-[10%] items-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <TouchableOpacity className="p-2">
              <MoreHorizontal color="#6b7280" />
            </TouchableOpacity>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48">
            <DropdownMenuItem onPress={() => alert("Closing Drawer...")}>
              <Text>Close Drawer</Text>
            </DropdownMenuItem>
            <DropdownMenuItem onPress={() => alert("Deleting Drawer...")}>
              <Text className="text-red-500">Delete</Text>
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
    <View className="flex-1 bg-background-100 p-6">
      {/* Toolbar */}
      <View className="flex-row justify-between items-center mb-4">
        <View className="flex-row items-center bg-background-300 rounded-lg border border-background-400 p-3 py-0 w-[300px]">
          <Search color="#6b7280" size={20} />
          <TextInput
            placeholder="Search by Check Number or Payee"
            className="ml-2 text-base flex-1 h-20"
          />
        </View>
        <DatePicker date={selectedDate} onDateChange={setSelectedDate} />
      </View>

      {/* Table */}
      <View className="flex-1 rounded-xl">
        <View className="flex-row p-4 rounded-t-xl border-b border-background-400">
          {[
            "Drawer Status",
            "Cashier",
            "Drawer Name/ID",
            "Starting Cash",
            "Expected Cash",
            "Actual Cash",
            "Difference",
            "Date Issued",
            "",
          ].map((h) => (
            <Text
              key={h}
              className={`font-bold text-sm text-gray-500 ${h.includes("Name") ? "w-[12%]" : h === "Date Issued" ? "w-[12%]" : h === "" ? "w-[10%]" : "w-[11%]"}`}
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
      <View className="flex-row justify-end items-center mt-4 gap-2">
        <TouchableOpacity className="p-2 rounded-full">
          <ChevronLeft />
        </TouchableOpacity>
        <TouchableOpacity className="p-2 rounded-full bg-primary-400">
          <ChevronRight color="white" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default DrawerSummaryScreen;
