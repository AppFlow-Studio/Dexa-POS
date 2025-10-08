import React from "react";
import { Text, TextInput, View } from "react-native";

interface StoreDetails {
  storeName: string;
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
  phone: string;
  email: string;
  website: string;
}
interface FormFieldProps {
  label: string;
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  isEditable: boolean;
}

const FormRow = ({ children }: { children: React.ReactNode }) => (
  <View className="flex-row gap-4">{children}</View>
);
const FormField = ({
  label,
  value,
  onChange,
  placeholder = "",
  isEditable,
}: FormFieldProps) => (
  <View className="flex-1">
    <Text className="text-base text-gray-400 mb-1">{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      editable={isEditable}
      className={`h-14 p-3 rounded-lg border text-lg ${
        isEditable
          ? "bg-[#212121] border-gray-600 text-white"
          : "bg-gray-800 border-gray-700 text-gray-400"
      }`}
      placeholderTextColor="#6B7280"
    />
  </View>
);

interface StoreDetailsFormProps {
  settings: StoreDetails;
  onUpdate: (key: keyof StoreDetails | "address", value: any) => void;
  isEditable: boolean;
}
const StoreDetailsForm: React.FC<StoreDetailsFormProps> = ({
  settings,
  onUpdate,
  isEditable,
}) => {
  return (
    <View className="gap-y-4">
      <FormRow>
        <FormField
          label="Store Name"
          value={settings.storeName}
          onChange={(val) => onUpdate("storeName", val)}
          isEditable={isEditable}
        />
      </FormRow>
      <FormRow>
        <FormField
          label="Store Address"
          value={settings.address.street}
          onChange={(val) =>
            onUpdate("address", { ...settings.address, street: val })
          }
          isEditable={isEditable}
        />
      </FormRow>
      <FormRow>
        <FormField
          label="City"
          value={settings.address.city}
          onChange={(val) =>
            onUpdate("address", { ...settings.address, city: val })
          }
          isEditable={isEditable}
        />
        <FormField
          label="State"
          value={settings.address.state}
          onChange={(val) =>
            onUpdate("address", { ...settings.address, state: val })
          }
          isEditable={isEditable}
        />
        <FormField
          label="ZIP Code"
          value={settings.address.zip}
          onChange={(val) =>
            onUpdate("address", { ...settings.address, zip: val })
          }
          isEditable={isEditable}
        />
      </FormRow>
      <FormRow>
        <FormField
          label="Phone Number"
          value={settings.phone}
          onChange={(val) => onUpdate("phone", val)}
          isEditable={isEditable}
        />
        <FormField
          label="Email Address"
          value={settings.email}
          onChange={(val) => onUpdate("email", val)}
          isEditable={isEditable}
        />
      </FormRow>
      <FormRow>
        <FormField
          label="Website / Social Link"
          value={settings.website}
          onChange={(val) => onUpdate("website", val)}
          isEditable={isEditable}
        />
      </FormRow>
    </View>
  );
};

export default StoreDetailsForm;
