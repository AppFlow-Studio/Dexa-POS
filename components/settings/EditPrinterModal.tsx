import { PrinterDevice } from "@/lib/types"; // Import your printer type
import { ChevronDown } from "lucide-react-native";
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
      <DialogContent className="min-w-[580px] p-0 rounded-2xl overflow-hidden bg-white">
        <View className="bg-gray-800 p-6 w-full">
          <DialogTitle className="text-white text-2xl font-bold text-center">
            Edit Printer
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
            <Text className="font-bold mb-2 text-gray-700">Printer ID</Text>
            <TextInput
              value={printerId}
              onChangeText={setPrinterId}
              placeholder="Printer ID"
              className="p-3 bg-gray-100 rounded-lg text-base"
              editable={false} // IDs are typically not editable
            />
          </View>
          <View>
            <Text className="font-bold mb-2 text-gray-700">Status</Text>
            <Select
              value={status}
              onValueChange={(option) => option && setStatus(option)}
            >
              <SelectTrigger className="w-full p-3 bg-gray-100 rounded-lg flex-row justify-between items-center">
                <SelectValue
                  placeholder="Select status..."
                  className="text-base text-gray-800"
                />
                <ChevronDown color="#6b7280" size={20} />
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
        </View>
        <DialogFooter className="p-6 border-t border-gray-200 w-full">
          <TouchableOpacity
            onPress={handleSaveChanges}
            className="flex-1 py-3 bg-primary-400 rounded-lg items-center"
          >
            <Text className="font-bold text-white">Done</Text>
          </TouchableOpacity>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditPrinterModal;
