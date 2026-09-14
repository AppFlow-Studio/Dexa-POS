import type { MenuItemType } from "@/lib/types";

/**
 * Menu search for the kiosk — index build and ranking, with no React and no
 * store coupling so it can be unit-tested and reused by any template.
 *
 * The shape of the problem is what dictates the design: a kiosk menu is a few
 * hundred items at most, it changes only when the menu store changes, and the
 * query changes on every keystroke of a customer standing at the panel. So all
 * the per-item string work (lower-casing, accent folding, splitting the name
 * into words, concatenating the searchable text) happens **once at index build
 * time**, and a keystroke costs one `includes` per token per item over strings
 * that are already folded. No regex per keystroke, no allocation per item, no
 * fuzzy-match library — at this scale a linear scan is far below a frame and a
 * dependency would cost more in bundle size than it could ever return.
 */

/**
 * Accent folding, so "cafe" finds "Café" and "jalapeno" finds "Jalapeño".
 *
 * A hand-rolled table rather than `String.prototype.normalize("NFD")`: the
 * normalize path depends on Hermes' Intl build, which varies by platform and
 * engine version, and silently degrading to "accented items are unfindable" on
 * one of them is exactly the kind of bug nobody reports from a shop floor.
 * Latin-1 vowels and the handful of consonants that appear on a menu cover
 * every character a merchant has actually used.
 *
 * The two strings are index-aligned and must stay the same length.
 */
const ACCENTED = "àáâãäåāçćèéêëēìíîïīñòóôõöōùúûüūýÿ";
const PLAIN = "aaaaaaacceeeeeiiiiinoooooouuuuuyy";
const ACCENT_RE = new RegExp(`[${ACCENTED}]`, "g");

/**
 * Fold text into the form both the index and the query are compared in:
 * lower-cased, accent-stripped, and with every run of punctuation collapsed to
 * a single space. Punctuation collapsing is what makes "mac and cheese" match
 * "Mac & Cheese" and "12 inch" match `12"`.
 */
export function foldSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(ACCENT_RE, (c) => PLAIN[ACCENTED.indexOf(c)])
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Split a raw query into the folded tokens a match must satisfy. */
export function tokenizeSearchQuery(query: string): string[] {
  const folded = foldSearchText(query);
  return folded.length === 0 ? [] : folded.split(" ");
}

/** One searchable menu item, with its folded text precomputed. */
export interface KioskSearchEntry {
  item: MenuItemType;
  /** `${menuId}:${categoryId}` — the same key shape the rail and pill bar use. */
  categoryKey: string;
  /** Display name of the owning category, shown as the result's caption. */
  categoryName: string;
  /** Display name of the owning menu. */
  menuName: string;
  /** Folded item name. */
  name: string;
  /** Folded item name split into words, for word-prefix scoring. */
  nameWords: string[];
  /** Folded category + menu name. */
  context: string;
  /** Name, description and context folded into one string. */
  haystack: string;
}

export function buildKioskSearchEntry(
  item: MenuItemType,
  categoryKey: string,
  categoryName: string,
  menuName: string,
): KioskSearchEntry {
  const name = foldSearchText(item.name);
  const context = foldSearchText(`${categoryName} ${menuName}`);
  const description = foldSearchText(item.description ?? "");
  return {
    item,
    categoryKey,
    categoryName,
    menuName,
    name,
    nameWords: name.length === 0 ? [] : name.split(" "),
    context,
    haystack: `${name} ${context} ${description}`,
  };
}

/**
 * Where a token was found, lower being a better match. These are summed across
 * the query's tokens, so a two-token query that hits both names beats one that
 * hits a name and a description — which is the ordering a customer expects.
 */
const SCORE_NAME_PREFIX = 0;
const SCORE_NAME_WORD_PREFIX = 1;
const SCORE_NAME_CONTAINS = 2;
const SCORE_CONTEXT = 3;
const SCORE_DESCRIPTION = 4;

function tokenScore(entry: KioskSearchEntry, token: string): number {
  if (entry.name.startsWith(token)) return SCORE_NAME_PREFIX;
  if (entry.nameWords.some((w) => w.startsWith(token)))
    return SCORE_NAME_WORD_PREFIX;
  if (entry.name.includes(token)) return SCORE_NAME_CONTAINS;
  if (entry.context.includes(token)) return SCORE_CONTEXT;
  // The haystack already matched, so the only place left is the description.
  return SCORE_DESCRIPTION;
}

/**
 * Score one entry against every token, or null if it doesn't match them all.
 *
 * Tokens are ANDed: typing more words narrows the list instead of widening it,
 * which is the only behaviour that lets a customer recover from too many
 * results by continuing to type.
 */
function scoreEntry(
  entry: KioskSearchEntry,
  tokens: string[],
  phrase: string,
): number | null {
  let total = 0;
  for (const token of tokens) {
    // One cheap rejection over the concatenated string before any of the
    // per-field probes — most items fail here on most keystrokes.
    if (!entry.haystack.includes(token)) return null;
    total += tokenScore(entry, token);
  }
  // A name that starts with the whole typed phrase outranks one that merely
  // contains the same words scattered: "chicken sand" should put "Chicken
  // Sandwich" above "Sandwich, Grilled Chicken".
  if (tokens.length > 1 && entry.name.startsWith(phrase)) total -= 1;
  return total;
}

/** Results past this point are noise on a kiosk panel — the customer types more. */
export const KIOSK_SEARCH_RESULT_LIMIT = 40;

/**
 * Rank `entries` against `query`, best first. Returns [] for an empty query —
 * an empty search box shows a hint, never the whole menu.
 */
export function searchKioskMenu(
  entries: KioskSearchEntry[],
  query: string,
  limit: number = KIOSK_SEARCH_RESULT_LIMIT,
): KioskSearchEntry[] {
  const tokens = tokenizeSearchQuery(query);
  if (tokens.length === 0) return [];
  const phrase = tokens.join(" ");

  const scored: { entry: KioskSearchEntry; score: number }[] = [];
  for (const entry of entries) {
    const score = scoreEntry(entry, tokens, phrase);
    if (score !== null) scored.push({ entry, score });
  }

  // Ties break on the shorter name — the more specific match of the two — and
  // then alphabetically, so the order is stable between keystrokes rather than
  // shuffling under the customer's finger.
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      a.entry.name.length - b.entry.name.length ||
      (a.entry.name < b.entry.name ? -1 : a.entry.name > b.entry.name ? 1 : 0),
  );

  return scored.slice(0, limit).map((s) => s.entry);
}
