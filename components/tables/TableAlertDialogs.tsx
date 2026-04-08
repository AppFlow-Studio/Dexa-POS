import {
  AlertDialog,
  AlertDialogContent,
} from "@/components/ui/alert-dialog";
import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import { colors } from "@/lib/theme";
import { AlertTriangle } from "lucide-react-native";
import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

interface NotReadyItem {
  id: string;
  name: string;
  quantity: number;
}

interface TableAlertDialogsProps {
  // Items-not-ready (payment)
  isNotReadyConfirmOpen: boolean;
  onNotReadyConfirmChange: (open: boolean) => void;
  onPayAnyway: () => void;

  // Items-not-ready (clear table)
  isClearNotReadyConfirmOpen: boolean;
  onClearNotReadyConfirmChange: (open: boolean) => void;
  onClearAnyway: () => void;

  // Shared item list for both not-ready dialogs
  notReadyItems: NotReadyItem[];

  // Void confirm
  isVoidConfirmOpen: boolean;
  onVoidConfirmChange: (open: boolean) => void;
  onConfirmVoid: () => void;

  // Order closed warning
  isOrderClosedWarningOpen: boolean;
  onOrderClosedWarningChange: (open: boolean) => void;

  // Course resend
  courseToResend: number | null;
  onCourseResendChange: (course: number | null) => void;
  onConfirmResend: () => void;

  // Reopen check
  isReopenModalOpen: boolean;
  onReopenModalClose: () => void;
  onConfirmReopen: () => void;
}

