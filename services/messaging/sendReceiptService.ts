import type { SupabaseClient } from "@supabase/supabase-js";

export type SendReceiptDeliveryMethod = "email" | "sms";

export interface SendReceiptParams {
  client: SupabaseClient;
  dbOrderId: string;
  deliveryMethod: SendReceiptDeliveryMethod;
  recipient: string;
  receiptTemplateId?: string;
}

export interface SendReceiptResult {
  success: boolean;
  message: string;
}

export async function sendReceipt(
  params: SendReceiptParams
): Promise<SendReceiptResult> {
  const recipient = params.recipient.trim();
  if (!params.dbOrderId) {
    return { success: false, message: "Order has not been synced yet" };
  }
  if (!recipient) {
    return {
      success: false,
      message:
        params.deliveryMethod === "email"
          ? "Please enter an email address"
          : "Please enter a phone number",
    };
  }

  try {
    const { data, error } = await params.client.functions.invoke(
      "send-receipt",
      {
        body: {
          order_id: params.dbOrderId,
          delivery_method: params.deliveryMethod,
          recipient,
          receipt_template_id: params.receiptTemplateId,
        },
      }
    );

    if (error) {
      return {
        success: false,
        message: error.message ?? "Failed to send receipt",
      };
    }

    if (data && typeof data === "object" && "success" in data) {
      return data as SendReceiptResult;
    }

    return { success: false, message: "Unexpected response from server" };
  } catch (err: unknown) {
    const message =
      (err as { message?: string })?.message ?? "Failed to send receipt";
    return { success: false, message };
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

export function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10;
}
