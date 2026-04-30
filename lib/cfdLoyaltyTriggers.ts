// lib/cfdLoyaltyTriggers.ts
// Module-level loyalty handler registry for the built-in CFD path.
//
// Why this exists:
//   `CFDScreenRouter` (used by both the off-device WS client and the on-device
//   built-in/WebView display) calls these helpers as fallbacks when no
//   callbacks are passed in as props. Previously they lived in `CFDProvider`,
//   which transitively imports the entire POS dep graph (useOrderStore,
//   expo-router, supabase, etc.). That made it impossible to compile
//   `CFDScreenRouter` to a slim web bundle for the WebView shell.
//
//   Extracting the registry here breaks the import edge: `CFDScreenRouter`
//   depends on this lightweight module, and `CFDProvider` registers its real
//   implementations at startup via `setCFDLoyaltyHandlers`.

type JoinHandler = () => void;
type PhoneHandler = (phone: string) => void;
type SkipHandler = () => void;

let loyaltyJoinTrigger: JoinHandler | null = null;
let loyaltyPhoneSubmitTrigger: PhoneHandler | null = null;
let loyaltySkipTrigger: SkipHandler | null = null;

export function setCFDLoyaltyHandlers(handlers: {
  onJoin?: JoinHandler | null;
  onPhoneSubmit?: PhoneHandler | null;
  onSkip?: SkipHandler | null;
}) {
  if ("onJoin" in handlers) loyaltyJoinTrigger = handlers.onJoin ?? null;
  if ("onPhoneSubmit" in handlers)
    loyaltyPhoneSubmitTrigger = handlers.onPhoneSubmit ?? null;
  if ("onSkip" in handlers) loyaltySkipTrigger = handlers.onSkip ?? null;
}

export function triggerCFDLoyaltyJoin() {
  loyaltyJoinTrigger?.();
}

export function triggerCFDPhoneSubmit(phone: string) {
  loyaltyPhoneSubmitTrigger?.(phone);
}

export function triggerCFDLoyaltySkip() {
  loyaltySkipTrigger?.();
}
