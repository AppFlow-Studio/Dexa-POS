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

  // Reanimated 4 moved its Babel plugin into react-native-worklets; the old
  // `react-native-reanimated/plugin` is a deprecated re-export. Must be last.
  plugins.push("react-native-worklets/plugin");

  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins,
  };
};
