// Registers the built-in customer display's root component.
//
// Kotlin's SecondaryDisplayPresentation mounts "CFDSecondaryDisplay" into its
// own ReactSurface once JS calls SecondaryDisplayModule.show(), so the name has
// to be registered at startup (module scope in app/_layout). The component
// itself — the whole CFD client UI plus react-native-webview — is required only
// when that surface actually starts, so devices without a built-in customer
// display never evaluate it.
import { AppRegistry } from "react-native";

AppRegistry.registerComponent(
  "CFDSecondaryDisplay",
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  () => require("./CFDBuiltinDisplay").default,
);
