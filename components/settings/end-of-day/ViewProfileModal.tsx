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
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[390px] bg-white p-6 rounded-2xl items-center">
        <Image
          source={require("@/assets/images/tom_hardy.jpg")}
          className="w-32 h-32 rounded-2xl mb-4"
        />
        <Text className="text-2xl font-bold">{employee.name}</Text>
        <Text className="text-gray-500">ID: {employee.profile.id}</Text>

        <View className="w-full my-6 gap-y-4 border border-background-400 p-4 rounded-xl">
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
          <TouchableOpacity className="w-full py-3 bg-red-500 rounded-lg items-center">
            <Text className="font-bold text-white">Clock out</Text>
          </TouchableOpacity>
        </View>
      </DialogContent>
    </Dialog>
  );
};

export default ViewProfileModal;
