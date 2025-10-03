import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./dialog";

interface UnsavedChangesDialogProps {
  isOpen: boolean;
  onCancel: () => void;
  onDiscard: () => void;
}

const UnsavedChangesDialog: React.FC<UnsavedChangesDialogProps> = ({
  isOpen,
  onCancel,
  onDiscard,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onCancel}>
      <DialogContent className="bg-[#1e1e1e] border-gray-700 w-[400px] p-6 rounded-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-white">
            Unsaved Changes
          </DialogTitle>
          <DialogDescription className="text-base text-gray-400 mt-2">
            You have unsaved changes. Are you sure you want to go back?
          </DialogDescription>
        </DialogHeader>
        <View className="flex-row justify-end gap-4 mt-6">
          <TouchableOpacity onPress={onCancel} className="py-2 px-4 rounded">
            <Text className="text-blue-400 font-semibold text-base">
              CANCEL
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onDiscard} className="py-2 px-4 rounded">
            <Text className="text-red-400 font-semibold text-base">
              DISCARD
            </Text>
          </TouchableOpacity>
        </View>
      </DialogContent>
    </Dialog>
  );
};

export default UnsavedChangesDialog;
