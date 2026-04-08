import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { colors } from "@/lib/theme";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyLock, Mail, Phone, Shield } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { z } from "zod";

const emailSchema = z.object({
  email: z.string().email("Please enter a valid email address."),
});

const phoneRegex = /^[0-9\s\-()]*$/;
const phoneSchema = z.object({
  phone: z
    .string()
    .regex(phoneRegex, "Phone number can only contain digits, spaces, and hyphens.")
    .refine((phone) => phone.replace(/\D/g, "").length >= 10, {
      message: "Phone number must contain at least 10 digits.",
    }),
});

const pinSchema = z
  .object({
    pin: z.string().length(4, "PIN must be exactly 4 digits."),
    confirmPin: z.string().length(4, "PIN must be exactly 4 digits."),
  })
  .refine((data) => data.pin === data.confirmPin, {
    message: "PINs do not match",
    path: ["confirmPin"],
  });

type EmailFormData = z.infer<typeof emailSchema>;
type PhoneFormData = z.infer<typeof phoneSchema>;
type PinFormData = z.infer<typeof pinSchema>;

const inputStyle = {
  backgroundColor: colors.screen,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: 8,
  paddingHorizontal: 12,
  paddingVertical: 10,
  fontSize: 13,
  color: colors.heading,
};

const SectionRow = ({
  icon,
  label,
  value,
  isEditing,
  children,
  onEdit,
  last,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  isEditing: boolean;
  children: React.ReactNode;
  onEdit: () => void;
  last?: boolean;
}) => (
  <View
    style={{
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderBottomWidth: last ? 0 : 1,
      borderBottomColor: colors.border,
    }}
  >
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            backgroundColor: colors.teal + "15",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {icon}
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 10,
              fontWeight: "600",
              color: colors.muted,
              textTransform: "uppercase",
              letterSpacing: 0.8,
              marginBottom: 2,
            }}
          >
            {label}
          </Text>
          {!isEditing && (
            <Text style={{ fontSize: 13, fontWeight: "500", color: colors.heading }}>
              {value}
            </Text>
          )}
        </View>
      </View>
      {!isEditing && (
        <TouchableOpacity
          onPress={onEdit}
          style={{
            paddingVertical: 5,
            paddingHorizontal: 12,
            borderRadius: 7,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: "600", color: colors.label }}>Change</Text>
        </TouchableOpacity>
      )}
    </View>
    {isEditing && <View style={{ marginTop: 12 }}>{children}</View>}
  </View>
);

const FormActions = ({
  onCancel,
  onSave,
  saveLabel = "Save",
}: {
  onCancel: () => void;
  onSave: () => void;
  saveLabel?: string;
}) => (
  <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
    <TouchableOpacity
      onPress={onCancel}
      style={{
        paddingVertical: 6,
        paddingHorizontal: 14,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: "600", color: colors.label }}>Cancel</Text>
    </TouchableOpacity>
    <TouchableOpacity
      onPress={onSave}
      style={{
        paddingVertical: 6,
        paddingHorizontal: 14,
        borderRadius: 8,
        backgroundColor: colors.teal + "20",
        borderWidth: 1,
        borderColor: colors.teal + "50",
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: "600", color: colors.teal }}>{saveLabel}</Text>
    </TouchableOpacity>
  </View>
);

const FieldLabel = ({ label }: { label: string }) => (
  <Text
    style={{
      fontSize: 10,
      fontWeight: "600",
      color: colors.muted,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginBottom: 4,
    }}
  >
    {label}
  </Text>
);

