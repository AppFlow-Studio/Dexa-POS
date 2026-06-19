let closeVendorSidebarHandler: (() => void) | null = null
let activeVendorSidebarId: string | null = null
const listeners = new Set<() => void>()

export const registerVendorSidebarCloseHandler = (
  handler: (() => void) | null
) => {
  closeVendorSidebarHandler = handler
}

export const requestVendorSidebarClose = () => {
  closeVendorSidebarHandler?.()
}

export const setActiveVendorSidebarId = (vendorId: string | null) => {
  activeVendorSidebarId = vendorId
  listeners.forEach(listener => listener())
}

export const subscribeActiveVendorSidebarId = (listener: () => void) => {
  listeners.add(listener)
  if (__DEV__ && listeners.size > 25) {
    console.warn(
      `[vendorSidebarControl] listener set unexpectedly large (${listeners.size}) — a subscribeActiveVendorSidebarId call-site is likely not unsubscribing on unmount.`
    )
  }
  return () => listeners.delete(listener)
}

export const getActiveVendorSidebarId = () => activeVendorSidebarId
