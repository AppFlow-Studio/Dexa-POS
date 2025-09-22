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
      <DialogContent className="p-0 rounded-[36px] overflow-hidden bg-[#11111A] max-w-xl w-full">
        {/* Dark Header */}
        <View className="p-4 pb-0 rounded-t-[36px]">
          <DialogTitle className="text-[#F1F1F1] text-2xl font-bold text-center">
            Edit Terminal
          </DialogTitle>
        </View>

        {/* White Content */}
        <View className="p-6 rounded-[36px] bg-background-100 space-y-4">
          <View>
            <Text className="font-bold mb-2 text-accent-500">
              Terminal Name
            </Text>
            <TextInput
              value={terminalName}
              onChangeText={setTerminalName}
              className="p-3 bg-gray-100 rounded-lg text-base text-accent-500 h-20"
            />
          </View>

          <View>
            <Text className="font-bold mb-2 text-accent-500">Terminal ID</Text>
            <TextInput
              value={terminal.id}
              className="p-3 bg-gray-100 rounded-lg text-base text-accent-500 h-20"
              editable={false}
            />
          </View>

          {/* Configuration Type Select */}
          <View>
            <Text className="font-bold mb-2 text-accent-500">
              Configuration Type
            </Text>
            <Select
              value={configType}
              onValueChange={(option) => option && setConfigType(option)}
            >
              <SelectTrigger className="w-full p-3 bg-gray-100 rounded-lg flex-row justify-between items-center">
                <SelectValue
                  placeholder="Select type..."
                  className="text-base text-accent-500"
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

          {/* Footer with Button */}
          <DialogFooter className="pt-6 border-t border-gray-200">
            <TouchableOpacity
              onPress={onSave}
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

export default EditTerminalModal;
