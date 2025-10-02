import { Plus } from "lucide-react-native";
import React from "react";
import { TouchableOpacity, View } from "react-native";

interface AddTableButtonProps {
  onPress: () => void;
}

const AddTableButton: React.FC<AddTableButtonProps> = ({ onPress }) => {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="absolute bottom-8 right-8 z-10"
      activeOpacity={0.8}
    >
      <View className="w-20 h-20 bg-blue-600 rounded-full items-center justify-center shadow-lg shadow-black/50">
        <Plus color="white" size={40} strokeWidth={3} />
      </View>
    </TouchableOpacity>
  );
};

export default AddTableButton;
