import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmployeeShift } from "@/lib/types";
import React from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";

const DetailRow = ({ label, value }: { label: string; value: string }) => (
  <View className="flex-1">
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
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[400px] bg-white p-6 rounded-2xl items-center">
        <Image
          source={require("@/assets/images/tom_hardy.jpg")}
          className="w-20 h-20 rounded-full mb-4"
        />
        <Text className="text-2xl font-bold">{employee.name}</Text>
        <Text className="text-gray-500">ID: {employee.profile.id}</Text>

        <View className="w-full my-6 gap-y-4">
          <View className="flex-row gap-4">
            <DetailRow label="Date of birth" value={employee.profile.dob} />
            <DetailRow label="Role" value={employee.profile.role} />
          </View>
          <View className="flex-row gap-4">
            <DetailRow label="Gender" value={employee.profile.gender} />
            <DetailRow label="Country" value={employee.profile.country} />
          </View>
          <View className="flex-row gap-4">
            <DetailRow label="Address" value={employee.profile.address} />
          </View>
        </View>

        <TouchableOpacity className="w-full py-3 bg-red-500 rounded-lg items-center">
          <Text className="font-bold text-white">Clock out</Text>
        </TouchableOpacity>
      </DialogContent>
    </Dialog>
  );
};

export default ViewProfileModal;
