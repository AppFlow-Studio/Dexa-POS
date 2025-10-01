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
      <DialogContent className="p-0 rounded-3xl overflow-hidden bg-[#11111A] max-w-sm">
        {/* Dark Header */}
        <View className="p-3 pb-0 rounded-t-3xl">
          <DialogTitle className="text-[#F1F1F1] text-xl font-bold text-center">
            Add New Printer
          </DialogTitle>
        </View>

        {/* White Content */}
        <View className="p-4 rounded-3xl bg-background-100 gap-y-3">
          <View>
            <Text className="font-bold mb-1.5 text-accent-500 text-sm">
              Item Name
            </Text>
            <TextInput
              value={itemName}
              onChangeText={setItemName}
              placeholder="Printer Name"
              className="p-2 bg-gray-100 rounded-lg text-sm text-accent-500 h-16"
            />
          </View>

          <View>
            <Text className="font-bold mb-1.5 text-accent-500 text-sm">
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
              <SelectTrigger className="w-full p-2 bg-gray-100 rounded-lg flex-row justify-between items-center">
                <SelectValue
                  className="text-sm text-accent-500"
                  placeholder="Select..."
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
                      <Text className="text-sm">{type.label}</Text>
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
                className="p-2 bg-gray-100 rounded-lg text-sm text-accent-500 h-16"
              />
            </View>
          )}

          {connectionType?.value === "bluetooth" && (
            <View>
              <Select value={selectedDevice} onValueChange={setSelectedDevice}>
                <SelectTrigger className="w-full p-2 bg-gray-100 rounded-lg flex-row justify-between items-center">
                  <SelectValue
                    className="text-sm text-accent-500"
                    placeholder="Select device..."
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
                        <Text className="text-sm">{device.label}</Text>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </View>
          )}
          {/* Footer with Button */}
          <DialogFooter className="pt-4 border-t border-gray-200">
            <TouchableOpacity
              onPress={() => onAdd({})}
              className="w-full py-2 bg-primary-400 rounded-lg"
            >
              <Text className="font-bold text-white text-center text-base">
                Done
              </Text>
            </TouchableOpacity>
          </DialogFooter>
        </View>
      </DialogContent>
    </Dialog>
  );
};

export default AddNewPrinterModal;
