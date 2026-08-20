# Kiosk

Kiosk-mode behavior and kiosk-origin POS contracts belong here.

## Sizing & layout system

Three pure functions drive every visible dimension in the kiosk flow. They are
unit-tested in `__tests__/kioskUiScale.test.ts`.

### 1. `computeKioskUiScale(width, height)` — `lib/uiScale.ts`

Screen dp → the `--ui-scale` / `--kiosk-ui-scale` CSS variables injected by
`KioskScaleProvider`, consumed by every Tailwind utility and by `kioskPx()`.

**Orientation-aware**, unlike the POS `computeUiScale`. The baseline device
(1333×752) is a *landscape* tablet, so an axis-to-axis comparison breaks on a
portrait panel. Matching short-edge to short-edge and long-edge to long-edge
resolves the same panel to the same scale in either orientation.

A `KIOSK_LEGIBILITY_BOOST` (1.12) then accounts for kiosk viewing distance — a
customer stands ~2–3 ft from a wall/floor panel, versus ~1 ft for a POS tablet.
Result is clamped to `KIOSK_MIN/MAX_UI_SCALE` (0.7–3.0).

| Panel | Scale |
| --- | --- |
| 1080×1920 (32" portrait 1080p) | 1.61 |
| 1920×1080 (landscape 1080p) | 1.61 |
| 2160×3840 (4K portrait) | 3.00 (clamped) |
| 1333×752 (baseline tablet) | 1.12 |

### 2. `kioskCardMetrics(cardWidth)` — `components/kiosk/shared/kioskCardMetrics.ts`

Menu-card width → that card's type sizes, padding, radii and image height.
Card width already encodes *both* screen size and the manager's items-per-row
setting, so one input keeps 2/3/4-column grids proportional everywhere with no
per-template tuning. Narrow cards drop the description rather than truncating
it; ceilings are set high enough that they never bind before the 3.0× scale cap
does.

Card metrics take an optional second argument, the grid's **height budget per
card**. Width alone is the whole story in portrait, but not in landscape, where
the grid is wide and short: at 2 columns on 1920x1080 a width-derived image was
485px tall, making one row 863px of an 874px viewport — 1.01 rows visible, one
row of two enormous cards. The budget caps the image and moves type onto a basis
that respects both axes, so every column count keeps ~1.8 rows in view and
changing columns reflows the grid instead of rescaling the design.

Horizontal affordances (`showDescription`, `descLines`, `showOptionsLabel`)
stay keyed to real width — a wide-but-short card genuinely has room for copy.

### 2b. `kioskRowMetrics` / `shouldUseRowLayout`

Past a width-to-height ratio of 1.4 a cell is too wide for a top-image card —
the photo can only fit by letterboxing to ~2.7:1. `KioskItemGrid` switches
those cells to `KioskMenuItemRow` (square image left, copy right), which keeps
the photo at 1:1 and fits ~3.5 rows instead of ~1.9. In practice this is the
2-column landscape case; portrait never triggers it.

### 3. `kioskLayout.ts` — screen-proportional dimensions

`kioskRailWidth`, `kioskBannerHeight`, `kioskDetailHeroHeight`. These track the
*viewport* rather than the UI scale, because a fixed multiple of the scale can
swallow a short panel. The category rail also narrows as column count rises, so
the grid gets the width back.

## Shared components

`KioskItemGrid` owns the responsive measurement and the entrance cascade for
all three templates — templates supply `items` / `numColumns` / `resetKey` and
nothing else. `KioskPressable` is the standard tappable surface (UI-thread
scale+opacity press feedback). `KioskScreenTransition` takes a `direction`
(`forward` / `up` / `fade`) describing how a screen relates to the one it
replaces.

## Conventions

- **Never use raw `px` for a size in a kiosk component.** Route it through
  `kioskPx(n, scale)` or `kioskCardMetrics`, or it will render at a fraction of
  the surrounding UI on a large panel. `KioskIdleModal` shipped with raw px and
  was invisible-small on a 32" kiosk until this was fixed.
- Avoid `removeClippedSubviews` on the menu grid — it has a history of blanking
  cells in multi-column Android FlatLists, and a blank menu cell on a
  customer-facing kiosk is a lost sale.

## Layout variants

`KioskMenuItem` (image on top) and `KioskMenuItemRow` (image left) are two
shapes of the same card, chosen per-cell by `KioskItemGrid` via
`shouldUseRowLayout`. Neither is template-specific — all three templates get
both automatically.

## Sizing an element against its leftover space

`KioskItemDetail`'s photo is the reference case. In portrait it is inscribed in
the fixed 1/3 hero band, bounded on **both** axes (a third of a tall, narrow
panel's height can exceed its full width). In landscape it sits in a `flex: 1`
box between the back button and the title block and is inscribed in that box's
measured size, so it takes exactly what the title leaves however far the item's
name and description wrap.

Do **not** bound an element like this with `maxWidth`/`maxHeight` expressed in
`kioskPx` — that grows with the UI scale while the space it has to fit inside
does not, which is precisely how the landscape photo overflowed its panel by
107–207px after the scale fix. Likewise avoid `width:"100%" + height:"100%" +
aspectRatio: 1`: it is over-constrained, so Yoga distorts the box rather than
clipping it.

## Landscape needs its own layout, not a squeezed portrait one

Landscape kiosks have roughly half the vertical budget of portrait and nearly
double the width, so any screen built as one centred column overflows there.
Three screens hit this and now split into two panes:

| Screen | Portrait | Landscape |
| --- | --- | --- |
| Item detail | 1/3 hero band, copy scrolls under | photo + copy left, modifiers right |
| Tip | centred column, totals pinned at foot | tip chooser left, totals + Pay right |
| Cart | single column, totals pinned at foot | lines two-up left, totals + Checkout right |

Measured before the fix: the tip screen ran 32-47px past the viewport on every
landscape panel with nothing scrolling, so the summary and Pay button were
clipped; cart lines stretched to 1842px on a 1920px panel behind a 167px
thumbnail. When adding a screen, check it at 1280x720 as well as 1920x1080 —
the short panel is where a scaled fixed-height footer bites first.

## Screen transitions

Every kiosk screen cross-fades. Sliding was tried and removed: full-screen
travel on a kiosk panel reads as sluggish rather than polished, and the
incoming screen is usually still building its subtree while it moves.
`KioskScreenTransition` still accepts `direction` so call sites document how
screens relate, but all values render the same fade today.

## Shadows on animated surfaces

Put the shadow on **the same view that animates**, never on a child of it. On
Android an elevation shadow is drawn from the view's own RenderNode, so a
parent's animating alpha is not composited with it — the shadow renders at full
strength against a still-fading child. The menu card hit this (shadow on the
card, `entering` on the grid's wrapper) and the cart button hit it on exit.

The menu card now carries no shadow at all: it sits on a background of the same
colour, so the hairline border defines it, and a grid of cards each casting an
elevation shadow is also a real per-frame cost on kiosk hardware. `CartLineRow`
and the item-detail photo are the correct pattern — shadow and `entering` on one
view.

## Unavailable modifier options

`selectableModifierGroups` (in `useItemModifiers.ts`) strips options with
`isAvailable === false`, then drops any group left empty. Greying out an
unavailable option is a POS affordance for staff; a customer can only be
confused by a choice they cannot make.

Dropping the emptied group is the load-bearing part. A **required** group with
every option unavailable was a dead end: nothing tappable, so its entry in
`missingRequired` never cleared, `canAdd` stayed false, and the CTA read
"Select <group>" indefinitely — the item could not be ordered at all. Filtering
also stops an 86'd `isDefault` option from being pre-selected into a cart line
and sent to the kitchen.

This is the second of two layers. The first is `isItemOrderable` /
`hasOrderableItem` (`kioskItemAvailability.ts`), used by all three menu views:
an item whose **required** group has no available options never reaches the
menu at all, and a category with nothing orderable left drops out of the rail /
pill bar rather than leading to an empty grid. The detail-screen filtering stays
as the safety net for an item whose stock changes while a customer is on it.

`isItemOrderable` fails **open** — an item whose groups can't be resolved (menu
still hydrating) stays visible. Hiding a sellable item over a loading gap is
worse than showing one the detail screen will handle.
