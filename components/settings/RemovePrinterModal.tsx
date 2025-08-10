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
      <DialogContent className="max-w-lg p-0 rounded-2xl bg-white overflow-hidden">
        <View className="bg-gray-800 p-6">
          <DialogTitle className="text-white text-2xl font-bold text-center">
            Remove Printer
          </DialogTitle>
        </View>
        <View className="bg-white p-6 items-center text-center">
          <View className="w-16 h-16 bg-red-100 rounded-full items-center justify-center border-4 border-red-200">
            <AlertTriangle color="#ef4444" size={32} />
          </View>
          <DialogHeader className="mt-4">
            <DialogTitle className="text-xl font-bold text-center">
              Are you sure?
            </DialogTitle>
            <DialogDescription className="text-center text-gray-500 mt-2">
              This will remove the connection and delete the data. You will need
              to add again.
            </DialogDescription>
          </DialogHeader>
        </View>
        <DialogFooter className="p-6 flex-row space-x-2 border-t border-gray-200">
          <TouchableOpacity
            onPress={onClose}
            className="flex-1 py-3 border border-gray-300 rounded-lg items-center"
          >
            <Text className="font-bold text-gray-700">Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onRemove}
            className="flex-1 py-3 bg-red-500 rounded-lg items-center"
          >
            <Text className="font-bold text-white">Remove</Text>
          </TouchableOpacity>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RemovePrinterModal;
