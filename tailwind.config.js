const { hairlineWidth } = require("nativewind/theme");

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: {
          100: "#FAFAFA",
          200: "#F5F5F5",
          300: "#F1F1F1",
          400: "#DCDCDC",
          500: "#BEBEBE",
          600: "#A0A0A0",
        },
        foreground: "hsl(var(--foreground))",
        primary: {
          100: "#EAF1FD",
          200: "#C0D6FA",
          300: "#95BBF5",
          400: "#659AF0",
          500: "#3D72C2",
          600: "#2A5291",
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
          100: "#E6E6EB",
          200: "#A5A5B5",
          300: "#5D5D73",
          400: "#2F2F3E",
          500: "#1C1C28",
          600: "#11111A",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderWidth: {
        hairline: hairlineWidth(),
      },
    },
  },
  plugins: [],
};
