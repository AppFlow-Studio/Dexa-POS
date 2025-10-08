import { Camera } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface BrandingFormProps {
  isEditable: boolean;
}

const BrandingForm: React.FC<BrandingFormProps> = ({ isEditable }) => {
  const handleUploadLogo = () => {
    // Logic for ImagePicker would go here
    alert("Logo upload functionality to be implemented.");
  };

  return (
    <View>
      <TouchableOpacity
        onPress={handleUploadLogo}
        disabled={!isEditable}
        className={`flex-row items-center gap-2 px-4 py-3 rounded-lg self-start ${
          isEditable ? "bg-blue-600" : "bg-gray-700 opacity-50"
        }`}
      >
        <Camera size={18} color="white" />
        <Text className="text-base font-bold text-white">
          Upload Store Logo
        </Text>
      </TouchableOpacity>
    </View>
  );
};

export default BrandingForm;
