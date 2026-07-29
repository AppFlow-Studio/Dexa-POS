const { withNativeWind } = require('nativewind/metro');
const {
  getSentryExpoConfig
} = require("@sentry/react-native/metro");
const { getBundleModeMetroConfig } = require("react-native-worklets/bundleMode");

let config = getSentryExpoConfig(__dirname);

config.transformer.minifierConfig = {
  compress: {
    // This safely eliminates all console.* statements during production builds
    drop_console: true,
  },
};

// Worklets Bundle Mode — reclaims the reanimated/Hermes 25–30% memory regression
// (Expo SDK 57 "Known regressions"). Requires the two metro/metro-runtime patches in
// patches/ AND `{ bundleMode: true }` on the Worklets Babel plugin (see babel.config.js).
// getBundleModeMetroConfig wraps resolver.resolveRequest + transformer.getTransformOptions
// (chains existing hooks) and swaps serializer.createModuleIdFactory.
//
// Order: applied BEFORE withNativeWind so NativeWind's resolver stays outermost. NativeWind
// (react-native-css-interop) passes the bare `react-native` specifier straight through, so
// Bundle Mode's self-redirect guard is preserved — this is what keeps us out of the #9817
// infinite-recursion crash class (which only bites resolvers that REMAP `react-native`).
// If startup ever regresses, the first thing to try is moving this to the LAST step
// (the ordering shown in the SWM Bundle Mode docs).
config = getBundleModeMetroConfig(config);

module.exports = withNativeWind(config, { input: './global.css' });
