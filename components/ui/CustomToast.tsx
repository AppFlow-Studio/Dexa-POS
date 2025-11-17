import { useToast } from "@/contexts/ToastContext";
import { CheckCircle2, Undo2, X, XCircle } from "lucide-react-native";
import { MotiView } from "moti";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface CustomToastProps {
  id: string;
  title: string;
  message: string;
  onUndo?: () => void;
}

const CustomToast: React.FC<CustomToastProps> = ({
  id,
  title,
  message,
  onUndo,
}) => {
  const { hide } = useToast();

  const handleUndo = () => {
    if (onUndo) {
      onUndo();
    }
    hide(id);
  };

  const handleDismiss = () => {
    hide(id);
  };

  return (
    <MotiView
      from={{ opacity: 0, translateY: 20 }}
      animate={{ opacity: 1, translateY: 0 }}
      exit={{ opacity: 0, translateY: 20 }}
      transition={{ type: "timing", duration: 300 }}
      style={{
        width: "90%",
        maxWidth: 400,
        marginBottom: 10,
      }}
    >
      <View className="flex-row items-center bg-gray-800 border border-green-500 rounded-lg p-4 w-full">
        <CheckCircle2 size={24} color="#22C55E" />
        <View className="flex-1 ml-3">
          <Text className="text-white font-bold text-base">{title}</Text>
          <Text className="text-gray-300 text-sm mt-1">{message}</Text>
          {onUndo && (
            <View className="flex-row mt-4 gap-x-2">
              <TouchableOpacity
                onPress={handleUndo}
                className="flex-row items-center bg-yellow-500/20 border border-yellow-500/30 rounded-md px-3 py-1.5"
              >
                <Undo2 size={14} color="#FBBF24" />
                <Text className="text-yellow-400 font-bold text-xs ml-1.5">
                  UNDO
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDismiss}
                className="flex-row items-center bg-gray-600/50 border border-gray-500/50 rounded-md px-3 py-1.5"
              >
                <XCircle size={14} color="#9CA3AF" />
                <Text className="text-gray-400 font-semibold text-xs ml-1.5">
                  Dismiss
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        {!onUndo && (
          <TouchableOpacity onPress={handleDismiss} className="ml-2">
            <X size={18} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>
    </MotiView>
  );
};

export default CustomToast;
