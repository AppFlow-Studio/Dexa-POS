import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { colors } from "@/lib/theme";
import React, { useState } from "react";
import {
  KeyboardAvoidingView, // <--- Imported
  Platform, // <--- Imported
  Text,
  TextInput,
  View,
} from "react-native";

interface DenyRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  title: string;
  description: string;
}

export function DenyRequestModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
}: DenyRequestModalProps) {
  const [reason, setReason] = useState("");

  const handleConfirm = () => {
    onConfirm(reason);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-panel border-border">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <DialogHeader>
            <DialogTitle className="text-white">{title}</DialogTitle>
          </DialogHeader>
          <View className="py-4 gap-y-2">
            <Text className="text-gray-400">{description}</Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="Provide a reason (optional)..."
              placeholderTextColor={colors.muted}
              multiline
              className="p-3 bg-card border border-border rounded-lg text-white min-h-[80px] mt-2"
            />
          </View>
          <DialogFooter className="gap-2">
            <Button variant="outline" onPress={onClose}>
              <Text className="text-white">Cancel</Text>
            </Button>
            <Button variant="destructive" onPress={handleConfirm}>
              <Text className="text-white font-semibold">Confirm Denial</Text>
            </Button>
          </DialogFooter>
        </KeyboardAvoidingView>
      </DialogContent>
    </Dialog>
  );
}
