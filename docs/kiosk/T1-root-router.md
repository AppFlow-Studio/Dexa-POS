# Kiosk T1 Router Notes

Root station shell: `app/(main)/_layout.tsx`.

The existing KDS routing is implicit Expo Router routing rather than a
centralized `React.lazy` switch. Post-login route selection happens in
`lib/authFlow.ts`; `station_type = 'kds'` resolves to `/(main)/kds`.
Inside `app/(main)/_layout.tsx`, KDS stations get a minimal layout with
`LocationRealtimeProvider`, `SafeAreaView`, `StatusBar`, and `<Slot />`,
skipping POS header, sheets, order prefetch, and cash-drawer hydration.

T1 extends that same pattern for `station_type = 'kiosk'`:

- `lib/authFlow.ts` resolves kiosk stations to `/(main)/kiosk`.
- `app/(main)/_layout.tsx` treats kiosk as a full-screen station surface.
- `app/(main)/kiosk.tsx` mounts the kiosk root component and owns theme,
  scaling, lock-task entry, admin exit, diagnostics, and splash proof-of-life.

Design lock:

- Zoo Figma URL: pending paste into ticket.
- Abubeckr sign-off comment and timestamp: pending.
