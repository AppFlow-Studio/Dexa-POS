// src/types/cfd.types.ts
// Used by BOTH POS app and CFD app

export type CFDScreenState =
  | 'pairing' // CFD waiting to connect
  | 'idle' // Connected, showing branding
  | 'ordering' // Showing live cart
  | 'tip_selection' // Customer selecting tip
  | 'payment' // "Present Card"
  | 'processing' // Processing payment
  | 'approved' // Success
  | 'declined' // Failed
  | 'loyalty_prompt' // Phone number entry
  | 'loyalty_confirmation' // Points earned success

export interface CFDCartItem {
  id: string
  name: string
  quantity: number
  unitPrice: number // Base unit price (cents)
  seatNumber?: number | null // Which seat ordered this (for seat-based ordering)
  courseNumber?: number // Which course this item belongs to (for coursing)

  // Dual Pricing
  cashPrice: number
  cardPrice: number

  lineTotal: number // Defaults to card total
  lineTotalCash: number
  lineTotalCard: number

  modifiers: Array<{
    name: string
    price: number // usually card price
    priceCash: number
    priceCard: number
    isNo?: boolean // true for "no/exclude" modifiers
    categoryName?: string // modifier category/group name
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
  serverName?: string | null // e.g., "Michael J."
  customerName?: string | null // e.g., "John Doe"
  customerPhone?: string | null

  // Current screen
  screenState: CFDScreenState

  // Order data
  orderNumber: string | null // e.g., "#0042"
  orderType: string | null // "Dine In", "Takeaway", etc.
  tableName?: string | null // e.g., "A1", "Table 5" (for dine-in orders)
  guestCount: number | null
  items: CFDCartItem[]

  // Totals (all in cents)
  subtotal: number // Default/Card subtotal
  subtotalCash: number
  subtotalCard: number

  discountAmount: number

  taxAmount: number // Default/Card tax
  taxCash: number
  taxCard: number

  tipAmount: number
  tipPercentage: number | null // Current selected percentage (if any)

  total: number // Default/Card total
  totalCash: number
  totalCard: number

  savingsAmount: number // Amount saved by paying cash

  // Outstanding amounts (for partial payments)
  outstandingTotal: number
  amountPaid: number

  // Branding (sent on connect, cached on CFD)
  branding?: CFDBranding
  layout?: {
    showOrderingRightPanel: boolean
    orderingRightPanelMode?: 'single' | 'stacked'
  }
  orderingPanelImages?: {
    primary: string[]
    secondary: string[]
  }

  // Tip selection config
  tipConfig?: {
    subtotalForTip: number // Base amount for tip calculation
    presetPercentages: number[] // e.g., [15, 18, 20, 25]
    allowCustom: boolean
  }

  carouselImages?: string[]

  // Loyalty (post-payment)
  loyaltyPrompt?: {
    merchantName: string
  }
  loyaltyResult?: {
    customerName?: string
    programs: Array<{
      name: string
      type: string // 'points' | 'visits' | 'punch_card'
      earned: number
      newBalance: number
      rewardUnlocked: boolean
      progressPercent?: number | null
      remainingToReward?: number | null
      rewardThreshold?: number | null
      rewardLabel?: string | null
      canRedeemNow?: boolean | null
    }>
  }

  // Payment method (when screenState is 'payment' or 'processing')
  paymentMethod?: 'cash' | 'card' | 'manual' | null

  // Payment method (when screenState is 'payment' or 'processing')
  paymentMethod?: 'cash' | 'card' | 'manual' | null

  // Timestamp
  timestamp: number
}

export interface CFDTipResponse {
  stationId: string
  tipAmount: number // cents
  tipPercentage: number | null // null if custom amount
  timestamp: number
}

export interface CFDPhoneResponse {
  phone: string // raw digits, e.g. "5551234567"
  timestamp: number
}

export interface CFDMessage {
  type:
    | 'state_update'
    | 'ping'
    | 'pong'
    | 'tip_selected'
    | 'phone_submitted'
    | 'loyalty_skip'
    | 'loyalty_join'
    | 'unpair'
    | 'exit_cfd_mode'
  payload?: CFDPayload | CFDTipResponse | CFDPhoneResponse
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
