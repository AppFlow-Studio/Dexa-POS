// src/types/cfd.types.ts
// Used by BOTH POS app and CFD app

export type CFDScreenState =
  | 'pairing'      // CFD waiting to connect
  | 'idle'         // Connected, showing branding
  | 'ordering'     // Showing live cart
  | 'tip_selection' // Customer selecting tip
  | 'payment'      // "Present Card"
  | 'processing'   // Processing payment
  | 'approved'     // Success
  | 'declined'     // Failed

export interface CFDCartItem {
  id: string
  name: string
  quantity: number
  unitPrice: number        // cents
  lineTotal: number        // cents (after modifiers)
  modifiers: Array<{
    name: string
    price: number          // cents
  }>
  notes?: string
}

export interface CFDBranding {
  restaurantName: string
  locationCode: string | null
  logoUrl: string | null
  primaryColor: string
}

export interface CFDPayload {
  // Identification
  stationId: string
  stationName: string
  locationId: string

  // Current screen
  screenState: CFDScreenState

  // Order data
  orderNumber: string | null       // e.g., "#0042"
  orderType: string | null         // "Dine In", "Takeaway", etc.
  guestCount: number | null
  items: CFDCartItem[]
  
  // Totals (all in cents)
  subtotal: number
  discountAmount: number
  taxAmount: number
  tipAmount: number
  total: number
  
  // Outstanding amounts (for partial payments)
  outstandingTotal: number
  amountPaid: number

  // Branding (sent on connect, cached on CFD)
  branding?: CFDBranding

  // Tip selection config
  tipConfig?: {
    subtotalForTip: number         // Base amount for tip calculation
    presetPercentages: number[]    // e.g., [15, 18, 20, 25]
    allowCustom: boolean
  }

  // Timestamp
  timestamp: number
}

export interface CFDTipResponse {
  stationId: string
  tipAmount: number                // cents
  tipPercentage: number | null     // null if custom amount
  timestamp: number
}

export interface CFDMessage {
  type: 'state_update' | 'ping' | 'pong' | 'tip_selected'
  payload?: CFDPayload | CFDTipResponse
  timestamp: number
}

// QR Code pairing data
export interface CFDPairingData {
  ip: string
  port: number
  stationId: string
  stationName: string
  locationId: string
  locationName: string
}