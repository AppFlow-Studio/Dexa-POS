import React, { useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
// 1. Import the necessary UI components, including the Select parts
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "../ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
// Import the hook for safe area insets
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface AddNewPrinterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (data: any) => void;
}

// Define a type for our select options for better type safety
type SelectOption = { label: string; value: string };

// Mock data now using the SelectOption type
const MOCK_BLUETOOTH_DEVICES: SelectOption[] = [
  { label: "Star Micronics TSP100", value: "STAR-TSP100-BT" },
  { label: "Epson TM-m30II", value: "EPSON-TM-M30II-BT" },
  { label: "Brother QL-820NWB", value: "BROTHER-QL-820NWB-BT" },
];
const CONNECTION_TYPES: SelectOption[] = [
  { label: "Wi-Fi", value: "wifi" },
  { label: "Bluetooth", value: "bluetooth" },
];

const AddNewPrinterModal: React.FC<AddNewPrinterModalProps> = ({
  isOpen,
  onClose,
  onAdd,
}) => {
  const [itemName, setItemName] = useState("");
  const [connectionType, setConnectionType] = useState<SelectOption>(
    CONNECTION_TYPES[0]
  );
  const [selectedDevice, setSelectedDevice] = useState<
    SelectOption | undefined
  >();
  const [ipAddress, setIpAddress] = useState("");

  const insets = useSafeAreaInsets();
  const contentInsets = {
    top: insets.top,
    bottom: insets.bottom,
    left: 12,
    right: 12,
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="p-0 rounded-[36px] overflow-hidden bg-[#11111A] max-w-md">
        {/* Dark Header */}
        <View className="p-4 pb-0 rounded-t-[36px]">
          <DialogTitle className="text-[#F1F1F1] text-2xl font-bold text-center">
            Add New Printer
          </DialogTitle>
        </View>

        {/* White Content */}
        <View className="p-6 rounded-[36px] bg-background-100 gap-y-4">
          <View>
            <Text className="font-bold mb-2 text-accent-500">Item Name</Text>
            <TextInput
              value={itemName}
              onChangeText={setItemName}
              placeholder="Printer Name"
              className="p-3 bg-gray-100 rounded-lg text-base text-accent-500 h-20"
            />
          </View>

          <View>
            <Text className="font-bold mb-2 text-accent-500">
              Connection Type
            </Text>
            <Select
              value={connectionType}
              onValueChange={(option) => {
                if (option) {
                  setConnectionType(option);
                }
              }}
            >
              <SelectTrigger className="w-full p-3 bg-gray-100 rounded-lg flex-row justify-between items-center">
                <SelectValue
                  className="text-base text-accent-500"
                  placeholder="Select connection type..."
                />
              </SelectTrigger>
              <SelectContent insets={contentInsets}>
                <SelectGroup>
                  {CONNECTION_TYPES.map((type) => (
                    <SelectItem
                      key={type.value}
                      label={type.label}
                      value={type.value}
                    >
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </View>

          {connectionType?.value === "wifi" && (
            <View>
              <TextInput
                value={ipAddress}
                onChangeText={setIpAddress}
                placeholder="Type IP Address"
                className="p-3 bg-gray-100 rounded-lg text-base text-accent-500 h-20"
              />
            </View>
          )}

          {connectionType?.value === "bluetooth" && (
            <View>
              <Select value={selectedDevice} onValueChange={setSelectedDevice}>
                <SelectTrigger className="w-full p-3 bg-gray-100 rounded-lg flex-row justify-between items-center">
                  <SelectValue
                    className="text-base text-accent-500"
                    placeholder="Select available device..."
                  />
                </SelectTrigger>
                <SelectContent insets={contentInsets}>
                  <SelectGroup>
                    {MOCK_BLUETOOTH_DEVICES.map((device) => (
                      <SelectItem
                        key={device.value}
                        label={device.label}
                        value={device.value}
                      >
                        {device.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </View>
          )}
          {/* Footer with Button */}
          <DialogFooter className="pt-6 border-t border-gray-200">
            <TouchableOpacity
              onPress={() => onAdd({})}
              className="w-full py-3 bg-primary-400 rounded-lg"
            >
              <Text className="font-bold text-white text-center">Done</Text>
            </TouchableOpacity>
          </DialogFooter>
        </View>
      </DialogContent>
    </Dialog>
  );
};

export default AddNewPrinterModal;
