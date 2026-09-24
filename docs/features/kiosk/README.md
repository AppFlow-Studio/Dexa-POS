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
Result is clamped to `KIOSK_MIN/MAX_UI_SCALE` (0.85–3.0).

| Panel | Scale |
| --- | --- |
| 1080×1920 (32" portrait 1080p) | 1.61 |
| 1920×1080 (landscape 1080p) | 1.61 |
| 2160×3840 (4K portrait) | 3.00 (clamped) |
| 1333×752 (baseline tablet) | 1.12 |
| any phone, either orientation | 0.85 (floor) |

**The floor is the phone scale.** Every handset's raw ratio (~0.5–0.6) sits
below it, so all phones share one scale — as phone apps do; dp already absorbs
density. 0.85 is where the header's 52dp controls reach 44dp, the smallest
comfortable touch target. The old 0.7 floor gave 36dp controls and 12.6px body
type. Every real tablet/kiosk panel is above 0.85, so none of them moved.

Type set below ~15px goes through `kioskFontPx` (floored at
`KIOSK_MIN_FONT_SIZE`, 12): it can only bind below scale 1, i.e. on a phone,
where 12–14px captions would otherwise render at 10–11px. Kiosk Settings (a
Tailwind-sized staff screen) is wrapped in `KioskScaleProvider minScale={1}` —
Tailwind at 1.0 is already a phone-app type ramp, and the customer floor would
put its `text-xs` labels at 10px. The kiosk loading / failed-to-load states sit
inside `KioskScaleProvider` too; outside it they took the POS scale, which a
phone floors at 0.6.

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

### 2c. `kioskFeatureRowMetrics` — the one-per-row layout

Setting **Items per row** to 1 switches the grid to `KioskMenuItemFeatureRow`:
a full-width band with the copy on the left and the photo bleeding off the
right edge, its inner side dissolved into the card by a horizontal gradient
painted in the card's own background colour. Built for tall vertical kiosks,
where a grid of small cards wastes the panel.

Three things make it work and are easy to break:

- **The row owns its height.** At one column the cell would otherwise inherit
  the grid's whole height budget and one item would fill the screen. Height is
  `width × 0.27`, capped by the grid budget only on short viewports. That ratio
  is a *scannability* target, not a taste call — it keeps ~7 rows in view on a
  1080x1920 panel. A third of the width fits four, which reads as a stack of
  posters rather than a menu.
- **The copy stops where the fade starts.** `textInset` is derived from
  `fadeSolidStop` (the gradient's first stop), so text always lands on solid
  card colour and never on the crisp half of the photo. The gradient starts on
  `kioskCardSurface`, the card's own fill — not the page colour.
- **The copy shape is solved, not guessed.** `nameLines` and `descLines` come
  out of `FEATURE_ROW_COPY_SHAPES` — the first shape that fits the height left
  after padding and the price row, preferring to drop description lines before
  name lines. The card **must** apply both as `numberOfLines`; hard-coding 2 on
  the name lets it overflow a band that only budgeted one line, and the band
  clips.

Fade to the surface colour at zero alpha (`kioskFadeEnd`), never to
`transparent`: RN interpolates toward `rgba(0,0,0,0)` and leaves a grey bruise
across the middle of the photo.

The photo goes through `OptimizedListImage` (expo-image) rather than RN
`Image`. A gradient is painted over it before it decodes, so a hard swap-in is
much more visible here than on a plain card — the cross-dissolve and the disk
cache are both doing real work.

### 3. `kioskLayout.ts` — screen-proportional dimensions

`kioskRailWidth`, `kioskBannerHeight`, `kioskDetailHeroHeight`. These track the
*viewport* rather than the UI scale, because a fixed multiple of the scale can
swallow a short panel. The category rail also narrows as column count rises, so
the grid gets the width back — but not below two columns, where the feature row
wants *more* width, not less.

## Handheld (phone) layouts

`isKioskHandheld(w, h)` — short edge under 600dp, Android's own `sw600dp`
phone/tablet line — is the one breakpoint, with `kioskUsesCategoryRail(width)`
for the menu (width alone: a landscape phone keeps the rail, since width is what
it has to spare). Everything above the breakpoint renders exactly as before.

| Page | On a phone |
| --- | --- |
| Welcome (attract) | Logo bounded by the short edge; the welcome message is capped at 3 lines and shrinks to fit, so a long one can't push "Tap to start" off a landscape phone |
| Dine In / Takeaway | Tiles sized by `kioskOrderTypeTileSize` (width-fit as well as short edge — the old 200dp floor overflowed every phone); all its type sized from the tile by `kioskOrderTypeMetrics`, so a phone gets a 25px heading and 16px labels instead of 35px over 130dp tiles. Tablet/kiosk sizes unchanged (±1–2px) |
| Menu A / B | Portrait: rail → the Template C category strip over a full-width grid (`KioskCategoryMenuBody`). Same-named categories in two menus become `Name · Menu` (`categoryPillsFromSections`) so both stay reachable |
| Menu grid (all) | `kioskFitColumns` steps the column count down until cards clear `KIOSK_MIN_CARD_WIDTH` (128dp) — portrait phones get 2 whatever "items per row" says |
| Item detail | Fills the screen. Landscape: photo takes the left pane alone, title scrolls with the modifiers. Add button label one line, shrink-to-fit |
| Cart | Narrow: smaller thumb, icon-only Remove |
| Phone / name capture | Landscape: keypad beside the prompt. Narrow: content starts below the floating Back. ScrollView backstop everywhere |
| Tip | Landscape chooser scrolls if needed; heart badge dropped on a landscape phone |
| Card / processing / success / error | `StatusLayout` — centred, scrolls only when taller than the panel |
| Idle warning, Start-over dialog | Tighter card padding on narrow screens so copy and buttons keep one line |
| Error fallback | Scrolls rather than clipping "Start over" |
| Manager PIN | Card fits the width; landscape puts the keypad beside the heading |
| Kiosk Settings | Sidebar → compact header (status, End Session, Close) + scrolling section tabs; colour-picker wheel beside its controls on a landscape phone; dropdown list bounded by the window |

Safe areas need nothing kiosk-specific: `app/(main)/_layout.tsx` already wraps
the kiosk route in a `SafeAreaView` on all four edges.

Two behaviour changes outside phones, both deliberate: panels whose auto scale
fell between 0.7 and 0.85 (e.g. an 800×480 or 960×600 landscape panel) now
render at 0.85; and "4 per row" on an ~8–10" portrait tablet steps down to 3
where 4 would give ~119dp cards.

### Checklist

- [x] Scale floor + handheld breakpoint + column fit (`lib/uiScale.ts`, `kioskLayout.ts`)
- [x] Welcome, order type, menu A/B/C, grid, search
- [x] Item detail, cart, phone/name capture, tip, card/status screens
- [x] Idle warning, start-over dialog, error fallback
- [x] Manager PIN, Kiosk Settings (all sections), profile editor modals
- [x] Unit tests (`__tests__/kioskUiScale.test.ts` → "handheld layouts", `categoryPillsFromSections`)
- [ ] On-device pass on a phone, both orientations, all three templates

### Review

Replayed the sizing chain (scale → rail/strip → columns → card → rows visible,
plus the stacked height of each fixed-height screen) at 360×640, 390×844,
412×915 and their landscapes, and at 800×1280, 1333×752 and 1080×1920. Phones:
2 columns at 160–186dp in portrait (2.2–3.1 rows visible), 3–4 columns beside
the rail in landscape (1.7–2.0 rows); order type, success and the split phone
keypad all fit a 360dp-tall landscape phone. The one overrun is the stacked
phone-number step on a 360×640 handset (2dp), which its ScrollView absorbs.
Tablet and kiosk values are unchanged.

## Orientation

`useKioskOrientation(profileOrientation)` both applies the lock and returns the
orientation the layouts should render for. `app/(main)/kiosk.tsx` folds that
value back into the config it passes down, so every consumer keeps reading
`config.orientation` and there is exactly one place that resolves it.

The device-local override (Kiosk Settings → Menu Layout → Orientation, stored
in `useKioskDeviceSettingsStore`) wins over the profile. It defaults to
`"profile"`, so an untouched kiosk behaves as it always did.

`"auto"` calls `unlockAsync()` — it does not lock at all — and derives the
orientation from the window. That is the only honest way to "detect the
device": the app forces landscape at the manifest and root-layout level, so
while a lock is held the reported dimensions only tell you what the app asked
for. Unlocked, a stand-mounted tablet with system auto-rotate off settles into
its mount's orientation, and one with auto-rotate on follows the panel live
(`useWindowDimensions` re-renders; `MainActivity` declares `configChanges` for
orientation so nothing is recreated).

The diagnostics screen deliberately receives the **raw** profile config, not the
resolved one — it inspects and edits the profile — and re-derives the effective
orientation itself for display.

### `active` gates the lock — non-kiosk stations must not be touched

`useKioskOrientation(profileOrientation, active = true)`. The shared
`app/(main)/_layout.tsx` and `app/(auth)/_layout.tsx` call this hook for **every**
station (hooks can't be conditional), so they pass `active = isKiosk` (or
`isKiosk || isKioskRoute`). When `active` is false the hook touches nothing and
leaves orientation to `app/_layout.tsx`'s landscape lock.

This flag is load-bearing: `resolveKioskOrientationMode("profile", undefined)`
returns `"vertical"` (the intended kiosk default when a profile hasn't set an
orientation). A non-kiosk station has no profile orientation, so before the flag
existed it passed `undefined` expecting a no-op — and instead **portrait-locked
the entire landscape-only POS** (Android `FIXED_ORIENTATION` letterbox: black
side bars, a squeezed portrait column, and a measurable FPS hit). Passing
`undefined` to a hook whose resolver has a non-`undefined` default is not a
no-op. Regression test: `__tests__/useKioskOrientation.test.tsx`.

## Shared components

`KioskItemGrid` owns the responsive measurement, the card-shape choice and the
entrance animation for all three templates — templates supply `items` /
`numColumns` / `resetKey` and nothing else.

**It is a FlashList**, as is the search result list. Three things that adoption
required, none of which should be undone casually:

- **Exact heights, not estimates.** Cells are sized through `overrideItemLayout`
  from the card's real height (see the convention above). An estimate makes
  FlashList measure the cell and correct itself afterwards, which on a menu is a
  scroll-jump under the customer's finger.
- **The cell container is positioned but unsized — size it yourself.** FlashList
  renders every cell with `forceNonDeterministicRendering`, so RecyclerListView
  gives the container only `position: absolute` + `left`/`top` (and
  `flexDirection: "row"` when `numColumns > 1`). `overrideItemLayout` only tells
  FlashList how far to scroll. So the cell wrapper carries an explicit **width
  and height**: without the height, cards using `flex: 1` collapse to their
  image (a flex child of an auto-height parent resolves to zero); without the
  width, they shrink to their content inside that row box. Both were real
  regressions during the port. Column width is
  `(listWidth − content horizontal padding) / numColumns` — the padding is
  applied for you by `applyContentContainerInsetForLayoutManager`.
- **No `columnWrapperStyle` and no per-cell entrance.** FlashList has no column
  wrapper, so gutters come from half-gap padding on each cell against a content
  container inset by the same half gap — algebraically identical to the old
  spacing. And Reanimated `entering` animations fight cell recycling (a recycled
  cell replays its entrance, so cards flash while scrolling), so the old
  staggered per-card cascade is now one animation on the list container.

`contentContainerStyle` accepts **padding and background colour only**
(`ContentStyle`). Anything needing width caps, `flexGrow` or centring —
including a centred empty state — belongs on a wrapper around the list, not in
that prop. Both lists render their empty state outside the list for this reason.

The grid is keyed on `numColumns` alone. Keying it on the active category would
remount per switch and throw away the recycle pool FlashList exists to build;
the category switch scrolls to the top through the ref instead.

**It renders nothing until it has measured itself.** The window used to stand
in for the first frame, but the window is not the grid pane — beside a category
rail it over-estimates the width by a third — so every card painted once at the
wrong size and then jumped. On the top-image cards that was a barely-visible
reflow; on the feature row the photo is *positioned* from that width and its
gradient stops are derived from it, so the photo slid and the blend re-mixed as
the row settled. One blank frame is cheaper, and the entrance cascade covers
it. Don't reintroduce a window-based estimate. `KioskPressable` is the standard
tappable surface (UI-thread scale+opacity press feedback).
`KioskScreenTransition` takes a `direction` (`forward` / `up` / `fade`)
describing how a screen relates to the one it replaces.

**Device-local settings** (`useKioskDeviceSettingsStore`, MMKV) are the ones a
manager sets on the tablet itself rather than on the website: `menuColumns` and
`orientationMode`. Both default to deferring — `"auto"` and `"profile"` — so an
untouched device behaves as though the setting did not exist.

## Menu search

`KioskSearchBar` + `KioskSearchOverlay` + `kioskMenuSearch.ts`, ranked logic
unit-tested in `__tests__/kioskMenuSearch.test.ts`.

**The bar is a button, not a text field.** A focusable input above the grid
would raise the software keyboard in place; the app runs `adjustResize`, so the
window shrinks, `KioskItemGrid` re-measures, and every card re-derives its
height budget and can flip card shape mid-keystroke. Tapping promotes to a
full-panel overlay instead: browsing layout untouched, input pinned to the top
where the keyboard can never cover it, results get the whole panel. It also
costs nothing until tapped — no index, no listeners, no input state on the menu
screen.

**The overlay is an absolute fill, never a `Modal`.** A Modal's touches don't
bubble to the template body, so `onTouchStart={registerActivity}` would stop
firing and the idle timer could reset the kiosk under a customer who is actively
tapping results. Staying in the tree also keeps the header and floating cart
button in place, so search reads as a layer over the menu.

**One column at every size** is what makes it correct in both orientations and
all three templates with no branching: input on top, results below, column
capped at `MAX_COLUMN` and centred so a 55" landscape panel doesn't stretch rows
into a tabloid page. Rows are fixed-height, which is what lets the FlashList lay
out from a real size. The list carries bottom padding for the floating cart button,
which paints above the overlay (it is a later sibling, outside the menu view) —
without it the last result is trapped underneath.

**Placement rule, same in every template:** a full-width row leading the menu
content. Templates A and B span it across rail and grid (B puts it under the
banner); Template C leads `menuContent`, which in landscape is the column beside
the media strip, so the strip keeps its full height. Because it spans the rail,
its position matches what it does — it searches every available menu, not the
selected category.

**Cost per keystroke is one pass over a prebuilt index.** All per-item string
work — lower-casing, accent folding, splitting the name into words, building the
haystack — happens once in `useKioskSearchEntries`, memoised on the same inputs
the rail and grid use, so it rebuilds only when the menu changes. A keystroke is
then one `includes` per token per item, over already-folded strings: no regex,
no per-item allocation, no fuzzy-match dependency. `useDeferredValue` keeps the
typed text painting on the frame it was typed while ranking yields to it.

Search applies **exactly** the visibility filters the browsing path applies
(kiosk channel, menu/category schedules, 86 state, unbuildable required modifier
groups), so it can never surface something the grid deliberately hides. Items
listed under two menus are indexed once — duplicate rows read as a bug.

Accent folding is a hand-rolled table, not `String.prototype.normalize("NFD")`:
that path depends on Hermes' Intl build, and degrading to "accented items are
unfindable" on one platform is the kind of bug nobody reports from a shop floor.
The two strings in `kioskMenuSearch.ts` are index-aligned — keep them the same
length.

Tokens are **ANDed**: typing more words narrows, which is the only behaviour
that lets a customer recover from too many results by continuing to type.

## Conventions

- **Never call `Alert.alert` in kiosk code.** A native alert is the one surface
  the kiosk can't theme. Use `useKioskDialog` (`KioskDialog.tsx`) — same
  signature — passing `config` for the customer-themed look (render the
  returned element at the screen root) or nothing for the staff Settings look
  (drawn in a Modal, so it works from inside scrolling panels). Keep customer
  copy generic; staff detail belongs in Kiosk Settings.
- **Never use raw `px` for a size in a kiosk component.** Route it through
  `kioskPx(n, scale)` or `kioskCardMetrics`, or it will render at a fraction of
  the surrounding UI on a large panel. `KioskIdleModal` shipped with raw px and
  was invisible-small on a 32" kiosk until this was fixed.
- Avoid `removeClippedSubviews` on any kiosk list — it has a history of blanking
  cells in Android lists, and a blank menu cell on a customer-facing kiosk is a
  lost sale. FlashList's recycling makes it unnecessary anyway.
- **Every card shape must report an exact height.** `kioskCardMetrics.cardHeight`,
  `kioskRowMetrics.rowHeight` and `kioskFeatureRowMetrics.height` are sums of
  blocks that are each already a fixed height — not estimates. FlashList lays the
  grid out from them (see below), so adding a block to a card without adding it
  to the sum makes the list measure and correct itself mid-scroll.

## Layout variants

`KioskMenuItem` (image on top), `KioskMenuItemRow` (square image left) and
`KioskMenuItemFeatureRow` (full-width, photo blended off the right edge) are
three shapes of the same card, chosen by `KioskItemGrid`: one column always
means the feature row; otherwise `shouldUseRowLayout` picks between the other
two per cell. None is template-specific — all three templates get all three
automatically.

`numColumns === 1` also changes the FlatList itself: `columnWrapperStyle` is
rejected on a single-column list (there is no row wrapper), so the cell carries
its own bottom margin and drops the `flex: 1 / numColumns` basis that would
otherwise fight the row's own height.

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
| Cart | single column, totals pinned at foot | lines left, totals card + Checkout right |

Measured before the fix: the tip screen ran 32-47px past the viewport on every
landscape panel with nothing scrolling, so the summary and Pay button were
clipped; cart lines stretched to 1842px on a 1920px panel behind a 167px
thumbnail. When adding a screen, check it at 1280x720 as well as 1920x1080 —
the short panel is where a scaled fixed-height footer bites first.

Cart and tip share the same landscape split (`LIST_PANE_FLEX = 1.45` against a
1-flex summary pane, divider and `primaryColor06` wash on the right). The cart's
lines go **two-up inside the left pane only when that pane still gives each line
~430px** — on a 1280-wide panel the pane is ~700px, and two 340px lines put the
thumbnail, qty stepper and Remove pill in each other's way, so it falls back to
one column. An empty cart skips the split entirely: a summary of zeroes beside a
dead Checkout button reads as broken, not as a layout.

**The software keyboard is a fourth landscape squeeze.** The app runs
`adjustResize`, so a keyboard takes roughly half a landscape kiosk's height
away from the layout. A centred block with a text input is then taller than
what's left and the input lands behind the keyboard — `KioskCustomerInfoStep`'s
name step anchors to the top and tightens its rhythm instead (`lift`), and
wraps the block in a `ScrollView` as the backstop for any panel size. Portrait
keeps centring: there is enough height above the keyboard for it.

Key that off orientation, not a `Keyboard` visibility listener. The input
autofocuses, so the keyboard is up for essentially the whole life of the
screen; reacting to the event only adds a visible jump ~300ms after entry.

## Screen transitions

Every kiosk screen cross-fades. Sliding was tried and removed: full-screen
travel on a kiosk panel reads as sluggish rather than polished, and the
incoming screen is usually still building its subtree while it moves.
`KioskScreenTransition` still accepts `direction` so call sites document how
screens relate, but all values render the same fade today.

**Screens must be stacked, not flowed.** `KioskScreenTransition` is
`position: absolute` and every template wraps its screens in one `flex: 1` body
container. An exiting screen stays mounted for the length of its fade; as a
flow child with `flex: 1` it would share the column with the incoming screen
for those frames — both squeezed to half height — and then snap. That reflow,
not the fade, is what made "Add to Cart" look like the item-detail screen hung
around for a beat. Stacked, the outgoing screen fades out *over* the incoming
one, which is a true cross-fade and reads instant. Exit (110ms, eased in) is
deliberately faster than entrance (170ms, eased out) so the outgoing screen
sheds most of its opacity in the first frames instead of loitering at 50%.

## Shadows on animated surfaces

Put the shadow on **the same view that animates**, never on a child of it. On
Android an elevation shadow is drawn from the view's own RenderNode, so a
parent's animating alpha is not composited with it — the shadow renders at full
strength against a still-fading child. The menu card hit this (shadow on the
card, `entering` on the grid's wrapper) and the cart button hit it on exit.

The menu card carries no shadow at all: it is separated from the page by its
own fill (see Card surfaces below) plus a hairline border, and a grid of cards
each casting an elevation shadow is a real per-frame cost on kiosk hardware.
`CartLineRow` and the item-detail photo are the correct pattern — shadow and
`entering` on one view.

## Card surfaces

Menu cards are filled with `kioskCardSurface(config.backgroundColor)`, a solid
colour one perceptible step off the page — down on a light theme, up on a dark
one, since you cannot go lighter than white. All three card variants use it, so
the menu reads as one system whichever shape a cell resolves to. Before this,
cards were painted in the page colour and separated by a 1px border alone,
which reads as a wireframe from the few feet a customer actually stands away.

**It has to be a solid colour, not a translucent overlay.** The feature row
fades its photo out into the card, and a gradient needs a real colour to start
from. One derived hex keeps fill and fade in exact agreement; a translucent
fill would leave the blend ending on the *page* colour, one step off the card
around it — a faint seam down the middle of every photo.

`kioskFadeEnd` is the matching helper for the far end of any kiosk fade. Both
return the input unchanged / `null` for colours they cannot parse, so an
unexpected colour format degrades to the old flat look instead of a dirty one.

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
