/**
 * Sizing for the menu management item grid.
 *
 * Pure so it can be tested: the grid's FlashList is told every row's exact
 * height (`rowHeight`), and the card renders at exactly `cardHeight`, so the two
 * must come from the same numbers — a drift between them is the scroll-jump and
 * blank-gap class of bug the old fixed 152×186 card was built to avoid.
 *
 * Responsiveness comes from the column count, not from stretching one card:
 * the grid fits as many `minCardWidth` columns as the measured width allows and
 * shares the remainder, so a card is always between 1× and ~2× the minimum.
 * The image is capped so a wide-but-short card can't turn into a billboard.
 */

export type Scale = (n: number) => number;

export interface ItemGridMetrics {
  columns: number;
  gap: number;
  cardWidth: number;
  cardHeight: number;
  imageHeight: number;
  /** Card height plus the gap below it — one FlashList row. */
  rowHeight: number;
  headerHeight: number;
  /** The fixed text/action block under the image, by part. */
  body: {
    paddingTop: number;
    nameLineHeight: number;
    nameLines: number;
    nameToPrice: number;
    priceHeight: number;
    priceToActions: number;
    actionsHeight: number;
    paddingBottom: number;
  };
}

export const ITEM_GRID_MIN_CARD_WIDTH = 176;

export function computeItemGridMetrics(width: number, s: Scale): ItemGridMetrics {
  const gap = s(10);
  const minCardWidth = s(ITEM_GRID_MIN_CARD_WIDTH);
  const usable = Math.max(0, width);
  const columns = Math.max(1, Math.floor((usable + gap) / (minCardWidth + gap)));
  // With more than one column the floor above guarantees >= minCardWidth; a
  // single column narrower than the minimum takes the whole width rather than
  // overflowing it.
  const cardWidth = Math.floor((usable - gap * (columns - 1)) / columns);

  const imageHeight = Math.min(
    s(140),
    Math.max(s(92), Math.round(cardWidth * 0.56)),
  );

  const body = {
    paddingTop: s(10),
    nameLineHeight: s(18),
    nameLines: 2,
    nameToPrice: s(4),
    priceHeight: s(20),
    priceToActions: s(10),
    actionsHeight: s(34),
    paddingBottom: s(10),
  };
  const bodyHeight =
    body.paddingTop +
    body.nameLineHeight * body.nameLines +
    body.nameToPrice +
    body.priceHeight +
    body.priceToActions +
    body.actionsHeight +
    body.paddingBottom;

  // +2 for the card's 1px top and bottom border.
  const cardHeight = imageHeight + bodyHeight + 2;

  return {
    columns,
    gap,
    cardWidth,
    cardHeight,
    imageHeight,
    rowHeight: cardHeight + gap,
    headerHeight: s(32),
    body,
  };
}

/** Rows of `columns` cards, optionally under A–Z letter headers. */
export type ItemGridRow<T> =
  | { type: "header"; key: string; letter: string }
  | { type: "cards"; key: string; items: T[] };

export function buildItemGridRows<T extends { id: string; name: string }>(
  items: readonly T[],
  columns: number,
  groupByLetter: boolean,
): ItemGridRow<T>[] {
  const rows: ItemGridRow<T>[] = [];
  const pushCards = (list: readonly T[], prefix: string) => {
    for (let i = 0; i < list.length; i += columns) {
      rows.push({
        type: "cards",
        key: `${prefix}:${list[i].id}`,
        items: list.slice(i, i + columns),
      });
    }
  };

  if (!groupByLetter) {
    pushCards(items, "r");
    return rows;
  }

  const groups = new Map<string, T[]>();
  for (const item of items) {
    const first = (item.name.trim()[0] ?? "#").toUpperCase();
    const letter = /[A-Z]/.test(first) ? first : "#";
    const group = groups.get(letter);
    if (group) group.push(item);
    else groups.set(letter, [item]);
  }
  // Keys are single A–Z letters or "#": a plain comparison is exact.
  const letters = [...groups.keys()].sort((a, b) =>
    a === "#" ? 1 : b === "#" ? -1 : a < b ? -1 : a > b ? 1 : 0,
  );
  for (const letter of letters) {
    rows.push({ type: "header", key: `h:${letter}`, letter });
    pushCards(groups.get(letter)!, `r:${letter}`);
  }
  return rows;
}
