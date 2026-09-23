declare module "*.ttf" {
  const value: import("expo-font").FontSource;
  export default value;
}

// lib/icons/index.ts imports single lucide icon files directly — the package's
// "exports" only exposes its all-icons barrels — so type those paths as the
// package's own icon component.
declare module "lucide-react-native/dist/esm/icons/*" {
  const icon: import("lucide-react-native").LucideIcon;
  export default icon;
}
