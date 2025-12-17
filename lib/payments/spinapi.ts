import { OrdersAPI } from "../supabase-orders";

// lib/payments/spinapi.ts
interface SPINAPIRequest {
    transactionType: 'SALE' | 'RETURN' | 'VOID' | 'ADJUST';
    amount: number;
    tipAmount?: number;
    invoiceNumber: string;
    taxAmount?: number;
  }
  
  interface SPINAPIResponse {
    status: 'APPROVED' | 'DECLINED' | 'ERROR';
    transactionId: string;
    authCode: string;
    responseCode: string;
    responseMessage: string;
    cardType: string;
    lastFour: string;
    batchNumber: string;
    invoiceNumber: string;
  }
  
  export class SPINAPIClient {
    private terminalIP: string;
    private terminalPort: number;
  
    constructor(terminalIP: string, terminalPort: number = 8080) {
      this.terminalIP = terminalIP;
      this.terminalPort = terminalPort;
    }
  
    async processSale(request: SPINAPIRequest): Promise<SPINAPIResponse> {
      try {
        // Send HTTP request to Dejavoo terminal
        const response = await fetch(
          `http://${this.terminalIP}:${this.terminalPort}/transaction`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request)
          }
        );
  
        if (!response.ok) {
          throw new Error('Terminal communication failed');
        }
  
        const data = await response.json();
        return this.parseResponse(data);
      } catch (error) {
        console.error('SPINAPI Error:', error);
        throw new Error('Failed to process payment with terminal');
      }
    }
  
    private parseResponse(data: any): SPINAPIResponse {
      return {
        status: data.ResponseCode === '00' ? 'APPROVED' : 'DECLINED',
        transactionId: data.TransactionId,
        authCode: data.AuthCode,
        responseCode: data.ResponseCode,
        responseMessage: data.ResponseMessage,
        cardType: data.CardType,
        lastFour: data.LastFour,
        batchNumber: data.BatchNumber,
        invoiceNumber: data.InvoiceNumber
      };
    }
  }
  
  // Usage
  export const processCardPaymentSPINAPI = async (
    orderId: string,
    amount: number,
    tipAmount: number,
    orderNumber: string
  ) => {
    const spinApi = new SPINAPIClient('192.168.1.100'); // Terminal IP
  
    // Step 1: Process on terminal
    const terminalResponse = await spinApi.processSale({
      transactionType: 'SALE',
      amount: amount,
      tipAmount: tipAmount,
      invoiceNumber: orderNumber
    });
  
    if (terminalResponse.status !== 'APPROVED') {
      throw new Error(`Payment declined: ${terminalResponse.responseMessage}`);
    }
  
    // Step 2: Record in database
    const paymentResult = await OrdersAPI.processPayment({
      p_order_id: orderId,
      p_payment_method: 'card_spinapi',
      p_amount: amount,
      p_tip_amount: tipAmount,
      p_terminal_type: 'dejavoo_spinapi',
      p_terminal_id: 'TERM_001',
      p_transaction_details: {
        transaction_id: terminalResponse.transactionId,
        authorization_code: terminalResponse.authCode,
        card_type: terminalResponse.cardType,
        card_last_four: terminalResponse.lastFour,
        dejavoo_response_code: terminalResponse.responseCode,
        dejavoo_batch_number: terminalResponse.batchNumber
      }
    });
  
    return paymentResult;
  };