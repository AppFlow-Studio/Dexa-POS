const { withNativeWind } = require('nativewind/metro');
const {
  getSentryExpoConfig
} = require("@sentry/react-native/metro");
 
const config = getSentryExpoConfig(__dirname)

 config.transformer.minifierConfig = {
  compress: {
    // This safely eliminates all console.* statements during production builds
    drop_console: true, 
  },
};

module.exports = withNativeWind(config, { input: './global.css' })