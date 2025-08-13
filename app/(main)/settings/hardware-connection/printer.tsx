import AddNewPrinterModal from "@/components/settings/AddNewPrinterModal";
import EditPrinterModal from "@/components/settings/EditPrinterModal";
import RemovePrinterModal from "@/components/settings/RemovePrinterModal";
import { MOCK_PRINTERS } from "@/lib/mockData";
import { PrinterDevice } from "@/lib/types";
import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import PrinterRow from "./PrinterRow";

const PrinterSettingsScreen = () => {
  const [printers, setPrinters] = useState(MOCK_PRINTERS);
  const [isAddModalOpen, setAddModalOpen] = useState(false);
  const [isEditModalOpen, setEditModalOpen] = useState(false);
  const [isRemoveModalOpen, setRemoveModalOpen] = useState(false);
  const [selectedPrinter, setSelectedPrinter] = useState<PrinterDevice | null>(
    null
  );

  const handleTogglePrinter = (id: string) => {
    setPrinters((prev) =>
      prev.map((p) => (p.id === id ? { ...p, isEnabled: !p.isEnabled } : p))
    );
  };

  const handleOpenRemoveModal = (printer: PrinterDevice) => {
    setSelectedPrinter(printer);
    setRemoveModalOpen(true);
  };

  const handleOpenEditModal = (printer: PrinterDevice) => {
    setSelectedPrinter(printer);
    setEditModalOpen(true);
  };

  const handleSavePrinter = (updatedPrinter: PrinterDevice) => {
    setPrinters((prev) =>
      prev.map((p) => (p.id === updatedPrinter.id ? updatedPrinter : p))
    );
    setEditModalOpen(false);
  };

  const handleRemovePrinter = () => {
    if (selectedPrinter) {
      setPrinters((prev) => prev.filter((p) => p.id !== selectedPrinter.id));
    }
    setRemoveModalOpen(false);
  };

  return (
    <View className="flex-1 bg-background-300 p-6">
      <View className="flex-1 gap-y-4">
        {printers.map((printer) => (
          <PrinterRow
            key={printer.id}
            printer={printer}
            onToggle={handleTogglePrinter}
            onEdit={() => handleOpenEditModal(printer)}
            onRemove={() => handleOpenRemoveModal(printer)}
          />
        ))}
      </View>

      {/* Footer */}
      <View className="flex-row justify-start gap-2 pt-4 border-t border-gray-200">
        <TouchableOpacity
          onPress={() => setAddModalOpen(true)}
          className="px-6 py-3 border border-gray-300 rounded-lg"
        >
          <Text className="font-bold text-gray-700">Add New Printer</Text>
        </TouchableOpacity>
        <TouchableOpacity className="px-8 py-3 bg-primary-400 rounded-lg">
          <Text className="font-bold text-white">Save Changes</Text>
        </TouchableOpacity>
      </View>

      {/* Modals */}
      <AddNewPrinterModal
        isOpen={isAddModalOpen}
        onClose={() => setAddModalOpen(false)}
        onAdd={() => {}}
      />
      <EditPrinterModal
        isOpen={isEditModalOpen}
        onClose={() => setEditModalOpen(false)}
        onSave={handleSavePrinter}
        printer={selectedPrinter}
      />
      <RemovePrinterModal
        isOpen={isRemoveModalOpen}
        onClose={() => setRemoveModalOpen(false)}
        onRemove={handleRemovePrinter}
      />
    </View>
  );
};

export default PrinterSettingsScreen;
