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
      <DialogContent className="p-0 rounded-[36px] overflow-hidden bg-[#11111A] w-[550px]">
        {/* Dark Header */}
        <View className="p-6 rounded-t-[36px]">
          <DialogTitle className="text-[#F1F1F1] text-3xl font-bold text-center">
            {title}
          </DialogTitle>
        </View>

        {/* White Content */}
        <View className="p-6 rounded-[36px] bg-background-100 items-center">
          {isDestructive && (
            <View className="w-20 h-20 bg-red-100 rounded-full items-center justify-center border-4 border-red-200 mb-4">
              <AlertTriangle color="#ef4444" size={48} />
            </View>
          )}
          <DialogHeader>
            <DialogTitle className="text-3xl font-bold text-accent-500 text-center">
              Are you sure?
            </DialogTitle>
            <DialogDescription className="text-center text-accent-500 mt-2 text-2xl">
              {description}
            </DialogDescription>
          </DialogHeader>
          {/* Footer with Buttons */}
          <DialogFooter className="pt-6 flex-row gap-4 border-t border-gray-200">
            <TouchableOpacity
              onPress={onClose}
              className="flex-1 py-4 border border-gray-300 rounded-lg"
            >
              <Text className="font-bold text-2xl text-gray-700 text-center">
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onConfirm}
              className={`flex-1 py-4 rounded-lg ${isDestructive ? "bg-red-500" : "bg-primary-400"}`}
            >
              <Text className="font-bold text-white text-2xl text-center">
                {confirmText}
              </Text>
            </TouchableOpacity>
          </DialogFooter>
        </View>
      </DialogContent>
    </Dialog>
  );
};

export default ConfirmationModal;
