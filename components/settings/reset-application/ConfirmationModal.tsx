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
      {/* Use a single dark background for the entire modal */}
      <DialogContent className="p-6 rounded-2xl bg-[#303030] border border-gray-700 w-[480px]">
        <View className="items-center">
          {/* Use dark-theme friendly colors for the icon */}
          {isDestructive && (
            <View className="w-16 h-16 bg-red-900/30 rounded-full items-center justify-center border-4 border-red-500/30 mb-4">
              <AlertTriangle color="#f87171" size={36} />
            </View>
          )}

          <DialogHeader className="items-center">
            <DialogTitle className="text-2xl font-bold text-white text-center">
              {title}
            </DialogTitle>
            <DialogDescription className="text-center text-gray-400 mt-2 text-lg">
              {description}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="pt-6 flex-row gap-4 w-full">
            <TouchableOpacity
              onPress={onClose}
              className="flex-1 py-3 border border-gray-600 rounded-lg bg-[#212121]"
            >
              <Text className="font-bold text-lg text-gray-300 text-center">
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onConfirm}
              className={`flex-1 py-3 rounded-lg ${
                isDestructive ? "bg-red-600" : "bg-blue-600"
              }`}
            >
              <Text className="font-bold text-white text-lg text-center">
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
