import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { colors } from "@/lib/theme";
import { zodResolver } from "@hookform/resolvers/zod";
import React, { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  KeyboardAvoidingView, // <--- Imported
  Platform, // <--- Imported
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { z } from "zod";

// Zod schemas for validation
const emailSchema = z.object({
  email: z.string().email("Please enter a valid email address."),
});

const phoneRegex = /^[0-9\s\-()]*$/;

const phoneSchema = z.object({
  phone: z
    .string()
    .regex(
      phoneRegex,
      "Phone number can only contain digits, spaces, and hyphens."
    )
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
  backgroundColor: colors.panel,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: 10,
  padding: 12,
  fontSize: 14,
  color: colors.heading,
};

const SectionRow = ({
  label,
  value,
  isEditing,
  children,
  onEdit,
}: {
  label: string;
  value: string;
  isEditing: boolean;
  children: React.ReactNode;
  onEdit: () => void;
}) => (
  <View className="py-4 border-b border-border">
    <View className="flex-row items-center justify-between">
      <View>
        <Text className="text-xs uppercase tracking-wider text-label mb-1">{label}</Text>
        {!isEditing && (
          <Text className="text-sm font-semibold text-heading">{value}</Text>
        )}
      </View>
      {!isEditing && (
        <TouchableOpacity
          onPress={onEdit}
          className="py-1.5 px-3 rounded-lg border border-border"
        >
          <Text className="text-xs font-semibold text-label">Change</Text>
        </TouchableOpacity>
      )}
    </View>
    {isEditing && <View className="mt-3">{children}</View>}
  </View>
);

const SecurityTab = () => {
  const { employees, activeEmployeeId, updateSecurity } = useEmployeeStore();
  const [editingSection, setEditingSection] = useState<
    "email" | "phone" | "pin" | null
  >(null);

  const currentEmployee = employees.find((e) => e.id === activeEmployeeId);

  const emailForm = useForm<EmailFormData>({
    resolver: zodResolver(emailSchema),
  });

  const phoneForm = useForm<PhoneFormData>({
    resolver: zodResolver(phoneSchema),
  });

  const pinForm = useForm<PinFormData>({
    resolver: zodResolver(pinSchema),
  });

  useEffect(() => {
    if (currentEmployee) {
      emailForm.reset({ email: currentEmployee.email || "" });
      phoneForm.reset({ phone: currentEmployee.phone || "" });
      pinForm.reset({ pin: "", confirmPin: "" });
    }
  }, [currentEmployee, emailForm, phoneForm, pinForm]);

  const handleSave = (section: "email" | "phone" | "pin", data: any) => {
    if (currentEmployee) {
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
    }
  };

  if (!currentEmployee) {
    return <Text className="text-white">No employee selected.</Text>;
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <SectionRow
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
            />
          )}
        />
        {emailForm.formState.errors.email && (
          <Text className="text-red-500 text-sm mt-1">
            {emailForm.formState.errors.email.message}
          </Text>
        )}
        <View className="flex-row justify-end gap-3 mt-4">
          <TouchableOpacity
            onPress={() => setEditingSection(null)}
            className="py-1 px-4 border border-border rounded-lg"
          >
            <Text className="font-semibold text-xs text-label">Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={emailForm.handleSubmit((data) =>
              handleSave("email", data)
            )}
            style={{ paddingVertical: 4, paddingHorizontal: 14, borderRadius: 8, backgroundColor: colors.teal + '20', borderWidth: 1, borderColor: colors.teal + '50' }}
          >
            <Text style={{ fontWeight: '600', fontSize: 12, color: colors.teal }}>Save</Text>
          </TouchableOpacity>
        </View>
      </SectionRow>

      <SectionRow
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
            />
          )}
        />
        {phoneForm.formState.errors.phone && (
          <Text className="text-red-500 text-sm mt-1">
            {phoneForm.formState.errors.phone.message}
          </Text>
        )}
        <View className="flex-row justify-end gap-3 mt-4">
          <TouchableOpacity
            onPress={() => setEditingSection(null)}
            className="py-1 px-4 border border-border rounded-lg"
          >
            <Text className="font-semibold text-xs text-label">Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={phoneForm.handleSubmit((data) =>
              handleSave("phone", data)
            )}
            style={{ paddingVertical: 4, paddingHorizontal: 14, borderRadius: 8, backgroundColor: colors.teal + '20', borderWidth: 1, borderColor: colors.teal + '50' }}
          >
            <Text style={{ fontWeight: '600', fontSize: 12, color: colors.teal }}>Save</Text>
          </TouchableOpacity>
        </View>
      </SectionRow>

      <SectionRow
        label="PIN"
        value="****"
        isEditing={editingSection === "pin"}
        onEdit={() => setEditingSection("pin")}
      >
        <View className="gap-y-4">
          <View>
            <Text className="text-xs text-label uppercase tracking-wider mb-1">New PIN</Text>
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
                />
              )}
            />
            {pinForm.formState.errors.pin && (
              <Text className="text-red-500 text-sm mt-1">
                {pinForm.formState.errors.pin.message}
              </Text>
            )}
          </View>
          <View>
            <Text className="text-xs text-label uppercase tracking-wider mb-1">
              Confirm PIN
            </Text>
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
                />
              )}
            />
            {pinForm.formState.errors.confirmPin && (
              <Text className="text-red-500 text-sm mt-1">
                {pinForm.formState.errors.confirmPin.message}
              </Text>
            )}
          </View>
        </View>
        <View className="flex-row justify-end gap-3 mt-4">
          <TouchableOpacity
            onPress={() => setEditingSection(null)}
            className="py-1 px-4 border border-border rounded-lg"
          >
            <Text className="font-semibold text-xs text-label">Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={pinForm.handleSubmit((data) =>
              handleSave("pin", { pin: data.pin })
            )}
            style={{ paddingVertical: 4, paddingHorizontal: 14, borderRadius: 8, backgroundColor: colors.teal + '20', borderWidth: 1, borderColor: colors.teal + '50' }}
          >
            <Text style={{ fontWeight: '600', fontSize: 12, color: colors.teal }}>Save PIN</Text>
          </TouchableOpacity>
        </View>
      </SectionRow>
    </KeyboardAvoidingView>
  );
};

export default SecurityTab;
