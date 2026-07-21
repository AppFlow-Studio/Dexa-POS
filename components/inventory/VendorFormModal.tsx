import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { colors } from "@/lib/theme";
import { Vendor } from "@/lib/types";
import { useUiScale } from "@/lib/uiScale";
import { useColorScheme } from "@/lib/useColorScheme";
import React, { useEffect, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

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
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);

  const inputStyle = {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: s(8),
    color: colors.heading,
    fontSize: s(14),
    height: s(40),
    paddingHorizontal: s(12),
    textAlignVertical: "center" as const,
    paddingVertical: 0,
  };

  const fieldLabel = {
    fontSize: s(11),
    fontWeight: "600" as const,
    color: colors.muted,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginBottom: s(6),
  };
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [desc, setDesc] = useState("");
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const { colorScheme } = useColorScheme();
  const { height: windowHeight } = useWindowDimensions();
  const keyboardAppearance = colorScheme === "dark" ? "dark" : "light";

  useEffect(() => {
    if (isOpen && initialData) {
      setName(initialData.name);
      setContactName(initialData.contactName ?? "");
      setEmail(initialData.email ?? "");
      setPhone(initialData.phone ?? "");
      setAddress(initialData.address ?? "");
      setDesc(initialData.description ?? "");
    } else {
      setName("");
      setContactName("");
      setEmail("");
      setPhone("");
      setAddress("");
      setDesc("");
    }
  }, [initialData, isOpen]);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardVisible(true);
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isKeyboardVisible) {
      Keyboard.dismiss();
      return;
    }

    if (!nextOpen) {
      onClose();
    }
  };

  const handleSave = () => {
    if (!name) {
      alert("Please fill in the vendor name.");
      return;
    }
    onSave(
      {
        name,
        contactName,
        email: email || null,
        phone: phone || null,
        address: address || null,
        website: null,
        description: desc || undefined,
      },
      initialData?.id,
    );
    onClose();
  };

  const modalTranslateY = isKeyboardVisible
    ? -Math.min(Math.max(keyboardHeight * 0.42, 80), 220)
    : 0;
  const modalMaxHeight = isKeyboardVisible
    ? Math.max(280, windowHeight - keyboardHeight - 40)
    : windowHeight * 0.88;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="w-[480px]"
        style={{
          backgroundColor: colors.panel,
          borderColor: colors.border,
          maxHeight: modalMaxHeight,
          transform: [{ translateY: modalTranslateY }],
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
          style={{ flexShrink: 1 }}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={
              Platform.OS === "ios" ? "interactive" : "on-drag"
            }
            bounces={false}
            contentContainerStyle={{ paddingBottom: 8 }}
          >
            <DialogHeader>
              <DialogTitle
                style={{
                  fontSize: s(15),
                  fontWeight: "700",
                  color: colors.heading,
                }}
              >
                {initialData ? "Edit" : "Add New"} Vendor
              </DialogTitle>
            </DialogHeader>

            <View style={{ paddingVertical: s(14), gap: s(10) }}>
              {/* Row 1: Name + Contact */}
              <View style={{ flexDirection: "row", gap: s(10) }}>
                <View style={{ flex: 1 }}>
                  <Text style={fieldLabel}>Vendor Name *</Text>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="e.g. Fresh Farms Co."
                    placeholderTextColor={colors.muted}
                    keyboardAppearance={keyboardAppearance}
                    selectionColor={colors.teal}
                    cursorColor={colors.teal}
                    style={inputStyle}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={fieldLabel}>Contact Person</Text>
                  <TextInput
                    value={contactName}
                    onChangeText={setContactName}
                    placeholder="e.g. John Smith"
                    placeholderTextColor={colors.muted}
                    keyboardAppearance={keyboardAppearance}
                    selectionColor={colors.teal}
                    cursorColor={colors.teal}
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
                    autoCapitalize="none"
                    placeholder="email@vendor.com"
                    placeholderTextColor={colors.muted}
                    keyboardAppearance={keyboardAppearance}
                    selectionColor={colors.teal}
                    cursorColor={colors.teal}
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
                    keyboardAppearance={keyboardAppearance}
                    selectionColor={colors.teal}
                    cursorColor={colors.teal}
                    style={inputStyle}
                  />
                </View>
              </View>

              {/* Row 3: Address */}
              <View>
                <Text style={fieldLabel}>Address</Text>
                <TextInput
                  value={address}
                  onChangeText={setAddress}
                  placeholder="123 Main St, City, State"
                  placeholderTextColor={colors.muted}
                  keyboardAppearance={keyboardAppearance}
                  selectionColor={colors.teal}
                  cursorColor={colors.teal}
                  style={inputStyle}
                />
              </View>

              {/* Notes */}
              <View>
                <Text style={fieldLabel}>Notes</Text>
                <TextInput
                  value={desc}
                  onChangeText={setDesc}
                  placeholder="Optional notes about this vendor..."
                  placeholderTextColor={colors.muted}
                  keyboardAppearance={keyboardAppearance}
                  selectionColor={colors.teal}
                  cursorColor={colors.teal}
                  style={[
                    inputStyle,
                    { height: 72, paddingTop: 10, textAlignVertical: "top" },
                  ]}
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
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: colors.label,
                  }}
                >
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
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: colors.teal,
                  }}
                >
                  Save Vendor
                </Text>
              </TouchableOpacity>
            </DialogFooter>
          </ScrollView>
        </KeyboardAvoidingView>
      </DialogContent>
    </Dialog>
  );
};

export default VendorFormModal;
