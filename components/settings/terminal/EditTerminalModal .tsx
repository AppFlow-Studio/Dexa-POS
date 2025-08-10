import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PaymentTerminal } from "@/lib/types";
import React, { useEffect, useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface EditTerminalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  terminal: PaymentTerminal | null;
}

// Define types and options for the Select component
type SelectOption = { label: string; value: string };
const CONFIG_TYPES: SelectOption[] = [
  { label: "Connected", value: "Connected" },
  { label: "Disconnected", value: "Disconnected" },
];

const EditTerminalModal: React.FC<EditTerminalModalProps> = ({
  isOpen,
  onClose,
  onSave,
  terminal,
}) => {
  const [terminalName, setTerminalName] = useState("");
  // 2. Add state to manage the selected configuration type
  const [configType, setConfigType] = useState<SelectOption | undefined>();

  useEffect(() => {
    if (terminal) {
      setTerminalName(terminal.name);
      setConfigType({ label: terminal.status, value: terminal.status });
    }
  }, [terminal]);

  // Get insets for the dropdown content positioning
  const insets = useSafeAreaInsets();
  const contentInsets = {
    top: insets.top,
    bottom: insets.bottom,
    left: 12,
    right: 12,
  };

  if (!terminal) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg p-0 rounded-2xl overflow-hidden bg-white">
        <View className="bg-gray-800 p-6">
          <DialogTitle className="text-white text-2xl font-bold text-center">
            Edit Terminal
          </DialogTitle>
        </View>
        <View className="bg-white p-6 space-y-4">
          <View>
            <Text className="font-bold mb-2">Terminal Name</Text>
            <TextInput
              value={terminalName}
              onChangeText={setTerminalName}
              className="p-3 bg-gray-100 rounded-lg"
            />
          </View>
          <View>
            <Text className="font-bold mb-2">Terminal ID</Text>
            <TextInput
              value={terminal.id}
              className="p-3 bg-gray-100 rounded-lg"
              editable={false}
            />
          </View>

          {/* 3. Add the Select component for Configuration Type */}
          <View>
            <Text className="font-bold mb-2 text-gray-700">
              Configuration Type
            </Text>
            <Select
              value={configType}
              onValueChange={(option) => option && setConfigType(option)}
            >
              <SelectTrigger className="w-full p-3 bg-gray-100 rounded-lg flex-row justify-between items-center">
                <SelectValue
                  placeholder="Select type..."
                  className="text-base text-gray-800"
                />
              </SelectTrigger>
              <SelectContent insets={contentInsets}>
                <SelectGroup>
                  {CONFIG_TYPES.map((opt) => (
                    <SelectItem
                      key={opt.value}
                      label={opt.label}
                      value={opt.value}
                    >
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </View>
        </View>

        <DialogFooter className="p-6 border-t border-gray-200">
          <TouchableOpacity
            onPress={onSave}
            className="flex-1 py-3 bg-primary-400 rounded-lg items-center"
          >
            <Text className="font-bold text-white">Done</Text>
          </TouchableOpacity>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditTerminalModal;
