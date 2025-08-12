import { PrinterDevice } from "@/lib/types"; // Import your printer type
import React, { useEffect, useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "../ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

interface EditPrinterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: PrinterDevice) => void;
  printer: PrinterDevice | null; // The printer to edit
}

// Define types and options
type SelectOption = { label: string; value: string };
const STATUS_OPTIONS: SelectOption[] = [
  { label: "Connected", value: "Connected" },
  { label: "Disconnected", value: "Disconnected" },
];

const EditPrinterModal: React.FC<EditPrinterModalProps> = ({
  isOpen,
  onClose,
  onSave,
  printer,
}) => {
  // State for form inputs, initialized with the printer's data
  const [itemName, setItemName] = useState("");
  const [printerId, setPrinterId] = useState("");
  const [status, setStatus] = useState<SelectOption | undefined>();

  // Use an effect to populate the form whenever a new printer is passed in
  useEffect(() => {
    if (printer) {
      setItemName(printer.name);
      setPrinterId("KDH-3473"); // Using mock ID from design
      setStatus({ label: printer.status, value: printer.status });
    }
  }, [printer]);

  const insets = useSafeAreaInsets();
  const contentInsets = {
    top: insets.top,
    bottom: insets.bottom,
    left: 12,
    right: 12,
  };

  const handleSaveChanges = () => {
    if (printer) {
      onSave({
        ...printer,
        name: itemName,
        // id would likely be immutable
        status: status?.value as PrinterDevice["status"],
      });
    }
  };

  if (!printer) return null; // Don't render if no printer is selected

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="p-0 rounded-[36px] overflow-hidden bg-[#11111A] max-w-md">
        {/* Dark Header */}
        <View className="p-4 pb-0 rounded-t-[36px]">
          <DialogTitle className="text-[#F1F1F1] text-2xl font-bold text-center">
            Edit Printer
          </DialogTitle>
        </View>

        {/* White Content */}
        <View className="p-6 rounded-[36px] bg-background-100 space-y-4">
          <View>
            <Text className="font-bold mb-2 text-accent-500">Item Name</Text>
            <TextInput
              value={itemName}
              onChangeText={setItemName}
              placeholder="Printer Name"
              className="p-3 bg-gray-100 rounded-lg text-base text-accent-500"
            />
          </View>

          <View>
            <Text className="font-bold mb-2 text-accent-500">Printer ID</Text>
            <TextInput
              value={printerId}
              onChangeText={setPrinterId}
              placeholder="Printer ID"
              className="p-3 bg-gray-100 rounded-lg text-base text-accent-500"
              editable={false}
            />
          </View>

          <View>
            <Text className="font-bold mb-2 text-accent-500">Status</Text>
            <Select
              value={status}
              onValueChange={(option) => option && setStatus(option)}
            >
              <SelectTrigger className="w-full p-3 bg-gray-100 rounded-lg flex-row justify-between items-center">
                <SelectValue
                  placeholder="Select status..."
                  className="text-base text-accent-500"
                />
              </SelectTrigger>
              <SelectContent insets={contentInsets}>
                <SelectGroup>
                  {STATUS_OPTIONS.map((opt) => (
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
              onPress={handleSaveChanges}
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

export default EditPrinterModal;
