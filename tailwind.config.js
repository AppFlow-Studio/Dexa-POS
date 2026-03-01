const { hairlineWidth } = require("nativewind/theme");
const { colors: themeColors } = require("./lib/theme-colors");

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // ── CSS-variable-driven (components/ui/ primitives) ──
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        background: "hsl(var(--background))",

        // ── Semantic palette (direct hex from theme-colors.js) ──
        screen: themeColors.screen,
        panel: themeColors.panel,
        surface: themeColors.card,
        inset: themeColors.inset,

        heading: themeColors.heading,
        label: themeColors.label,
        hint: themeColors.muted,

        teal: {
          DEFAULT: themeColors.teal,
          muted: themeColors.tealMuted,
        },
        success: themeColors.success,
        warning: themeColors.warning,
        danger: themeColors.danger,
        info: themeColors.info,

        onSolid: themeColors.onSolid,
      },
      borderWidth: {
        hairline: hairlineWidth(),
      },
    },
  },
  plugins: [],
};
