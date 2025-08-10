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
      <DialogContent className="min-w-[580px] p-0 rounded-2xl overflow-hidden bg-white">
        <View className="bg-gray-800 p-6 w-full">
          <DialogTitle className="text-white text-2xl font-bold text-center">
            Add New Printer
          </DialogTitle>
        </View>
        <View className="bg-white p-6 space-y-4 w-full">
          <View>
            <Text className="font-bold mb-2 text-gray-700">Item Name</Text>
            <TextInput
              value={itemName}
              onChangeText={setItemName}
              placeholder="Printer Name"
              className="p-3 bg-gray-100 rounded-lg text-base"
            />
          </View>
          <View>
            <Text className="font-bold mb-2 text-gray-700">
              Connection Type
            </Text>
            <Select
              value={connectionType}
              onValueChange={(option) => {
                // This wrapper ensures the type is handled correctly
                if (option) {
                  setConnectionType(option);
                }
              }}
            >
              <SelectTrigger className="w-full p-3 bg-gray-100 rounded-lg flex-row justify-between items-center">
                <SelectValue
                  className="text-base text-gray-800"
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

          {/* 4. The conditional rendering now checks the `.value` property of the state object */}
          {connectionType?.value === "wifi" && (
            <View>
              <TextInput
                value={ipAddress}
                onChangeText={setIpAddress}
                placeholder="Type IP Address"
                className="p-3 bg-gray-100 rounded-lg text-base"
              />
            </View>
          )}

          {connectionType?.value === "bluetooth" && (
            <View>
              <Select value={selectedDevice} onValueChange={setSelectedDevice}>
                <SelectTrigger className="w-full p-3 bg-gray-100 rounded-lg flex-row justify-between items-center">
                  <SelectValue
                    className="text-base text-gray-800"
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
        </View>
        <DialogFooter className="p-6 border-t border-gray-200 w-full">
          <TouchableOpacity
            onPress={() => onAdd({})}
            className="flex-1 py-3 bg-primary-400 rounded-lg items-center"
          >
            <Text className="font-bold text-white">Done</Text>
          </TouchableOpacity>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddNewPrinterModal;
