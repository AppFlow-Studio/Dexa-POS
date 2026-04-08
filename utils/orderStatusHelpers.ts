export function formatOrderStatus(status: string): string {
  const map: Record<string, string> = {
    draft: "Draft",
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
