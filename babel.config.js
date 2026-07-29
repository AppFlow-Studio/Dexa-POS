module.exports = function (api) {
  // Cache must key on the env inputs below — a static cache would reuse a
  // production config (console stripping on) after a local
  // `NODE_ENV=production` run, or vice versa.
  api.cache.using(
    () =>
      `${process.env.NODE_ENV}|${process.env.BABEL_ENV}|${process.env.EAS_BUILD_PROFILE}`
  );

  const easProfile = process.env.EAS_BUILD_PROFILE;
  const stripConsole =
    process.env.NODE_ENV === "production" ||
    process.env.BABEL_ENV === "production" ||
    easProfile === "production" ||
    easProfile === "preview";

  // React Compiler must run before other plugins transform JSX.
  // Opt out of compilation in any single file with `"use no memo";` at top.
  // NOTE: do not also set `experiments.reactCompiler: true` in app.json —
  // babel-preset-expo auto-injects the compiler when that flag is on, which
  // would apply this plugin twice.
  const plugins = ["babel-plugin-react-compiler"];

  // Strip console.log/info/debug in production and preview builds.
  // Keep console.error and console.warn so crash reporting still receives them.
  if (stripConsole) {
    plugins.push([
      "transform-remove-console",
      { exclude: ["error", "warn"] },
    ]);
  }

  // Worklets Bundle Mode is ON — it reclaims the reanimated/Hermes 25–30% memory
  // regression flagged in the Expo SDK 57 changelog ("Known regressions"). Bundle
  // Mode requires the Worklets Babel plugin to receive `{ bundleMode: true }`, but
  // babel-preset-expo auto-injects that plugin with NO options and gives no way to
  // pass options through (its `worklets` key is only a boolean on/off flag — see
  // babel-preset-expo/build/configs/expo.js: `plugins.push([require(worklets/plugin)])`,
  // guarded by `options.worklets !== false`). So we OPT OUT of the auto-injection via
  // `{ worklets: false }` on the preset below and register the plugin manually here.
  // It MUST stay last in `plugins` (worklets has to be the final transform) and after
  // `babel-plugin-react-compiler` (which must run first). Pairs with
  // `getBundleModeMetroConfig(...)` in metro.config.js — keep the two in sync.
  plugins.push([
    "react-native-worklets/plugin",
    { bundleMode: true, strictGlobal: true },
  ]);

  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind", worklets: false }],
      "nativewind/babel",
    ],
    plugins,
  };
};
