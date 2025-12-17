// lib/payments/dvpaylite.ts
import { Linking } from "react-native";

// TODO: Backend integration - pass supabase client and call supabase.rpc("process_payment", params)
interface DVPayLiteRequest {
  type: "SALE" | "RETURN" | "VOID";
  applicationType: "DVPAYLITE";
  amount: string; // In cents
  tipAmount?: string; // In cents
  refId: string;
  invoiceNumber: string;
}

interface DVPayLiteResponse {
  transactionResult: "Success" | "Failure";
  transactionId?: string;
  authCode?: string;
  cardType?: string;
  lastFour?: string;
  errorMessage?: string;
}

export class DVPayLiteClient {
  async processSale(
    amount: number,
    tipAmount: number,
    orderId: string,
    orderNumber: string
  ): Promise<DVPayLiteResponse> {
    // Build request
    const request: DVPayLiteRequest = {
      type: "SALE",
      applicationType: "DVPAYLITE",
      amount: Math.round(amount * 100).toString(), // Convert to cents
      tipAmount: Math.round(tipAmount * 100).toString(),
      refId: orderId,
      invoiceNumber: orderNumber,
    };

    // Encode and build deep link
    const encodedRequest = encodeURIComponent(JSON.stringify(request));
    const deepLinkUrl = `pay://pay?data=${encodedRequest}`;

    // Launch DVPaylite
    const canOpen = await Linking.canOpenURL(deepLinkUrl);
    if (!canOpen) {
      throw new Error("DVPaylite app not installed");
    }

    await Linking.openURL(deepLinkUrl);

    // Return promise that resolves when DVPaylite returns
    return new Promise((resolve, reject) => {
      // Set up listener for DVPaylite callback
      const subscription = Linking.addEventListener("url", (event) => {
        const response = this.parseCallbackUrl(event.url);
        subscription.remove();

        if (response.transactionResult === "Success") {
          resolve(response);
        } else {
          reject(new Error(response.errorMessage || "Payment failed"));
        }
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        subscription.remove();
        reject(new Error("Payment timeout"));
      }, 300000);
    });
  }

  private parseCallbackUrl(url: string): DVPayLiteResponse {
    // Parse callback URL from DVPaylite
    // Format: myapp://payment-result?data=<encoded_json>
    const params = new URLSearchParams(url.split("?")[1]);
    const data = params.get("data");

    if (!data) {
      throw new Error("Invalid callback from DVPaylite");
    }

    const decoded = JSON.parse(decodeURIComponent(data));
    return decoded;
  }
}

// Usage
export const processCardPaymentDVPayLite = async (
  orderId: string,
  amount: number,
  tipAmount: number,
  orderNumber: string
) => {
  const dvPayLite = new DVPayLiteClient();

  // Step 1: Process with DVPaylite
  const response = await dvPayLite.processSale(
    amount,
    tipAmount,
    orderId,
    orderNumber
  );

  // Step 2: Record in database
  // TODO: Integrate with backend - pass supabase client from component
  // const paymentResult = await supabase.rpc("process_payment", {
  //   p_order_id: orderId,
  //   p_payment_method: 'card_dvpaylite',
  //   p_amount: amount,
  //   p_tip_amount: tipAmount,
  //   p_terminal_type: 'dejavoo_p18',
  //   p_transaction_details: {
  //     transaction_id: response.transactionId,
  //     authorization_code: response.authCode,
  //     card_type: response.cardType,
  //     card_last_four: response.lastFour,
  //     dvpaylite_request_id: orderId
  //   }
  // });

  return response; // Return terminal response for now
};
