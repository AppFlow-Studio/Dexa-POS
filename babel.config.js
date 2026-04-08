module.exports = function (api) {
  api.cache(true);

  const easProfile = process.env.EAS_BUILD_PROFILE;
  const stripConsole =
    process.env.NODE_ENV === "production" ||
    process.env.BABEL_ENV === "production" ||
    easProfile === "production" ||
    easProfile === "preview";

  const plugins = ["react-native-reanimated/plugin"];

  // Strip console.log/info/debug in production and preview builds.
  // Keep console.error and console.warn so crash reporting still receives them.
  if (stripConsole) {
    plugins.unshift([
      "transform-remove-console",
      { exclude: ["error", "warn"] },
    ]);
  }

  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins,
  };
};
