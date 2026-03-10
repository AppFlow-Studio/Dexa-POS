import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";
import { useToast } from "@/contexts/ToastContext";
import { orderHistoryKeys } from "./useOrderHistory";
import * as Haptics from "expo-haptics";

export function useCloseCheck() {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async (dbOrderId: string) => {
      const { loggedInEmployee } = useEmployeeStore.getState();
      const { data, error } = await supabase.rpc("close_check", {
        p_order_id: dbOrderId,
        p_staff_id: loggedInEmployee?.profileId ?? null,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (!result.success) throw new Error(result.error || "Failed to close check");
      return result;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show({
        title: "Check Closed",
        message: "Check has been closed successfully",
        type: "success",
      });
      queryClient.invalidateQueries({ queryKey: orderHistoryKeys.all });
    },
    onError: (error: Error) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show({
        title: "Error",
        message: error.message || "Failed to close check",
        type: "error",
      });
    },
  });
}

export function useReopenCheck() {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async ({
      dbOrderId,
      reason,
    }: {
      dbOrderId: string;
      reason?: string;
    }) => {
      const { activeEmployeeId } = useEmployeeStore.getState();
      const { data, error } = await supabase.rpc("reopen_check", {
        p_order_id: dbOrderId,
        p_staff_id: activeEmployeeId,
        p_reason: reason || null,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (!result.success) throw new Error(result.error || "Failed to reopen check");
      return result;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show({
        title: "Check Reopened",
        message: "Check has been reopened",
        type: "success",
      });
      queryClient.invalidateQueries({ queryKey: orderHistoryKeys.all });
    },
    onError: (error: Error) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show({
        title: "Error",
        message: error.message || "Failed to reopen check",
        type: "error",
      });
    },
  });
}

export function useVoidOrder() {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async ({
      dbOrderId,
      reason,
    }: {
      dbOrderId: string;
      reason?: string;
    }) => {
      const { data, error } = await supabase.rpc("void_order", {
        p_order_id: dbOrderId,
        p_void_reason: reason || "Order cancelled",
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show({
        title: "Order Voided",
        message: "Order has been voided successfully",
        type: "success",
      });
      queryClient.invalidateQueries({ queryKey: orderHistoryKeys.all });
    },
    onError: (error: Error) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show({
        title: "Error",
        message: error.message || "Failed to void order",
        type: "error",
      });
    },
  });
}
