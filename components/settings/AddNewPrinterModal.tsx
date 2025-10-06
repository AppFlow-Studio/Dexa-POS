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
      <DialogContent className="p-0 rounded-2xl overflow-hidden bg-[#303030] border border-gray-700 max-w-sm">
        {/* Header */}
        <View className="p-4 border-b border-gray-700">
          <DialogTitle className="text-white text-xl font-bold text-center">
            Add New Printer
          </DialogTitle>
        </View>

        {/* Content Area */}
        <View className="p-4 gap-y-4">
          <View>
            <Text className="font-semibold mb-1.5 text-gray-300 text-base">
              Printer Name
            </Text>
            <TextInput
              value={itemName}
              onChangeText={setItemName}
              placeholder="e.g., Kitchen Printer"
              placeholderTextColor="#6B7280"
              className="p-3 bg-[#212121] border border-gray-600 rounded-lg text-lg text-white h-14"
            />
          </View>

          <View>
            <Text className="font-semibold mb-1.5 text-gray-300 text-base">
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
              <SelectTrigger className="w-full p-2 bg-[#212121] border-gray-600 rounded-lg flex-row justify-between items-center">
                <SelectValue
                  className="text-sm text-white"
                  placeholder="Select..."
                />
              </SelectTrigger>
              <SelectContent
                insets={contentInsets}
                className="bg-[#212121] border-gray-600"
              >
                <SelectGroup>
                  {CONNECTION_TYPES.map((type) => (
                    <SelectItem
                      key={type.value}
                      label={type.label}
                      value={type.value}
                    >
                      <Text className="text-white text-lg">{type.label}</Text>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </View>

          {connectionType?.value === "wifi" && (
            <View>
              <Text className="font-semibold mb-1.5 text-gray-300 text-base">
                IP Address
              </Text>
              <TextInput
                value={ipAddress}
                onChangeText={setIpAddress}
                placeholder="Type IP Address"
                placeholderTextColor="#6B7280"
                className="p-3 bg-[#212121] border border-gray-600 rounded-lg text-lg text-white h-14"
              />
            </View>
          )}

          {connectionType?.value === "bluetooth" && (
            <View>
              <Text className="font-semibold mb-1.5 text-gray-300 text-base">
                Select Device
              </Text>
              <Select value={selectedDevice} onValueChange={setSelectedDevice}>
                <SelectTrigger className="w-full p-3 bg-[#212121] border border-gray-600 rounded-lg h-14">
                  <SelectValue
                    className="text-lg text-white"
                    placeholder="Select device..."
                  />
                </SelectTrigger>
                <SelectContent
                  insets={contentInsets}
                  className="bg-[#212121] border-gray-600"
                >
                  <SelectGroup>
                    {MOCK_BLUETOOTH_DEVICES.map((device) => (
                      <SelectItem
                        key={device.value}
                        label={device.label}
                        value={device.value}
                      >
                        <Text className="text-lg text-white">
                          {device.label}
                        </Text>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </View>
          )}

          <DialogFooter className="pt-4 mt-2">
            <TouchableOpacity
              onPress={() => onAdd({})}
              className="w-full py-3 bg-blue-600 rounded-lg"
            >
              <Text className="font-bold text-white text-center text-lg">
                Add Printer
              </Text>
            </TouchableOpacity>
          </DialogFooter>
        </View>
      </DialogContent>
    </Dialog>
  );
};

export default AddNewPrinterModal;
