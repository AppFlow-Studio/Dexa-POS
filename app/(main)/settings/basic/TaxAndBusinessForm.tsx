import React from "react";
import { KeyboardTypeOptions, Text, TextInput, View } from "react-native";

interface FormFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  isEditable: boolean;
  keyboardType?: KeyboardTypeOptions;
}

const FormField: React.FC<FormFieldProps> = ({
  label,
  value,
  onChange,
  isEditable,
  keyboardType = "default",
}) => (
  <View className="flex-1">
    <Text className="text-base text-gray-400 mb-1">{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChange}
      editable={isEditable}
      keyboardType={keyboardType}
      className={`h-14 p-3 rounded-lg border text-lg ${
        isEditable
          ? "bg-[#212121] border-gray-600 text-white"
          : "bg-gray-800 border-gray-700 text-gray-400"
      }`}
    />
  </View>
);

interface TaxSettings {
  storeTaxId: string;
  defaultTaxRate: number;
}

interface TaxAndBusinessFormProps {
  settings: TaxSettings;
  onUpdate: (key: keyof TaxSettings, value: string | number) => void;
  isEditable: boolean;
}

const TaxAndBusinessForm: React.FC<TaxAndBusinessFormProps> = ({
  settings,
  onUpdate,
  isEditable,
}) => {
  return (
    <View className="flex-row gap-4">
      <FormField
        label="Store Tax ID"
        value={settings.storeTaxId}
        onChange={(val) => onUpdate("storeTaxId", val)}
        isEditable={isEditable}
      />
      <FormField
        label="Default Sales Tax Rate (%)"
        value={settings.defaultTaxRate.toString()}
        onChange={(val) => onUpdate("defaultTaxRate", parseFloat(val) || 0)}
        isEditable={isEditable}
        keyboardType="numeric"
      />
    </View>
  );
};

export default TaxAndBusinessForm;
