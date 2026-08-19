// metro.config.cfd-web.js
// Standalone Metro config for the CFD WebView bundle.
// Extends the project's main metro.config.js and adds:
//   - tsconfig path aliases (@/, ~/) — Expo CLI normally injects these,
//     but `metro build` doesn't go through expo-cli, so we add them here.
//   - Output type override (single bundle, no manifest).

const path = require("path");
const baseConfig = require("./metro.config.js");

const projectRoot = __dirname;

// Wire path aliases so `@/...` and `~/...` imports resolve from project root.
baseConfig.resolver = baseConfig.resolver || {};
baseConfig.resolver.extraNodeModules = {
  ...(baseConfig.resolver.extraNodeModules || {}),
  "@": projectRoot,
  "~": projectRoot,
};

// Web-appropriate module resolution. The base (Expo/Sentry) config is
// native-oriented — resolverMainFields ["react-native","browser","main"] and
// platforms ["ios","android"]. Running `metro build -p web` against that makes
// packages resolve their NATIVE entry (e.g. reanimated -> src/index) and skips
// `.web.js` variants, dragging real react-native internals (Platform,
// processColor, *ViewConfig, …) into the web graph where they can't resolve.
// `expo export` sets these for web automatically; the standalone build must too.
baseConfig.resolver.resolverMainFields = ["browser", "module", "main"];
baseConfig.resolver.platforms = Array.from(
  new Set(["web", ...(baseConfig.resolver.platforms || [])])
);
// Never prefer `.native.*` files in the web bundle. The base config leaves this
// unset (native default), which makes metro pick e.g.
// expo-modules-core's NativeViewManagerAdapter.native.tsx over its plain web
// twin, dragging react-native's NativeComponentRegistry into the web graph.
baseConfig.resolver.preferNativePlatform = false;

// Custom resolveRequest hook — handles `@/foo/bar` and `~/foo/bar` shapes
// that aren't covered by extraNodeModules alone (since the alias has a
// trailing slash semantics).
const previousResolveRequest = baseConfig.resolver.resolveRequest;
baseConfig.resolver.resolveRequest = (context, moduleName, platform) => {
  // Force web semantics: never resolve `.native.*` twins in the web bundle.
  // The upstream Expo/Sentry resolver reads preferNativePlatform from the
  // resolution *context*, not from `config.resolver`, so setting it on the
  // config alone doesn't stick — inject it into the context here. Without this,
  // metro picks e.g. expo-modules-core's NativeViewManagerAdapter.native.tsx
  // over its plain web twin, dragging react-native's NativeComponentRegistry
  // (and the native view-config tree) into the web graph.
  const ctx =
    context.preferNativePlatform === false
      ? context
      : { ...context, preferNativePlatform: false };

  // Web bundle: force `react-native` -> `react-native-web`. The standalone
  // `metro build` path (unlike `expo export`) doesn't reliably apply Expo's web
  // alias, so a bare `import ... from "react-native"` resolves to the NATIVE
  // react-native index whose `require('./Libraries/Image/Image')` then fails
  // for web. Aliasing the top-level package short-circuits that.
  if (platform === "web" && moduleName === "react-native") {
    return ctx.resolveRequest(ctx, "react-native-web", platform);
  }

  if (moduleName.startsWith("@/") || moduleName.startsWith("~/")) {
    const rest = moduleName.slice(2);
    const absolute = path.join(projectRoot, rest);
    return ctx.resolveRequest(ctx, absolute, platform);
  }
  if (previousResolveRequest) {
    return previousResolveRequest(ctx, moduleName, platform);
  }
  return ctx.resolveRequest(ctx, moduleName, platform);
};

module.exports = baseConfig;
