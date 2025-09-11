import { InventoryItemForm } from "@/components/inventory/InventoryItemForm";
import { MenuItemType } from "@/lib/types";
import { useItemStore } from "@/stores/useItemStore";
import { useRouter } from "expo-router";
import React from "react";

const AddItemScreen = () => {
  const router = useRouter();
  const { addItem } = useItemStore();

  const handleAddItem = (data: Partial<MenuItemType>) => {
    // <-- UPDATED
    const newItemData = {
      // Add default values for all required fields
      name: "New Item",
      description: "",
      price: 0,
      pricingType: "fixed",
      meal: ["Lunch", "Dinner"],
      category: "Main Course",
      availability: true,
      stock: 0,
      unit: "PCs",
      status: "Active",
      ...data,
    } as Omit<MenuItemType, "id" | "serialNo" | "lastUpdate">;

    addItem(newItemData);
    router.back();
  };

  return (
    <InventoryItemForm onSave={handleAddItem} onCancel={() => router.back()} />
  );
};

export default AddItemScreen;
