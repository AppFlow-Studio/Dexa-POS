export type CardType = "visa" | "mastercard" | "amex" | "discover" | null

export interface CardValidation {
  isValid: boolean
  cardType: CardType
  error?: string
}

// Detect card type from card number
export function detectCardType(cardNumber: string): CardType {
  const cleaned = cardNumber.replace(/\s/g, "")

  // Visa: starts with 4
  if (/^4/.test(cleaned)) {
    return "visa"
  }

  // Mastercard: starts with 51-55 or 2221-2720
  if (/^5[1-5]/.test(cleaned) || /^2(22[1-9]|2[3-9][0-9]|[3-6][0-9]{2}|7[0-1][0-9]|720)/.test(cleaned)) {
    return "mastercard"
  }

  // American Express: starts with 34 or 37
  if (/^3[47]/.test(cleaned)) {
    return "amex"
  }

  // Discover: starts with 6011, 622126-622925, 644-649, or 65
  if (/^(6011|622(12[6-9]|1[3-9][0-9]|[2-8][0-9]{2}|9[0-1][0-9]|92[0-5])|64[4-9]|65)/.test(cleaned)) {
    return "discover"
  }

  return null
}

// Luhn algorithm for card validation
export function luhnCheck(cardNumber: string): boolean {
  const cleaned = cardNumber.replace(/\s/g, "")

  if (!/^\d+$/.test(cleaned)) {
    return false
  }

  let sum = 0
  let isEven = false

  for (let i = cleaned.length - 1; i >= 0; i--) {
    let digit = Number.parseInt(cleaned[i], 10)

    if (isEven) {
      digit *= 2
      if (digit > 9) {
        digit -= 9
      }
    }

    sum += digit
    isEven = !isEven
  }

  return sum % 10 === 0
}

// Validate card number
export function validateCardNumber(cardNumber: string): CardValidation {
  const cleaned = cardNumber.replace(/\s/g, "")

  if (cleaned.length === 0) {
    return { isValid: false, cardType: null }
  }

  if (cleaned.length < 13 || cleaned.length > 19) {
    return { isValid: false, cardType: detectCardType(cardNumber), error: "Invalid card number" }
  }

  const cardType = detectCardType(cardNumber)
  const isValid = luhnCheck(cardNumber)

  return {
    isValid,
    cardType,
    error: isValid ? undefined : "Invalid card number",
  }
}

// Format card number with spaces
export function formatCardNumber(value: string): string {
  const cleaned = value.replace(/\s/g, "")
  const chunks = cleaned.match(/.{1,4}/g) || []
  return chunks.join(" ")
}

// Validate expiry date
export function validateExpiry(month: string, year: string): { isValid: boolean; error?: string } {
  if (!month || !year) {
    return { isValid: false }
  }

  const monthNum = Number.parseInt(month, 10)
  const yearNum = Number.parseInt(year, 10)

  if (monthNum < 1 || monthNum > 12) {
    return { isValid: false, error: "Invalid month" }
  }

  const currentDate = new Date()
  const currentYear = currentDate.getFullYear() % 100
  const currentMonth = currentDate.getMonth() + 1

  if (yearNum < currentYear || (yearNum === currentYear && monthNum < currentMonth)) {
    return { isValid: false, error: "Card expired" }
  }

  return { isValid: true }
}

// Validate CVV
export function validateCVV(cvv: string, cardType: CardType): { isValid: boolean; error?: string } {
  if (!cvv) {
    return { isValid: false }
  }

  const expectedLength = cardType === "amex" ? 4 : 3

  if (cvv.length !== expectedLength) {
    return { isValid: false, error: "Invalid CVV" }
  }

  if (!/^\d+$/.test(cvv)) {
    return { isValid: false, error: "Invalid CVV" }
  }

  return { isValid: true }
}

// Validate cardholder name
export function validateName(name: string): { isValid: boolean; error?: string } {
  if (!name || name.trim().length < 2) {
    return { isValid: false, error: "Enter name as shown on card" }
  }

  if (!/^[a-zA-Z\s\-']+$/.test(name)) {
    return { isValid: false, error: "Enter name as shown on card" }
  }

  return { isValid: true }
}

// Validate ZIP code
export function validateZip(zip: string): { isValid: boolean; error?: string } {
  if (!zip) {
    return { isValid: false }
  }

  if (!/^\d{5}$/.test(zip)) {
    return { isValid: false, error: "Enter 5-digit ZIP" }
  }

  return { isValid: true }
}
