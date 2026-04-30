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

// Custom resolveRequest hook — handles `@/foo/bar` and `~/foo/bar` shapes
// that aren't covered by extraNodeModules alone (since the alias has a
// trailing slash semantics).
const previousResolveRequest = baseConfig.resolver.resolveRequest;
baseConfig.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith("@/") || moduleName.startsWith("~/")) {
    const rest = moduleName.slice(2);
    const absolute = path.join(projectRoot, rest);
    return context.resolveRequest(context, absolute, platform);
  }
  if (previousResolveRequest) {
    return previousResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = baseConfig;
