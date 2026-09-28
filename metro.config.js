const path = require('path');
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

// lib/icons imports single lucide icon files so startup doesn't evaluate all
// ~1,700 icons. lucide's package "exports" only lists its barrels, so Metro
// would resolve each icon with a "not listed in exports" warning; resolve
// these paths straight to the file instead.
const LUCIDE_ICON_PREFIX = 'lucide-react-native/dist/esm/icons/';
const lucideIconsDir = path.join(
  path.dirname(require.resolve('lucide-react-native')),
  '../esm/icons',
);
const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith(LUCIDE_ICON_PREFIX)) {
    return {
      type: 'sourceFile',
      filePath: path.join(lucideIconsDir, moduleName.slice(LUCIDE_ICON_PREFIX.length)),
    };
  }
  return (upstreamResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' })
