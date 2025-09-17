import DatePicker from "@/components/date-picker";
import ManagerApprovalModal from "@/components/settings/end-of-day/ManagerApprovalModal";
import ViewProfileModal from "@/components/settings/end-of-day/ViewProfileModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MOCK_EMPLOYEE_SHIFTS } from "@/lib/mockData";
import { EmployeeShift } from "@/lib/types";
import {
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Power,
  Search,
  Trash2,
  User,
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
const EmployeeRow = ({
  employee,
  onAction,
}: {
  employee: EmployeeShift;
  onAction: (action: "view" | "clockout" | "delete") => void;
}) => {
  const statusClass = (status: string) =>
    status === "Clocked In"
      ? "bg-green-100 text-green-800"
      : "bg-red-100 text-red-800";
  return (
    <View className="flex-row items-center p-6 border-b border-background-400">
      <Text className="w-[15%] text-2xl font-semibold text-gray-800">
        {employee.name}
      </Text>
      <Text className="w-[12%] text-2xl text-gray-600">
        {employee.jobTitle}
      </Text>
      <View className="w-[12%]">
        <View
          className={`px-3 py-2 rounded-full self-start ${statusClass(employee.clockInStatus)}`}
        >
          <Text
            className={`font-bold text-xl ${statusClass(employee.clockInStatus)}`}
          >
            {employee.clockInStatus}
          </Text>
        </View>
      </View>
      <View className="w-[12%]">
        {employee.clockOutStatus !== "N/A" && (
          <View
            className={`px-3 py-2 rounded-full self-start ${statusClass(employee.clockOutStatus)}`}
          >
            <Text
              className={`font-bold text-xl ${statusClass(employee.clockOutStatus)}`}
            >
              {employee.clockOutStatus}
            </Text>
          </View>
        )}
      </View>
      <Text className="w-[12%] text-2xl text-gray-600">
        {employee.clockInTime}
      </Text>
      <Text className="w-[12%] text-2xl text-gray-600">
        {employee.clockOutTime}
      </Text>
      <Text className="w-[15%] text-2xl text-gray-600">
        {employee.totalHours}
      </Text>
      <View className="w-[10%] items-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <TouchableOpacity className="p-2">
              <MoreHorizontal size={24} color="#6b7280" />
            </TouchableOpacity>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48">
            <DropdownMenuItem onPress={() => onAction("view")}>
              <User className="mr-2 h-6 w-6" />
              <Text className="text-2xl">View Profile</Text>
            </DropdownMenuItem>
            <DropdownMenuItem onPress={() => onAction("clockout")}>
              <Power className="mr-2 h-6 w-6" />
              <Text className="text-2xl">Clockout</Text>
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

const ViewEmployeesScreen = () => {
  const [activeModal, setActiveModal] = useState<
    "viewProfile" | "managerApproval" | null
  >(null);
  const [selectedEmployee, setSelectedEmployee] =
    useState<EmployeeShift | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());

  const handleRowAction = (
    employee: EmployeeShift,
    action: "view" | "clockout" | "delete"
  ) => {
    setSelectedEmployee(employee);
    if (action === "view") {
      setActiveModal("viewProfile");
    } else {
      // Clockout and Delete require manager approval
      setActiveModal("managerApproval");
    }
  };

  const handleApproveAction = () => {
    // Logic for the approved action (e.g., clockout or delete) would go here
    console.log("Action approved for", selectedEmployee?.name);
    setActiveModal(null);
  };

  return (
    <View className="flex-1 bg-white p-6">
      <View className="flex-row justify-between items-center mb-4">
        <View className="flex-row items-center bg-background-300 rounded-lg border border-background-400 p-4 w-[400px]">
          <Search color="#6b7280" size={24} />
          <TextInput
            placeholder="Search by Check Number or Payee"
            className="ml-3 text-2xl flex-1"
          />
        </View>
        <DatePicker date={selectedDate} onDateChange={setSelectedDate} />
      </View>

      <View className="flex-1">
        <View className="flex-row p-6 bg-gray-50 rounded-t-xl border-b border-background-400">
          {[
            "Employees Name",
            "Job Title",
            "Clock In Status",
            "Clock Out Status",
            "Clock in Time",
            "Clocked Out Time",
            "Total Hours",
            "",
          ].map((h) => (
            <Text
              key={h}
              className={`font-bold text-xl text-gray-500 ${h.includes("Name") ? "w-[15%]" : h.includes("Total") ? "w-[15%]" : h === "" ? "w-[10%]" : "w-[12%]"}`}
            >
              {h}
            </Text>
          ))}
        </View>
        <FlatList
          data={MOCK_EMPLOYEE_SHIFTS}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <EmployeeRow
              employee={item}
              onAction={(action) => handleRowAction(item, action)}
            />
          )}
        />
      </View>

      <View className="flex-row justify-end items-center mt-4 gap-2">
        <TouchableOpacity className="p-3 rounded-full">
          <ChevronLeft size={24} />
        </TouchableOpacity>
        <TouchableOpacity className="p-3 rounded-full bg-primary-400">
          <ChevronRight color="white" size={24} />
        </TouchableOpacity>
      </View>

      <ViewProfileModal
        isOpen={activeModal === "viewProfile"}
        onClose={() => setActiveModal(null)}
        employee={selectedEmployee}
      />
      <ManagerApprovalModal
        isOpen={activeModal === "managerApproval"}
        onClose={() => setActiveModal(null)}
        onApprove={handleApproveAction}
      />
    </View>
  );
};

export default ViewEmployeesScreen;