const SecurityTab = () => {
  const { employees, activeEmployeeId, updateSecurity } = useEmployeeStore();
  const [editingSection, setEditingSection] = useState<"email" | "phone" | "pin" | null>(null);

  const currentEmployee = employees.find((e) => e.id === activeEmployeeId);

  const emailForm = useForm<EmailFormData>({ resolver: zodResolver(emailSchema) });
  const phoneForm = useForm<PhoneFormData>({ resolver: zodResolver(phoneSchema) });
  const pinForm = useForm<PinFormData>({ resolver: zodResolver(pinSchema) });

  useEffect(() => {
    if (currentEmployee) {
      emailForm.reset({ email: currentEmployee.email || "" });
      phoneForm.reset({ phone: currentEmployee.phone || "" });
      pinForm.reset({ pin: "", confirmPin: "" });
    }
  }, [currentEmployee]);

  const handleSave = (section: "email" | "phone" | "pin", data: any) => {
    if (!currentEmployee) return;
    if (section === "pin") {
      const isPinInUse = employees.some(
        (emp) => emp.pin === data.pin && emp.id !== currentEmployee.id
      );
      if (isPinInUse) {
        pinForm.setError("pin", {
          type: "manual",
          message: "This PIN is already in use. Please choose another.",
        });
        return;
      }
    }
    updateSecurity(currentEmployee.id, data);
    setEditingSection(null);
  };

  if (!currentEmployee) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: colors.muted, fontSize: 13 }}>No employee selected.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24 }}>
        <Text
          style={{
            fontSize: 11,
            fontWeight: "700",
            color: colors.muted,
            textTransform: "uppercase",
            letterSpacing: 1,
            marginBottom: 10,
          }}
        >
          Account Security
        </Text>

        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: "hidden",
          }}
        >
          {/* Email */}
          <SectionRow
            icon={<Mail size={15} color={colors.teal} />}
            label="Email"
            value={currentEmployee.email || "Not set"}
            isEditing={editingSection === "email"}
            onEdit={() => setEditingSection("email")}
          >
            <Controller
              control={emailForm.control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={inputStyle}
                  value={value}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholderTextColor={colors.muted}
                  placeholder="Enter email"
                />
              )}
            />
            {emailForm.formState.errors.email && (
              <Text style={{ color: colors.danger, fontSize: 11, marginTop: 4 }}>
                {emailForm.formState.errors.email.message}
              </Text>
            )}
            <FormActions
              onCancel={() => setEditingSection(null)}
              onSave={emailForm.handleSubmit((data) => handleSave("email", data))}
            />
          </SectionRow>

          {/* Phone */}
          <SectionRow
            icon={<Phone size={15} color={colors.teal} />}
            label="Phone Number"
            value={currentEmployee.phone || "Not set"}
            isEditing={editingSection === "phone"}
            onEdit={() => setEditingSection("phone")}
          >
            <Controller
              control={phoneForm.control}
              name="phone"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={inputStyle}
                  value={value}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  keyboardType="phone-pad"
                  placeholderTextColor={colors.muted}
                  placeholder="Enter phone number"
                />
              )}
            />
            {phoneForm.formState.errors.phone && (
              <Text style={{ color: colors.danger, fontSize: 11, marginTop: 4 }}>
                {phoneForm.formState.errors.phone.message}
              </Text>
            )}
            <FormActions
              onCancel={() => setEditingSection(null)}
              onSave={phoneForm.handleSubmit((data) => handleSave("phone", data))}
            />
          </SectionRow>

          {/* PIN */}
          <SectionRow
            icon={<Shield size={15} color={colors.teal} />}
            label="PIN"
            value="••••"
            isEditing={editingSection === "pin"}
            onEdit={() => setEditingSection("pin")}
            last
          >
            <View style={{ gap: 10 }}>
              <View>
                <FieldLabel label="New PIN" />
                <Controller
                  control={pinForm.control}
                  name="pin"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      style={inputStyle}
                      value={value}
                      onBlur={onBlur}
                      onChangeText={onChange}
                      keyboardType="number-pad"
                      secureTextEntry
                      maxLength={4}
                      placeholderTextColor={colors.muted}
                      placeholder="4-digit PIN"
                    />
                  )}
                />
                {pinForm.formState.errors.pin && (
                  <Text style={{ color: colors.danger, fontSize: 11, marginTop: 4 }}>
                    {pinForm.formState.errors.pin.message}
                  </Text>
                )}
              </View>
              <View>
                <FieldLabel label="Confirm PIN" />
                <Controller
                  control={pinForm.control}
                  name="confirmPin"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      style={inputStyle}
                      value={value}
                      onBlur={onBlur}
                      onChangeText={onChange}
                      keyboardType="number-pad"
                      secureTextEntry
                      maxLength={4}
                      placeholderTextColor={colors.muted}
                      placeholder="Repeat PIN"
                    />
                  )}
                />
                {pinForm.formState.errors.confirmPin && (
                  <Text style={{ color: colors.danger, fontSize: 11, marginTop: 4 }}>
                    {pinForm.formState.errors.confirmPin.message}
                  </Text>
                )}
              </View>
            </View>
            <FormActions
              onCancel={() => setEditingSection(null)}
              onSave={pinForm.handleSubmit((data) => handleSave("pin", { pin: data.pin }))}
              saveLabel="Save PIN"
            />
          </SectionRow>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default SecurityTab;
