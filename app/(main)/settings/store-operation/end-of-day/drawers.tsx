import DateRangePicker, { DateRange } from "@/components/DateRangePicker";
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
import React, { useMemo, useState } from "react";
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
    Open: "bg-orange-900/30 text-orange-400 ",
    Closed: "bg-green-900/30 text-green-400 ",
    Cleared: "bg-blue-900/30 text-blue-400 ",
  };
  const statusClass =
    statusClasses[drawer.status] ||
    "bg-gray-700 text-gray-300 border border-gray-600";

  return (
    <View className="flex-row items-center p-3 border-b border-gray-700 bg-[#212121]">
      <View className="w-[11%]">
        <View className={`px-2 py-1 rounded-full self-start ${statusClass}`}>
          <Text className={`font-bold text-xs ${statusClass}`}>
            {drawer.status}
          </Text>
        </View>
      </View>
      <Text className="w-[11%] font-semibold text-white text-base">
        {drawer.cashier}
      </Text>
      <Text className="w-[12%] font-semibold text-gray-300 text-base">
        {drawer.drawerName}
      </Text>
      <Text className="w-[11%] font-semibold text-gray-300 text-base">
        ${drawer.startingCash.toFixed(2)}
      </Text>
      <Text className="w-[11%] font-semibold text-gray-300 text-base">
        ${drawer.expectedCash.toFixed(2)}
      </Text>
      <Text className="w-[11%] font-semibold text-gray-300 text-base">
        {drawer.actualCash !== null
          ? `$${drawer.actualCash.toFixed(2)}`
          : "(Not counted)"}
      </Text>
      <Text className="w-[11%] font-semibold text-gray-300 text-base">
        {drawer.difference !== null
          ? `$${drawer.difference.toFixed(2)}`
          : "(N/A)"}
      </Text>
      <View className="w-[12%]">
        <Text className="font-semibold text-white text-base">
          {drawer.dateIssued}
        </Text>
        <Text className="text-sm text-gray-400">{drawer.timeIssued}</Text>
      </View>
      <View className="w-[10%] items-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <TouchableOpacity className="p-1.5 rounded-md hover:bg-gray-700">
              <MoreHorizontal color="#9CA3AF" />
            </TouchableOpacity>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48 bg-[#303030] border-gray-600">
            <DropdownMenuItem onPress={() => alert("Closing Drawer...")}>
              <Text className="text-lg text-gray-300">Close Drawer</Text>
            </DropdownMenuItem>
            <DropdownMenuItem onPress={() => alert("Deleting Drawer...")}>
              <Text className="text-red-400 text-lg">Delete</Text>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </View>
    </View>
  );
};

const DrawerSummaryScreen = () => {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: new Date("2024-10-15"),
    to: new Date("2024-10-16"),
  });
  const [searchText, setSearchText] = useState("");

  const filteredSummaries = useMemo(() => {
    let summaries = [...MOCK_DRAWER_SUMMARIES];

    // --- LOGIC ADDED to filter by date range ---
    if (dateRange.from) {
      const startDate = new Date(dateRange.from);
      startDate.setUTCHours(0, 0, 0, 0);
      const endDate = dateRange.to
        ? new Date(dateRange.to)
        : new Date(dateRange.from);
      endDate.setUTCHours(23, 59, 59, 999);

      summaries = summaries.filter((summary) => {
        const dateString = summary.dateIssued;
        const months = {
          Jan: 0,
          Feb: 1,
          Mar: 2,
          Apr: 3,
          May: 4,
          Jun: 5,
          Jul: 6,
          Aug: 7,
          Sep: 8,
          Oct: 9,
          Nov: 10,
          Dec: 11,
        };

        const parts = dateString.replace(",", "").split(" ");
        const month = months[parts[0] as keyof typeof months];
        const day = parseInt(parts[1]);
        const year = parseInt(parts[2]);

        const summaryDate = new Date(year, month, day);
        return summaryDate >= startDate && summaryDate <= endDate;
      });
    }

    if (searchText.trim()) {
      const lowerQuery = searchText.toLowerCase();
      summaries = summaries.filter(
        (summary) =>
          summary.cashier.toLowerCase().includes(lowerQuery) ||
          summary.drawerName.toLowerCase().includes(lowerQuery)
      );
    }

    return summaries;
  }, [searchText, dateRange]);

  return (
    <View className="flex-1 bg-[#212121] p-4">
      {/* Toolbar */}
      <View className="flex-row justify-between items-center mb-4">
        <View className="flex-row items-center bg-[#303030] rounded-lg border border-gray-600 px-3 w-[300px]">
          <Search color="#9CA3AF" size={20} />
          <TextInput
            placeholder="Search..."
            placeholderTextColor="#9CA3AF"
            className="ml-2 text-lg text-white flex-1 h-12"
          />
        </View>
        <DateRangePicker range={dateRange} onRangeChange={setDateRange} />
      </View>

      {/* Table */}
      <View className="flex-1 rounded-xl overflow-hidden border border-gray-700">
        <View className="flex-row p-4 bg-[#303030] border-b border-gray-700">
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
              className={`font-bold text-base text-gray-400 ${
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
          data={filteredSummaries}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <DrawerRow drawer={item} />}
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
    </View>
  );
};

export default DrawerSummaryScreen;
