import { useEmployeeStore } from "@/stores/useEmployeeStore";
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
  <View className="py-4 border-b border-gray-700">
    <View className="flex-row items-start justify-between">
      <View>
        <Text className="text-base text-gray-300 mb-1">{label}</Text>
        {!isEditing && (
          <Text className="text-xl font-semibold text-white">{value}</Text>
        )}
      </View>
      {!isEditing && (
        <TouchableOpacity
          onPress={onEdit}
          className="py-2 px-4 border border-gray-600 rounded-lg bg-surface"
        >
          <Text className="font-bold text-base text-gray-300">Change</Text>
        </TouchableOpacity>
      )}
    </View>
    {isEditing && <View className="mt-2">{children}</View>}
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
              className="text-xl font-semibold text-white bg-panel p-3 rounded-md border border-gray-600 w-full"
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
            className="py-2 px-6 border border-gray-600 rounded-lg bg-surface"
          >
            <Text className="font-bold text-base text-gray-300">Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={emailForm.handleSubmit((data) =>
              handleSave("email", data)
            )}
            className="py-2 px-8 bg-blue-600 rounded-lg"
          >
            <Text className="font-bold text-base text-white">Save</Text>
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
              className="text-xl font-semibold text-white bg-panel p-3 rounded-md border border-gray-600 w-full"
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
            className="py-2 px-6 border border-gray-600 rounded-lg bg-surface"
          >
            <Text className="font-bold text-base text-gray-300">Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={phoneForm.handleSubmit((data) =>
              handleSave("phone", data)
            )}
            className="py-2 px-8 bg-blue-600 rounded-lg"
          >
            <Text className="font-bold text-base text-white">Save</Text>
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
            <Text className="text-base text-gray-300 mb-1">New PIN</Text>
            <Controller
              control={pinForm.control}
              name="pin"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  className="text-xl font-semibold text-white bg-panel p-3 rounded-md border border-gray-600 w-full"
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
            <Text className="text-base text-gray-300 mb-1">
              Confirm New PIN
            </Text>
            <Controller
              control={pinForm.control}
              name="confirmPin"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  className="text-xl font-semibold text-white bg-panel p-3 rounded-md border border-gray-600 w-full"
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
            className="py-2 px-6 border border-gray-600 rounded-lg bg-surface"
          >
            <Text className="font-bold text-base text-gray-300">Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={pinForm.handleSubmit((data) =>
              handleSave("pin", { pin: data.pin })
            )}
            className="py-2 px-8 bg-blue-600 rounded-lg"
          >
            <Text className="font-bold text-base text-white">Save PIN</Text>
          </TouchableOpacity>
        </View>
      </SectionRow>
    </KeyboardAvoidingView>
  );
};

export default SecurityTab;
