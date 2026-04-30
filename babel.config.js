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
