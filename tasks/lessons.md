# Lessons Learned

## Native code in "JS" dependencies

- Never claim a new dependency needs no dev-client rebuild without checking for an `android/` or `ios/` directory in its package. `@shopify/flash-list` v1 looks JS-only (RecyclerListView heritage) but ships native views (`AutoLayoutView`, `CellContainer`) — old dev clients throw "View config not found".
- Check: `ls node_modules/<pkg>/android` or look for `codegenConfig`/`RN podspec` in its package.json. If native code exists: `npm run android` rebuilds for emulator; Landi needs a fresh EAS development build.
- FlashList v1 on New Architecture: native `AutoLayoutView` can misdraw a dark rectangle over viewport space below short content. Use `disableAutoLayout` for uniform-cell grids (layout correction is only needed for variable-size cells).
- Debugging visual layout remotely: `adb exec-out screencap -p` + `adb shell uiautomator dump` (view bounds) + `adb shell input tap` against the running emulator beats guessing from cropped screenshots — the UI dump showed the list viewport was sized correctly, isolating the bug to the native overlay.

## Order Lookup Patterns

- `getOrder()` alone is fragile for DraggableTable — `dbOrderIdIndex` has timing gaps after seating
- Sidebar (`TableListItem`, `SeatedPanel`) already uses resilient fallbacks (scan by `service_location_id` or `db_order_id`)
- When multiple components need the same data, ensure they all have equivalent resilience — don't let one component use a weaker lookup strategy

## Supabase RPC Schema Checks

- Before adding column assignments inside SQL RPC migrations, verify the target table columns in `database.types.ts`; `kds_item_status` does not have `updated_at`.
