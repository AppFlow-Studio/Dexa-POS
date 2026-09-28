# Icons (lucide)

Status: live on `kds-improvements` since 2026-09-23. Startup context and
measurements: [`../performance/startup-and-bundle.md`](../performance/startup-and-bundle.md).

## Rule

Import icons from `@/lib/icons`, never from `lucide-react-native`:

```ts
import { Check, ChefHat, type LucideIcon } from "@/lib/icons";
```

A value import from `lucide-react-native` fails lint (`no-restricted-imports`
in `eslint.config.js`). Type-only imports from it are allowed but unnecessary —
`@/lib/icons` re-exports `LucideIcon` and `LucideProps`.

Icons that need a NativeWind `className` (color, opacity) use the wrappers in
`lib/icons/<Name>.tsx` (for example `~/lib/icons/Check`), which register the icon
with `cssInterop` through `lib/icons/iconWithClassName.ts`. The
`components/ui/*` primitives use these.

## Why

`lucide-react-native`'s package root re-exports every icon (~1,700) and Metro
does not tree shake, so a single root import evaluated all of them at app
startup: 1,720 modules and 539 KB of the production bundle. `lib/icons/index.ts`
lists only the icons the app uses (217) — 218 modules and 57 KB, measured
2026-09-23.

`lib/icons/index.ts` is itself imported by startup code, so every icon listed in
it is evaluated at cold start. Keep the list to icons that are actually used.

## Add an icon

1. Find the icon's file. Export names and file names differ for renamed icons —
   lucide keeps old names as aliases (`AlertCircle` lives in
   `icons/circle-alert.mjs`):

   ```sh
   grep -E "default as ChefHat[ ,}]" node_modules/lucide-react-native/dist/esm/lucide-react-native.mjs \
     | grep -oE "icons/[a-z0-9-]+\.mjs"
   ```

2. Add one line to `lib/icons/index.ts`, in alphabetical order:

   ```ts
   export { default as ChefHat } from "lucide-react-native/dist/esm/icons/chef-hat.mjs";
   ```

3. TypeScript reports an icon that is imported but not listed
   (`Module '"@/lib/icons"' has no exported member …`). It does **not** check the
   file path: a wrong file name only shows up as a Metro "Unable to resolve"
   error or a failing Jest test, so load the screen or run the tests after
   adding an icon.

## Remove unused icons

Lists icons in `lib/icons/index.ts` that no source file uses. Word matching can
keep a name that also appears as a normal identifier (`Map`), but never flags an
icon that is in use:

```sh
for n in $(grep -oE "default as [A-Za-z0-9]+" lib/icons/index.ts | awk '{print $3}'); do
  grep -rlw "$n" app components contexts hooks lib services stores utils --include='*.ts' --include='*.tsx' \
    | grep -qv '^lib/icons/index.ts$' || echo "unused: $n"
done
```

## Tests

Jest does not transform lucide and enforces package `exports`, so
`jest.config.js` maps the deep ESM paths to lucide's CommonJS build of the same
icon. To mock icons, mock `@/lib/icons` — not `lucide-react-native` — and list
every icon the component under test renders:

```ts
jest.mock("@/lib/icons", () => ({ WifiOff: "WifiOff" }));
```

Example: `__tests__/NetworkStatusBadge.test.tsx`.

## How it is wired

| File | Role |
| --- | --- |
| `lib/icons/index.ts` | The icon list: one deep import per icon, plus `LucideIcon` / `LucideProps` types |
| `types/declarations.d.ts` | Types `lucide-react-native/dist/esm/icons/*` as `LucideIcon`. lucide's `exports` map only exposes its barrels, so TypeScript can't resolve the files on its own |
| `metro.config.js` | `resolveRequest` hook resolves those paths straight to the file; without it Metro logs "not listed in the exports" once per icon on every bundle |
| `jest.config.js` | `moduleNameMapper`: `…/dist/esm/icons/<name>.mjs` → `…/dist/cjs/icons/<name>.js` |
| `eslint.config.js` | `no-restricted-imports` for the `lucide-react-native` and `date-fns` roots |
| `lib/icons/<Name>.tsx`, `lib/icons/iconWithClassName.ts` | NativeWind `className` wrappers |

The CFD web build (`metro.config.cfd-web.js`) reuses `metro.config.js`, so the
resolver hook applies there too.

## Upgrading lucide-react-native

The setup depends on lucide's `dist/esm/icons/<name>.mjs` and
`dist/cjs/icons/<name>.js` layout. After an upgrade:

1. Build a bundle (start the dev server, or
   `npx expo export --platform android --output-dir .expo/check`, then delete
   the folder). A renamed or removed icon file fails to resolve.
2. Run `npx jest`.
3. Fix any failing line in `lib/icons/index.ts` with the lookup command above.
   If the package layout itself changed, also update the paths in the Metro hook
   and the Jest mapper.

## Verification (2026-09-23)

- `npx tsc --noEmit`: 0 errors. ESLint: no new violations. Jest: 2554/2555, the
  one failure (`syncOrderFromDatabaseDiscountMetadata`) predates the change.
- Production `expo export` for Android and the CFD web build both bundle with
  zero "not listed in the exports" warnings.
- Pending on device: icons render with the right colors, including the
  `className` wrappers in `components/ui/*`.
