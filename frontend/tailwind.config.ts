import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';
import animate from 'tailwindcss-animate';

/**
 * Tailwind theme — Material Design 3 dark surface system.
 * Tokens are HSL space-separated in src/styles/globals.css; we wrap them
 * with `hsl(var(--token) / <alpha-value>)` so opacity modifiers work.
 */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        outline: {
          DEFAULT: 'hsl(var(--outline) / <alpha-value>)',
          variant: 'hsl(var(--outline-variant) / <alpha-value>)',
        },
        surface: {
          DEFAULT: 'hsl(var(--surface) / <alpha-value>)',
          bright: 'hsl(var(--surface-bright) / <alpha-value>)',
          container: 'hsl(var(--surface-container) / <alpha-value>)',
          'container-low': 'hsl(var(--surface-container-low) / <alpha-value>)',
          'container-lowest': 'hsl(var(--surface-container-lowest) / <alpha-value>)',
          'container-high': 'hsl(var(--surface-container-high) / <alpha-value>)',
          'container-highest': 'hsl(var(--surface-container-highest) / <alpha-value>)',
        },
        'on-surface': {
          DEFAULT: 'hsl(var(--on-surface) / <alpha-value>)',
          variant: 'hsl(var(--on-surface-variant) / <alpha-value>)',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
          foreground: 'hsl(var(--primary-foreground) / <alpha-value>)',
          container: 'hsl(var(--primary-container) / <alpha-value>)',
        },
        'on-primary': {
          DEFAULT: 'hsl(var(--on-primary) / <alpha-value>)',
          container: 'hsl(var(--on-primary-container) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary) / <alpha-value>)',
          foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)',
          container: 'hsl(var(--secondary-container) / <alpha-value>)',
        },
        'on-secondary': {
          DEFAULT: 'hsl(var(--on-secondary) / <alpha-value>)',
          container: 'hsl(var(--on-secondary-container) / <alpha-value>)',
        },
        tertiary: {
          DEFAULT: 'hsl(var(--tertiary) / <alpha-value>)',
          foreground: 'hsl(var(--tertiary-foreground) / <alpha-value>)',
          container: 'hsl(var(--tertiary-container) / <alpha-value>)',
        },
        'on-tertiary': {
          DEFAULT: 'hsl(var(--on-tertiary) / <alpha-value>)',
          container: 'hsl(var(--on-tertiary-container) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive) / <alpha-value>)',
          foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)',
        },
        error: {
          DEFAULT: 'hsl(var(--error) / <alpha-value>)',
          foreground: 'hsl(var(--error-foreground) / <alpha-value>)',
          container: 'hsl(var(--error-container) / <alpha-value>)',
        },
        'on-error': {
          DEFAULT: 'hsl(var(--on-error) / <alpha-value>)',
          container: 'hsl(var(--on-error-container) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
          foreground: 'hsl(var(--muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
          foreground: 'hsl(var(--accent-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover) / <alpha-value>)',
          foreground: 'hsl(var(--popover-foreground) / <alpha-value>)',
        },
        card: {
          DEFAULT: 'hsl(var(--card) / <alpha-value>)',
          foreground: 'hsl(var(--card-foreground) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'hsl(var(--success) / <alpha-value>)',
          foreground: 'hsl(var(--success-foreground) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning) / <alpha-value>)',
          foreground: 'hsl(var(--warning-foreground) / <alpha-value>)',
        },
        inverse: {
          primary: 'hsl(var(--inverse-primary) / <alpha-value>)',
          surface: 'hsl(var(--inverse-surface) / <alpha-value>)',
          'on-surface': 'hsl(var(--inverse-on-surface) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Plus Jakarta Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      fontSize: {
        caption: ['12px', { lineHeight: '1.4', letterSpacing: '0.02em', fontWeight: '500' }],
        'label-md': ['14px', { lineHeight: '1.2', fontWeight: '600' }],
        'body-md': ['16px', { lineHeight: '1.6', fontWeight: '400' }],
        'body-lg': ['18px', { lineHeight: '1.6', fontWeight: '400' }],
        'headline-md': ['24px', { lineHeight: '1.3', fontWeight: '600' }],
        'headline-lg': ['32px', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display-xl': ['48px', { lineHeight: '1.1', letterSpacing: '-0.04em', fontWeight: '800' }],
      },
      spacing: {
        unit: '8px',
        gutter: '16px',
        'container-padding': '24px',
        'bubble-padding-x': '16px',
        'bubble-padding-y': '12px',
        'message-gap': '12px',
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        xl: '0.75rem',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        shimmer: 'shimmer 2s linear infinite',
        'pulse-soft': 'pulse-soft 1.5s ease-in-out infinite',
      },
    },
  },
  plugins: [animate, typography],
} satisfies Config;
