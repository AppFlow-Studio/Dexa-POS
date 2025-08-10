import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText: string;
  variant?: "default" | "destructive";
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText,
  variant = "default",
}) => {
  const isDestructive = variant === "destructive";

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg p-0 rounded-2xl overflow-hidden bg-white">
        <View className="bg-gray-800 p-6">
          <DialogTitle className="text-white text-2xl font-bold text-center">
            {title}
          </DialogTitle>
        </View>
        <View className="bg-white p-6 items-center text-center">
          {isDestructive && (
            <View className="w-16 h-16 bg-red-100 rounded-full items-center justify-center border-4 border-red-200 mb-4">
              <AlertTriangle color="#ef4444" size={32} />
            </View>
          )}
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-center">
              Are you sure?
            </DialogTitle>
            <DialogDescription className="text-center text-gray-500 mt-2">
              {description}
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
            onPress={onConfirm}
            className={`flex-1 py-3 rounded-lg items-center ${isDestructive ? "bg-red-500" : "bg-primary-400"}`}
          >
            <Text className="font-bold text-white">{confirmText}</Text>
          </TouchableOpacity>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConfirmationModal;
