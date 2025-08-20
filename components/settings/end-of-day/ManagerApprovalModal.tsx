import PinDisplay from "@/components/auth/PinDisplay";
import PinNumpad from "@/components/auth/PinNumpad";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

const ManagerApprovalModal = ({
  isOpen,
  onClose,
  onApprove,
}: {
  isOpen: boolean;
  onClose: () => void;
  onApprove: () => void;
}) => {
  const [pin, setPin] = useState("");

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="min-w-[550px] bg-white p-0 rounded-2xl overflow-hidden">
        <View className="p-6 w-full">
          <DialogTitle className="">
            <Text className="text-accent-500  font-bold text-center text-2xl">
              Manager Approval Required
            </Text>
          </DialogTitle>
        </View>
        <View className="bg-white p-6 w-full">
          <Text className="font-semibold text-gray-600 mb-2">
            Enter your pin (Manager Only)
          </Text>
          <PinDisplay pinLength={pin.length} />
          <PinNumpad onKeyPress={() => {}} />
          <TouchableOpacity className="self-end my-4">
            <Text className="font-semibold text-primary-400">Forgot Pin</Text>
          </TouchableOpacity>
          <View className="flex-row space-x-2 border-t border-gray-200 pt-4">
            <TouchableOpacity
              onPress={onClose}
              className="flex-1 py-3 border border-gray-300 rounded-lg items-center"
            >
              <Text className="font-bold text-gray-700">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onApprove}
              className="flex-1 py-3 bg-primary-400 rounded-lg items-center"
            >
              <Text className="font-bold text-white">Approve</Text>
            </TouchableOpacity>
          </View>
        </View>
      </DialogContent>
    </Dialog>
  );
};

export default ManagerApprovalModal;
