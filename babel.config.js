module.exports = function (api) {
  api.cache(true);

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

  // react-native-reanimated/plugin must be last per its plugin docs.
  plugins.push("react-native-reanimated/plugin");

  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins,
  };
};
