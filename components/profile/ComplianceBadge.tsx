import React from "react";
import { Text, View } from "react-native";

interface ComplianceBadgeProps {
  icon: React.ReactNode;
  text: string;
  variant: "default" | "success" | "warning";
}

const ComplianceBadge: React.FC<ComplianceBadgeProps> = ({
  icon,
  text,
  variant,
}) => {
  const baseClasses = "flex-row items-center gap-1.5 px-2 py-1 rounded";
  const variantClasses = {
    default: "bg-gray-700",
    success: "bg-green-500/20",
    warning: "bg-yellow-500/20",
  };
  const textClasses = {
    default: "text-gray-300",
    success: "text-green-400",
    warning: "text-yellow-400",
  };

  return (
    <View className={`${baseClasses} ${variantClasses[variant]}`}>
      {icon}
      <Text className={`text-xs font-medium ${textClasses[variant]}`}>
        {text}
      </Text>
    </View>
  );
};

export default ComplianceBadge;
