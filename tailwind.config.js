const { hairlineWidth } = require('nativewind/theme')

// ── Automatic UI scaling ──────────────────────────────────────────────
// Every spacing / fontSize / radius value resolves through the --ui-scale
// CSS variable, which is set at runtime from the device's dp width (see
// lib/uiScale.ts + app/_layout.tsx). This makes all existing utility
// classes (p-4, text-lg, gap-2, rounded-xl, …) reflow per-device with no
// per-component changes. The `, 1` fallback renders at scale 1.0 if the
// variable hasn't been injected yet (safe default, never breaks layout).
const ui = (px) => `calc(var(--ui-scale, 1) * ${px}px)`

// Tailwind's default spacing scale: step n === n * 4px (0.25rem). Regenerate
// it as scale-driven px. Covers the standard 0–96 ramp + fractional steps.
const SPACING_STEPS = [
  0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20,
  24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96,
]
const spacing = { px: ui(1) }
for (const step of SPACING_STEPS) {
  spacing[String(step)] = ui(step * 4)
}

// fontSize: [size, { lineHeight }] — both scaled.
const FONT_SIZES = {
  xs: [12, 16],
  sm: [14, 20],
  base: [16, 24],
  lg: [18, 28],
  xl: [20, 28],
  '2xl': [24, 32],
  '3xl': [30, 36],
  '4xl': [36, 40],
  '5xl': [48, 48],
  '6xl': [60, 60],
  '7xl': [72, 72],
  '8xl': [96, 96],
  '9xl': [128, 128],
}
const fontSize = {}
for (const [name, [size, lh]] of Object.entries(FONT_SIZES)) {
  fontSize[name] = [ui(size), { lineHeight: ui(lh) }]
}

const borderRadius = {
  none: '0px',
  sm: ui(2),
  DEFAULT: ui(4),
  md: ui(6),
  lg: ui(8),
  xl: ui(12),
  '2xl': ui(16),
  '3xl': ui(24),
  full: '9999px',
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    // Scale-driven overrides (replace defaults so all spacing/font/radius
    // utilities resolve through --ui-scale). `gap`, `padding`, `margin`,
    // `width`/`height` (numeric steps), etc. all derive from `spacing`.
    spacing,
    fontSize,
    borderRadius,
    extend: {
      colors: {
        // ── CSS-variable-driven (components/ui/ primitives) ──
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        background: 'hsl(var(--background))',

        // ── Semantic palette (CSS variables, switched by .dark class) ──
        screen: 'var(--screen)',
        panel: 'var(--panel)',
        surface: 'var(--surface)',
        inset: 'var(--inset)',

        heading: 'var(--heading)',
        label: 'var(--label)',
        hint: 'var(--hint)',

        teal: {
          DEFAULT: 'var(--teal)',
          muted: 'var(--teal-muted)'
        },
        success: 'var(--success)',
        warning: 'var(--warning)',
        danger: 'var(--danger)',
        info: 'var(--info)',

        onSolid: 'var(--on-solid)'
      },
      borderWidth: {
        hairline: hairlineWidth()
      }
    }
  },
  plugins: []
}
