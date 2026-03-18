// src/types/cfd.types.ts
// Used by BOTH POS app and CFD app

export type CFDScreenState =
  | "pairing" // CFD waiting to connect
  | "idle" // Connected, showing branding
  | "ordering" // Showing live cart
  | "tip_selection" // Customer selecting tip
  | "payment" // "Present Card"
  | "processing" // Processing payment
  | "approved" // Success
  | "declined"; // Failed

export interface CFDCartItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number; // Base unit price (cents)

  // Dual Pricing
  cashPrice: number;
  cardPrice: number;

  lineTotal: number; // Defaults to card total
  lineTotalCash: number;
  lineTotalCard: number;

  modifiers: Array<{
    name: string;
    price: number; // usually card price
    priceCash: number;
    priceCard: number;
  }>;
  notes?: string;
}

export interface CFDBranding {
  restaurantName: string;
  locationCode: string | null;
  logoUrl: string | null;
  primaryColor: string;
}

export interface CFDPayload {
  // Identification
  stationId: string;
  stationName: string;
  locationId: string;
  serverName?: string | null; // e.g., "Michael J."

  // Current screen
  screenState: CFDScreenState;

  // Order data
  orderNumber: string | null; // e.g., "#0042"
  orderType: string | null; // "Dine In", "Takeaway", etc.
  guestCount: number | null;
  items: CFDCartItem[];

  // Totals (all in cents)
  subtotal: number; // Default/Card subtotal
  subtotalCash: number;
  subtotalCard: number;

  discountAmount: number;

  taxAmount: number; // Default/Card tax
  taxCash: number;
  taxCard: number;

  tipAmount: number;
  tipPercentage: number | null; // Current selected percentage (if any)

  total: number; // Default/Card total
  totalCash: number;
  totalCard: number;

  savingsAmount: number; // Amount saved by paying cash

  // Outstanding amounts (for partial payments)
  outstandingTotal: number;
  amountPaid: number;

  // Branding (sent on connect, cached on CFD)
  branding?: CFDBranding;

  // Tip selection config
  tipConfig?: {
    subtotalForTip: number; // Base amount for tip calculation
    presetPercentages: number[]; // e.g., [15, 18, 20, 25]
    allowCustom: boolean;
  };

  carouselImages?: string[];

  // Timestamp
  timestamp: number;
}

export interface CFDTipResponse {
  stationId: string;
  tipAmount: number; // cents
  tipPercentage: number | null; // null if custom amount
  timestamp: number;
}

export interface CFDMessage {
  type: "state_update" | "ping" | "pong" | "tip_selected";
  payload?: CFDPayload | CFDTipResponse;
  timestamp: number;
}

// QR Code pairing data
export interface CFDPairingData {
  ip: string;
  port: number;
  stationId: string;
  stationName: string;
  locationId: string;
  locationName: string;
}
