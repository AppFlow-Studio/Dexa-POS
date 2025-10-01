import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Vendor } from "@/lib/types";
import React, { useEffect, useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";

interface VendorFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Omit<Vendor, "id">, id?: string) => void;
  initialData?: Vendor | null;
}

const VendorFormModal: React.FC<VendorFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
}) => {
  const [name, setName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [desc, setDesc] = useState("");
  useEffect(() => {
    if (isOpen && initialData) {
      setName(initialData.name);
      setContactPerson(initialData.contactPerson);
      setEmail(initialData.email);
      setPhone(initialData.phone);
      setDesc(initialData.description || "");
    } else {
      setName("");
      setContactPerson("");
      setEmail("");
      setPhone("");
      setDesc("");
    }
  }, [initialData, isOpen]);

  const handleSave = () => {
    if (!name || !contactPerson) {
      alert("Please fill in at least the vendor name and contact person.");
      return;
    }
    onSave(
      { name, contactPerson, email, phone, description: desc },
      initialData?.id
    );
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-[#303030] border-gray-700 w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-white text-xl">
            {initialData ? "Edit" : "Add New"} Vendor
          </DialogTitle>
        </DialogHeader>
        <View className="py-4 gap-y-4">
          <View>
            <Text className="text-lg text-gray-300 font-medium mb-2">
              Vendor Name
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              className="p-2 bg-[#212121] border border-gray-600 rounded-lg text-lg text-white"
            />
          </View>
          <View>
            <Text className="text-lg text-gray-300 font-medium mb-2">
              Contact Person
            </Text>
            <TextInput
              value={contactPerson}
              onChangeText={setContactPerson}
              className="p-2 bg-[#212121] border border-gray-600 rounded-lg text-lg text-white"
            />
          </View>
          <View>
            <Text className="text-lg text-gray-300 font-medium mb-2">
              Email Address
            </Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              className="p-2 bg-[#212121] border border-gray-600 rounded-lg text-lg text-white"
            />
          </View>
          <View>
            <Text className="text-lg text-gray-300 font-medium mb-2">
              Phone Number
            </Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              className="p-2 bg-[#212121] border border-gray-600 rounded-lg text-lg text-white"
            />
          </View>
          <View>
            <Text className="text-lg text-gray-300 font-medium mb-2">
              Description
            </Text>
            <TextInput
              value={desc}
              onChangeText={setDesc}
              className="p-2 bg-[#212121] border border-gray-600 rounded-lg text-lg text-white"
            />
          </View>
        </View>
        <DialogFooter className="flex-row gap-3">
          <TouchableOpacity
            onPress={onClose}
            className="flex-1 py-2 bg-[#212121] border border-gray-600 rounded-lg"
          >
            <Text className="text-center text-lg font-bold text-gray-300">
              Cancel
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSave}
            className="flex-1 py-2 bg-blue-600 rounded-lg"
          >
            <Text className="text-center text-lg font-bold text-white">
              Save Vendor
            </Text>
          </TouchableOpacity>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default VendorFormModal;
