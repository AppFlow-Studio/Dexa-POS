import { useToastStore } from "@/stores/useToastStore";
import { colors } from "@/lib/theme";
import {
  AlertTriangle,
  CheckCircle2,
  Undo2,
  X,
  XCircle,
} from "lucide-react-native";
import { MotiView } from "moti";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface CustomToastProps {
  id: string;
  title: string;
  message: string;
  onUndo?: () => void;
  type?: "success" | "error" | "warning";
}

const CustomToast: React.FC<CustomToastProps> = ({
  id,
  title,
  message,
  onUndo,
  type = "success",
}) => {
  const hide = useToastStore((s) => s.hide);

  const handleUndo = () => {
    if (onUndo) {
      onUndo();
    }
    hide(id);
  };

  const handleDismiss = () => {
    hide(id);
  };

  const isError = type === "error";
  const isWarning = type === "warning";

  const containerClasses = isError
    ? "flex-row items-center bg-gray-800 border border-red-500 rounded-lg p-4 w-full"
    : isWarning
      ? "flex-row items-center bg-gray-800 border border-yellow-500 rounded-lg p-4 w-full"
      : "flex-row items-center bg-gray-800 border border-green-500 rounded-lg p-4 w-full";

  const Icon = isError ? (
    <XCircle size={24} color={colors.danger} />
  ) : isWarning ? (
    <AlertTriangle size={24} color={colors.warning} />
  ) : (
    <CheckCircle2 size={24} color={colors.success} />
  );

  // Compact layout when undo is present (e.g. KDS ticket advance)
  if (onUndo) {
    return (
      <MotiView
        from={{ opacity: 0, translateY: 12 }}
        animate={{ opacity: 1, translateY: 0 }}
        exit={{ opacity: 0, translateY: 12 }}
        transition={{ type: "timing", duration: 200 }}
        style={{
          maxWidth: 300,
          width: 300,
          marginBottom: 6,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: "#1f2937",
            borderWidth: 1,
            borderColor: isError ? "#ef4444" : isWarning ? "#eab308" : "#22c55e",
            borderRadius: 8,
            paddingHorizontal: 10,
            paddingVertical: 6,
          }}
        >
          {React.cloneElement(Icon as React.ReactElement, { size: 14 })}
          <View style={{ flex: 1, marginLeft: 6 }}>
            <Text
              style={{ color: "#fff", fontSize: 11, fontWeight: "600" }}
              numberOfLines={1}
            >
              {title}
            </Text>
            <Text
              style={{ color: "#9ca3af", fontSize: 9, marginTop: 1 }}
              numberOfLines={1}
            >
              {message} · {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleUndo}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "rgba(234,179,8,0.2)",
              borderWidth: 1,
              borderColor: "rgba(234,179,8,0.3)",
              borderRadius: 6,
              paddingHorizontal: 8,
              paddingVertical: 3,
              marginLeft: 8,
            }}
          >
            <Undo2 size={11} color={colors.warning} />
            <Text style={{ color: "#facc15", fontSize: 10, fontWeight: "700", marginLeft: 3 }}>
              UNDO
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDismiss} style={{ marginLeft: 6 }}>
            <X size={14} color={colors.label} />
          </TouchableOpacity>
        </View>
      </MotiView>
    );
  }

  return (
    <MotiView
      from={{ opacity: 0, translateY: -20 }}
      animate={{ opacity: 1, translateY: 0 }}
      exit={{ opacity: 0, translateY: -20 }}
      transition={{ type: "timing", duration: 300 }}
      style={{
        width: 380,
        maxWidth: 400,
        marginBottom: 10,
      }}
    >
      <View className={containerClasses}>
        {Icon}
        <View className="flex-1 ml-3">
          <Text className="text-white font-bold text-base">{title}</Text>
          <Text className="text-gray-300 text-sm mt-1">{message}</Text>
        </View>
        <TouchableOpacity onPress={handleDismiss} className="ml-2">
          <X size={18} color={colors.label} />
        </TouchableOpacity>
      </View>
    </MotiView>
  );
};

export default CustomToast;
