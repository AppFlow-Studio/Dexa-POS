import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmployeeShift } from "@/lib/types";
import React from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";

const DetailRow = ({ label, value }: { label: string; value: string }) => (
  <View>
    <Text className="text-sm text-gray-500 mb-1">{label}</Text>
    <Text className="font-semibold">{value}</Text>
  </View>
);

const ViewProfileModal = ({
  isOpen,
  onClose,
  employee,
}: {
  isOpen: boolean;
  onClose: () => void;
  employee: EmployeeShift | null;
}) => {
  if (!employee) return null;

  return (
    <Dialog open={isOpen} onOpen-Change={onClose}>
      <DialogContent className="w-[360px] bg-white p-4 rounded-2xl items-center">
        <Image
          source={require("@/assets/images/tom_hardy.jpg")}
          className="w-28 h-28 rounded-2xl mb-3"
        />
        <Text className="text-xl font-bold">{employee.name}</Text>
        <Text className="text-gray-500 text-sm">ID: {employee.profile.id}</Text>

        <View className="w-full my-4 gap-y-3 border border-background-400 p-3 rounded-xl">
          <View className="flex-row justify-between">
            <DetailRow label="Date of birth" value={employee.profile.dob} />
            <DetailRow label="Role" value={employee.profile.role} />
          </View>
          <View className="flex-row justify-between">
            <DetailRow label="Gender" value={employee.profile.gender} />
            <DetailRow label="Country" value={employee.profile.country} />
          </View>
          <View className="flex-row justify-between">
            <DetailRow label="Address" value={employee.profile.address} />
          </View>
          <TouchableOpacity className="w-full py-2 bg-red-500 rounded-lg items-center">
            <Text className="font-bold text-white text-base">Clock out</Text>
          </TouchableOpacity>
        </View>
      </DialogContent>
    </Dialog>
  );
};

export default ViewProfileModal;
