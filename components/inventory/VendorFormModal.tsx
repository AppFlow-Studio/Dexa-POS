import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { colors } from "@/lib/theme";
import { Vendor } from "@/lib/types";
import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

interface VendorFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Omit<Vendor, "id">, id?: string) => void;
  initialData?: Vendor | null;
}

const inputStyle = {
  backgroundColor: colors.screen,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: 8,
  color: colors.heading,
  fontSize: 14,
  height: 40,
  paddingHorizontal: 12,
};

const fieldLabel = {
  fontSize: 11,
  fontWeight: "600" as const,
  color: colors.muted,
  textTransform: "uppercase" as const,
  letterSpacing: 0.5,
  marginBottom: 6,
};

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
      <DialogContent
        className="w-[480px]"
        style={{ backgroundColor: colors.panel, borderColor: colors.border }}
      >
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <DialogHeader>
            <DialogTitle style={{ fontSize: 15, fontWeight: "700", color: colors.heading }}>
              {initialData ? "Edit" : "Add New"} Vendor
            </DialogTitle>
          </DialogHeader>

          <View style={{ paddingVertical: 14, gap: 10 }}>
            {/* Row 1: Name + Contact */}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={fieldLabel}>Vendor Name *</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Fresh Farms Co."
                  placeholderTextColor={colors.muted}
                  style={inputStyle}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={fieldLabel}>Contact Person *</Text>
                <TextInput
                  value={contactPerson}
                  onChangeText={setContactPerson}
                  placeholder="e.g. John Smith"
                  placeholderTextColor={colors.muted}
                  style={inputStyle}
                />
              </View>
            </View>

            {/* Row 2: Email + Phone */}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={fieldLabel}>Email Address</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  placeholder="email@vendor.com"
                  placeholderTextColor={colors.muted}
                  style={inputStyle}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={fieldLabel}>Phone Number</Text>
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  placeholder="+1 (555) 000-0000"
                  placeholderTextColor={colors.muted}
                  style={inputStyle}
                />
              </View>
            </View>

            {/* Description */}
            <View>
              <Text style={fieldLabel}>Description</Text>
              <TextInput
                value={desc}
                onChangeText={setDesc}
                placeholder="Optional notes about this vendor..."
                placeholderTextColor={colors.muted}
                style={[inputStyle, { height: 72, paddingTop: 10, textAlignVertical: "top" }]}
                multiline
                numberOfLines={3}
              />
            </View>
          </View>

          <DialogFooter className="flex-row gap-2">
            <TouchableOpacity
              onPress={onClose}
              style={{
                flex: 1,
                paddingVertical: 9,
                backgroundColor: "transparent",
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.label }}>
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSave}
              style={{
                flex: 1,
                paddingVertical: 9,
                backgroundColor: colors.teal + "20",
                borderWidth: 1,
                borderColor: colors.teal + "50",
                borderRadius: 8,
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.teal }}>
                Save Vendor
              </Text>
            </TouchableOpacity>
          </DialogFooter>
        </KeyboardAvoidingView>
      </DialogContent>
    </Dialog>
  );
};

export default VendorFormModal;
