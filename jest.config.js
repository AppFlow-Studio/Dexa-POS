/**
 * Jest Configuration for Dexa-POS
 *
 * This file configures Jest for testing in an Expo/React Native environment.
 *
 * Key concepts:
 * - preset: jest-expo handles React Native/Expo-specific transforms
 * - moduleNameMapper: Allows @/ path aliases to work in tests
 * - setupFilesAfterEnv: Runs jest-setup.ts before each test file
 * - transformIgnorePatterns: Tells Jest which node_modules to transform (RN needs this)
 */

/** @type {import('jest').Config} */
module.exports = {
  // Use jest-expo preset for React Native/Expo compatibility
  // This handles Babel transforms, asset mocking, and RN-specific setup
  preset: "jest-expo",

  // Setup file runs after Jest is initialized but before tests run
  // Use this for global mocks, custom matchers, and test utilities
  setupFilesAfterEnv: ["<rootDir>/jest-setup.ts"],

  // Map path aliases to actual paths (must match tsconfig.json)
  // Without this, imports like @/lib/order-calculator would fail
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "^~/(.*)$": "<rootDir>/$1",
  },

  // Tell Jest which node_modules need to be transformed
  // React Native and Expo packages are written in ES6+ and need Babel
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)",
  ],

  // Test file patterns - Jest looks for these files
  testMatch: [
    "**/__tests__/**/*.(spec|test).[jt]s?(x)",
    "**/?(*.)+(spec|test).[jt]s?(x)",
  ],

  // Files to ignore when looking for tests
  testPathIgnorePatterns: ["/node_modules/", "/android/", "/ios/"],

  // Module file extensions Jest will look for
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],

  // Collect coverage from these files (optional, enable when needed)
  collectCoverageFrom: [
    "lib/**/*.{ts,tsx}",
    "services/**/*.{ts,tsx}",
    "stores/**/*.{ts,tsx}",
    "hooks/**/*.{ts,tsx}",
    "!**/*.d.ts",
    "!**/node_modules/**",
  ],

  // Clear mocks between tests for isolation
  clearMocks: true,

  // Verbose output shows individual test results
  verbose: true,
};
