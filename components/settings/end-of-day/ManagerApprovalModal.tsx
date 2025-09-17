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
      <DialogContent className="min-w-[550px] p-0 rounded-2xl overflow-hidden bg-white">
        <View className="p-6 w-full">
          <DialogTitle className="">
            <Text className="text-accent-500  font-bold text-center text-3xl">
              Manager Approval Required
            </Text>
          </DialogTitle>
        </View>
        <View className="bg-white p-6 w-full">
          <Text className="text-2xl font-semibold text-gray-600 mb-2">
            Enter your pin (Manager Only)
          </Text>
          <PinDisplay pinLength={pin.length} maxLength={4} />
          <PinNumpad onKeyPress={() => {}} />
          <TouchableOpacity className="self-end my-4">
            <Text className="font-semibold text-primary-400 text-xl">
              Forgot Pin
            </Text>
          </TouchableOpacity>
          <View className="flex-row space-x-3 border-t border-gray-200 pt-6">
            <TouchableOpacity
              onPress={onClose}
              className="flex-1 py-4 border border-gray-300 rounded-lg items-center"
            >
              <Text className="font-bold text-gray-700 text-2xl">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onApprove}
              className="flex-1 py-4 bg-primary-400 rounded-lg items-center"
            >
              <Text className="font-bold text-white text-2xl">Approve</Text>
            </TouchableOpacity>
          </View>
        </View>
      </DialogContent>
    </Dialog>
  );
};

export default ManagerApprovalModal;
