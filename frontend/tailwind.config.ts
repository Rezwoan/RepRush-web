import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-inter)', 'sans-serif'],
      },
      colors: {
        // ── Brand blue — sampled from the RepRush "R" marks (#0462B2) ──
        brand: {
          50:  '#f0f6ff',
          100: '#dcebfd',
          200: '#b6d4fb',
          300: '#7fb2f5',
          400: '#3b97f5',
          500: '#0a80f5',  // primary interactive blue
          600: '#046cc8',
          700: '#0462b2',  // ← the logo blue
          800: '#07427e',
          900: '#0a3161',
          950: '#071c3b',
        },
        // ── Volt gold — sampled from the lightning bolt (#FABA0C) ──
        volt: {
          50:  '#fff8e1',
          100: '#fdefc4',
          200: '#fbdf94',
          300: '#f9cb54',
          400: '#faba0c',  // ← the logo gold
          500: '#e0a009',
          600: '#c77f0c',
          700: '#a0610a',
          800: '#7e4910',
          900: '#654010',
        },
        // Semantic, driven by CSS variables in globals.css
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        elevated: 'hsl(var(--elevated))',
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        success: { DEFAULT: 'hsl(var(--success))', foreground: 'hsl(var(--success-foreground))' },
        warning: { DEFAULT: 'hsl(var(--warning))', foreground: 'hsl(var(--warning-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
      },
      borderRadius: {
        '2xl': 'calc(var(--radius) + 6px)',
        xl: 'calc(var(--radius) + 2px)',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 4px)',
        sm: 'calc(var(--radius) - 6px)',
      },
      boxShadow: {
        'glow-brand': '0 10px 40px -12px rgba(10,128,245,0.55)',
        'glow-volt': '0 10px 40px -12px rgba(250,186,12,0.5)',
        'card': '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 14px 40px -24px rgba(0,0,0,0.7)',
        'lift': '0 18px 50px -22px rgba(0,0,0,0.75)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #0a80f5 0%, #046cc8 60%, #0462b2 100%)',
        'volt-gradient': 'linear-gradient(135deg, #faba0c 0%, #e0a009 100%)',
        'spark-gradient': 'linear-gradient(135deg, #0a80f5 0%, #0462b2 45%, #faba0c 130%)',
        'grid-faint':
          'linear-gradient(to right, hsl(var(--border)/0.5) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border)/0.5) 1px, transparent 1px)',
      },
      keyframes: {
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        spin: {
          to: { transform: 'rotate(360deg)' },
        },
        'spark-pan': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
      },
      animation: {
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
        shimmer: 'shimmer 1.6s infinite',
        'spark-pan': 'spark-pan 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

export default config