const TableAlertDialogs: React.FC<TableAlertDialogsProps> = ({
  isNotReadyConfirmOpen,
  onNotReadyConfirmChange,
  onPayAnyway,
  isClearNotReadyConfirmOpen,
  onClearNotReadyConfirmChange,
  onClearAnyway,
  notReadyItems,
  isVoidConfirmOpen,
  onVoidConfirmChange,
  onConfirmVoid,
  isOrderClosedWarningOpen,
  onOrderClosedWarningChange,
  courseToResend,
  onCourseResendChange,
  onConfirmResend,
  isReopenModalOpen,
  onReopenModalClose,
  onConfirmReopen,
}) => {
  return (
    <>
      {/* Pay - Items Not Ready Alert */}
      <AlertDialog
        open={isNotReadyConfirmOpen}
        onOpenChange={onNotReadyConfirmChange}
      >
        <AlertDialogContent className="w-[450px] p-5 rounded-2xl bg-panel border border-border">
          <View className="items-center mb-4">
            <View className="w-16 h-16 rounded-full bg-amber-500/20 items-center justify-center">
              <AlertTriangle size={32} color={colors.warning} />
            </View>
          </View>
          <Text className="text-xl font-bold text-white text-center mb-2">
            Items Still Preparing
          </Text>
          <Text className="text-sm text-gray-400 text-center mb-3">
            {notReadyItems.length} item{notReadyItems.length !== 1 ? "s" : ""}{" "}
            not ready yet:
          </Text>
          <ScrollView
            className="max-h-32 mb-4 bg-panel rounded-xl p-3"
            showsVerticalScrollIndicator={false}
          >
            {notReadyItems.map((item) => (
              <View key={item.id} className="flex-row items-center py-1">
                <Text className="text-amber-400 mr-2">•</Text>
                <Text className="text-gray-300 text-sm">
                  {item.quantity}x {item.name}
                </Text>
              </View>
            ))}
          </ScrollView>
          <Text className="text-sm text-gray-400 text-center mb-4">
            Proceed to payment anyway?
          </Text>
          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={() => onNotReadyConfirmChange(false)}
              className="flex-1 py-3 rounded-xl items-center"
            >
              <Text className="font-semibold text-gray-400 text-base">
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onPayAnyway}
              className="flex-1 py-3 bg-amber-600 rounded-xl items-center"
            >
              <Text className="font-semibold text-white text-base">
                Pay Anyway
              </Text>
            </TouchableOpacity>
          </View>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear Table - Items Not Ready Alert */}
      <AlertDialog
        open={isClearNotReadyConfirmOpen}
        onOpenChange={onClearNotReadyConfirmChange}
      >
        <AlertDialogContent className="w-[450px] p-5 rounded-2xl bg-panel border border-border">
          <View className="items-center mb-4">
            <View className="w-16 h-16 rounded-full bg-amber-500/20 items-center justify-center">
              <AlertTriangle size={32} color={colors.warning} />
            </View>
          </View>
          <Text className="text-xl font-bold text-white text-center mb-2">
            Items Still Preparing
          </Text>
          <Text className="text-sm text-gray-400 text-center mb-3">
            {notReadyItems.length} item{notReadyItems.length !== 1 ? "s" : ""}{" "}
            not ready yet:
          </Text>
          <ScrollView
            className="max-h-32 mb-4 bg-panel rounded-xl p-3"
            showsVerticalScrollIndicator={false}
          >
            {notReadyItems.map((item) => (
              <View key={item.id} className="flex-row items-center py-1">
                <Text className="text-amber-400 mr-2">•</Text>
                <Text className="text-gray-300 text-sm">
                  {item.quantity}x {item.name}
                </Text>
              </View>
            ))}
          </ScrollView>
          <Text className="text-sm text-gray-400 text-center mb-4">
            Proceed to clear table anyway?
          </Text>
          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={() => onClearNotReadyConfirmChange(false)}
              className="flex-1 py-3 rounded-xl items-center"
            >
              <Text className="font-semibold text-gray-400 text-base">
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onClearAnyway}
              className="flex-1 py-3 bg-amber-600 rounded-xl items-center"
            >
              <Text className="font-semibold text-white text-base">
                Clear Anyway
              </Text>
            </TouchableOpacity>
          </View>
        </AlertDialogContent>
      </AlertDialog>

      {/* Void Confirm */}
      <AlertDialog open={isVoidConfirmOpen} onOpenChange={onVoidConfirmChange}>
        <AlertDialogContent className="w-[450px] p-4 rounded-2xl bg-surface">
          <Text className="text-lg font-bold text-white mb-2">
            Void check?
          </Text>
          <Text className="text-sm text-gray-400 mb-4">
            No payment has been made. Do you want to void this check?
          </Text>
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={() => onVoidConfirmChange(false)}
              className="flex-1 py-2 border border-gray-600 rounded-lg items-center bg-panel"
            >
              <Text className="font-semibold text-white text-base">
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onConfirmVoid}
              className="flex-1 py-2 bg-red-500 rounded-lg items-center"
            >
              <Text className="font-semibold text-white text-base">
                Void Check
              </Text>
            </TouchableOpacity>
          </View>
        </AlertDialogContent>
      </AlertDialog>

      {/* Order Closed Warning */}
      <AlertDialog
        open={isOrderClosedWarningOpen}
        onOpenChange={onOrderClosedWarningChange}
      >
        <AlertDialogContent className="w-[450px] p-4 rounded-2xl bg-surface">
          <Text className="text-lg font-bold text-white mb-2">
            Order is Closed
          </Text>
          <Text className="text-sm text-gray-400 mb-4">
            This order is currently closed. Please reopen the check to add
            items.
          </Text>
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={() => onOrderClosedWarningChange(false)}
              className="flex-1 py-2 bg-blue-500 rounded-lg items-center"
            >
              <Text className="font-semibold text-white text-base">OK</Text>
            </TouchableOpacity>
          </View>
        </AlertDialogContent>
      </AlertDialog>

      {/* Course Resend Confirm */}
      <AlertDialog
        open={courseToResend !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) onCourseResendChange(null);
        }}
      >
        <AlertDialogContent className="w-[450px] p-4 rounded-2xl bg-surface">
          <Text className="text-lg font-bold text-white mb-2">
            Resend Course {courseToResend}?
          </Text>
          <Text className="text-sm text-gray-400 mb-4">
            Are you sure you want to send Course {courseToResend} to the kitchen
            again?
          </Text>
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={() => onCourseResendChange(null)}
              className="flex-1 py-2 border border-gray-600 rounded-lg items-center bg-panel"
            >
              <Text className="font-semibold text-white text-base">
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onConfirmResend}
              className="flex-1 py-2 bg-blue-500 rounded-lg items-center"
            >
              <Text className="font-semibold text-white text-base">
                Resend
              </Text>
            </TouchableOpacity>
          </View>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reopen Check Confirmation Modal */}
      <ConfirmationModal
        isOpen={isReopenModalOpen}
        onClose={onReopenModalClose}
        onConfirm={onConfirmReopen}
        title="Reopen Check?"
        description="Are you sure you want to reopen this closed check? This will allow adding new items."
        confirmText="Reopen"
        variant="default"
      />
    </>
  );
};

export default TableAlertDialogs;
