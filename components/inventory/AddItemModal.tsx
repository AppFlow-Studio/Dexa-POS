import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import InventoryItemForm from "./InventoryItemForm";

const AddItemModal = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) => (
  <Dialog open={isOpen} onOpenChange={onClose}>
    <DialogContent className="p-6 bg-white">
      <DialogHeader>
        <DialogTitle className="text-2xl font-bold">Add Item</DialogTitle>
      </DialogHeader>
      <InventoryItemForm
        onCancel={onClose}
        onSave={() => {
          /* logic here */
        }}
      />
    </DialogContent>
  </Dialog>
);

export default AddItemModal;
