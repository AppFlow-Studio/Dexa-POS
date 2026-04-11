import { createContext, useContext } from 'react'

interface CFDClientActions {
  sendTipSelection: (tipAmount: number, tipPercentage: number | null) => void
  sendPhoneNumber: (phone: string) => void
  sendLoyaltySkip: () => void
  sendLoyaltyJoin: () => void
  reconnect: (options?: { manual?: boolean }) => void
  disconnect: () => void
}

const CFDClientContext = createContext<CFDClientActions | null>(null)

export const CFDClientProvider = CFDClientContext.Provider

export function useCFDClient (): CFDClientActions {
  const ctx = useContext(CFDClientContext)
  if (!ctx) throw new Error('useCFDClient must be within CFDClientProvider')
  return ctx
}
