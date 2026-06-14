export function formatOrderStatus(status: string): string {
  const map: Record<string, string> = {
    draft: "Open",
    pending: "Pending",
    sent_to_kitchen: "Sent to Kitchen",
    preparing: "Preparing",
    ready: "Ready",
    completed: "Completed",
    cancelled: "Cancelled",
    refunded: "Refunded",
    void: "Void",
  };
  return map[status] || status;
}

export function formatPaymentStatus(status?: string | null): string {
  const normalized = status ?? "Pending";

  const map: Record<string, string> = {
    Pending: "Awaiting Payment",
    Unpaid: "Awaiting Payment",
    pending: "Awaiting Payment",
    unpaid: "Awaiting Payment",
    "Payment Pending": "Awaiting Payment",
    Paid: "Paid",
    Partial: "Partial",
    Refunded: "Refunded",
    "Partially Refunded": "Partially Refunded",
    Voided: "Voided",
    Authorized: "Authorized",
    Processing: "Processing",
  };

  return map[normalized] || normalized;
}
