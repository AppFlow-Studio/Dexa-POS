/**
 * Customer-facing copy for the kiosk menu-browse chrome.
 *
 * Only the strings this screen's redesign introduced or changed live here —
 * the rest of the kiosk still carries its copy inline. New kiosk copy should
 * be added here rather than inline, so a merchant-facing wording change is a
 * one-file edit and every template says the same thing.
 */
export const kioskStrings = {
  /** Replaces the old "Cancel" — the customer abandons and the kiosk resets. */
  startOver: "Start Over",
  startOverConfirmTitle: "Start over?",
  startOverConfirmBody:
    "Your cart will be cleared and you'll go back to the start screen.",
  /** The safe option, and the confirm dialog's default. */
  startOverKeep: "Keep my order",
  startOverConfirm: "Yes, start over",

  viewCart: "View Cart",
  cartEmpty: "Cart is empty",

  searchOpen: "Search the menu",
  searchClose: "Close search",
  searchClear: "Clear",
  searchPlaceholder: "Search the menu",
  searchPrompt: "What are you looking for?",
  searchPromptHint: "Start typing an item, or a category like drinks.",
  searchEmptyHint: "Try a shorter word, or clear the search to browse the menu.",
  searchEmpty: (query: string) => `No matches for "${query}"`,

  /** 86'd item. Replaces the blunter "Unavailable". */
  soldOut: "Sold out",
  /** Accessibility label for a tile's quick-add button. */
  addItem: (name: string) => `Add ${name}`,
  scrollCategoriesLeft: "Scroll categories left",
  scrollCategoriesRight: "Scroll categories right",
} as const;
