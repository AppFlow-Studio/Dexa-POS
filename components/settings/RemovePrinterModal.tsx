import { AlertTriangle } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

interface RemovePrinterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRemove: () => void;
}

const RemovePrinterModal: React.FC<RemovePrinterModalProps> = ({
  isOpen,
  onClose,
  onRemove,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="p-0 rounded-[36px] overflow-hidden bg-[#11111A] max-w-xl w-full">
        {/* Dark Header */}
        <View className="p-4 pb-0 rounded-t-[36px]">
          <DialogTitle className="text-[#F1F1F1] text-2xl font-bold text-center">
            Remove Printer
          </DialogTitle>
        </View>

        {/* White Content */}
        <View className="p-6 rounded-[36px] bg-background-100 items-center">
          <View className="w-16 h-16 bg-red-100 rounded-full items-center justify-center border-4 border-red-200 mb-4">
            <AlertTriangle color="#ef4444" size={32} />
          </View>
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-accent-500 text-center">
              Are you sure?
            </DialogTitle>
            <DialogDescription className="text-center text-accent-500 mt-2">
              This will remove the connection and delete the data. You will need
              to add again.
            </DialogDescription>
          </DialogHeader>
          {/* Footer with Buttons */}
          <DialogFooter className="pt-6 flex-row gap-3 border-t border-gray-200">
            <TouchableOpacity
              onPress={onClose}
              className="flex-1 py-3 border border-gray-300 rounded-lg"
            >
              <Text className="font-bold text-gray-700 text-center">
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onRemove}
              className="flex-1 py-3 bg-red-500 rounded-lg"
            >
              <Text className="font-bold text-white text-center">Remove</Text>
            </TouchableOpacity>
          </DialogFooter>
        </View>
      </DialogContent>
    </Dialog>
  );
};

export default RemovePrinterModal;
