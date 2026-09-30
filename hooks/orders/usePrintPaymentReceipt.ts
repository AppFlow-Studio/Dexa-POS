import { useToast } from "@/contexts/ToastContext";
import { PrinterService } from "@/services/printing/PrinterService";
import { useNoPrinterModalStore } from "@/stores/useNoPrinterModalStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useCallback, useState } from "react";

/**
 * Prints the receipt for ONE payment on the active order — a single split
 * portion / partial payment, scoped via printSplitPaymentReceipt. Order and
 * store are read at call time so the just-appended payment is always present.
 * Resolves true when the receipt was sent to the printer.
 */
export function usePrintPaymentReceipt() {
  const { show } = useToast();
  const [printingPaymentId, setPrintingPaymentId] = useState<string | null>(
    null,
  );

  const printPayment = useCallback(
    async (paymentId: string | null | undefined): Promise<boolean> => {
      const { activeOrderId, ordersById } = useOrderStore.getState();
      const order = activeOrderId ? ordersById[activeOrderId] : undefined;
      const payment = order?.payments?.find((p) => p.id === paymentId);
      const selectedStore = useStoreSettingsStore.getState().selectedStore;
      if (!order || !payment || !selectedStore) {
        show({
          title: "Print Error",
          message: "Payment not found for this order.",
          type: "error",
        });
        return false;
      }
      setPrintingPaymentId(payment.id);
      try {
        const sent = await PrinterService.printSplitPaymentReceipt(
          order,
          payment,
          selectedStore,
        );
        if (sent) {
          show({
            title: "Printing Receipt",
            message: "Sent to printer.",
            type: "success",
          });
        } else {
          useNoPrinterModalStore.getState().show("receipt");
        }
        return sent;
      } catch (e) {
        console.warn("[usePrintPaymentReceipt] Print failed:", e);
        show({
          title: "Print Error",
          message: "Failed to send to printer.",
          type: "error",
        });
        return false;
      } finally {
        setPrintingPaymentId(null);
      }
    },
    [show],
  );

  return { printPayment, printingPaymentId, isPrinting: !!printingPaymentId };
}
