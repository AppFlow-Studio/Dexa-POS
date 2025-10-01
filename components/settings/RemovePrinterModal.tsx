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
      <DialogContent className="p-0 rounded-3xl overflow-hidden bg-[#11111A] max-w-lg w-full">
        {/* Dark Header */}
        <View className="p-3 pb-0 rounded-t-3xl">
          <DialogTitle className="text-[#F1F1F1] text-xl font-bold text-center">
            Remove Printer
          </DialogTitle>
        </View>

        {/* White Content */}
        <View className="p-4 rounded-3xl bg-background-100 items-center">
          <View className="w-14 h-14 bg-red-100 rounded-full items-center justify-center border-4 border-red-200 mb-3">
            <AlertTriangle color="#ef4444" size={28} />
          </View>
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-accent-500 text-center">
              Are you sure?
            </DialogTitle>
            <DialogDescription className="text-center text-accent-500 mt-1.5 text-sm">
              This will remove the connection and delete the data. You will need
              to add it again.
            </DialogDescription>
          </DialogHeader>
          {/* Footer with Buttons */}
          <DialogFooter className="pt-4 flex-row gap-2 border-t border-gray-200 w-full">
            <TouchableOpacity
              onPress={onClose}
              className="flex-1 py-2 border border-gray-300 rounded-lg"
            >
              <Text className="font-bold text-gray-700 text-center text-base">
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onRemove}
              className="flex-1 py-2 bg-red-500 rounded-lg"
            >
              <Text className="font-bold text-white text-center text-base">
                Remove
              </Text>
            </TouchableOpacity>
          </DialogFooter>
        </View>
      </DialogContent>
    </Dialog>
  );
};

export default RemovePrinterModal;
