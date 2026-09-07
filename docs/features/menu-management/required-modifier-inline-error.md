# Required Modifier Inline Error Highlight

## Summary

When an item has a required modifier group and the cashier attempts to continue
without selecting an option, the POS now marks the missing group directly in
red. The cashier can identify the required section without relying on a remote
toast in the top-right corner.

## Scope

- Mark every unresolved required modifier group as invalid.
- Render a red group title, `Required` badge, border, and helper message.
- Clear a group's error as soon as it has a valid selection.
- Clear all stale errors when the modifier screen is reopened for another item.
- Preserve minimum/maximum selection rules and modifier pricing.

## Non-Scope

- Changing modifier data, requirement rules, or prices.
- Website modifier-management UI.
- Replacing unrelated toast messages.

## Plan

1. Store unresolved modifier-group identifiers in the modifier selection store.
2. Set those errors when validation blocks the continue action.
3. Render the invalid group inline and clear it after a valid selection.
4. Add focused store tests for set, clear, reopen, tap, and long-press behavior.

## Progress

- [x] Required-group error state implemented.
- [x] Inline red treatment implemented in the modifier screen.
- [x] Valid selections clear their group error immediately.
- [x] Reopening the screen clears stale errors.
- [x] Focused automated tests pass.
- [ ] Tablet visual QA and recording complete.

## Verification

Automated verification on 2026-08-21:

```text
Test Suites: 1 passed, 1 total
Tests:       6 passed, 6 total
```

Manual QA:

1. Open an item with at least one required modifier group.
2. Leave that group empty and press the action that adds/confirms the item.
3. Confirm the missing group is visibly red in the modifier panel and the
   required message is next to that group, not only in a top-right toast.
4. Select a valid modifier and confirm the red state clears immediately.
5. Reopen the item and confirm no stale error remains.
6. If the item has multiple required groups, leave all empty and confirm every
   unresolved group is marked.

## Files

- `components/menu/ModifierScreen.tsx`
- `stores/useModifierSelectionStore.ts`
- `__tests__/modifierSelectionErrors.test.ts`

## Open QA

- Capture tablet evidence showing the blocked state and the error clearing.
- Confirm the tested menu data actually marks the modifier group as required.
