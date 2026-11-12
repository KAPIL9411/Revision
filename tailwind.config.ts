import type { Config } from 'tailwindcss'

/** Colours are CSS variables (RGB triples) so `.dark` can swap the whole palette. */
const token = (name: string) => `rgb(var(${name}) / <alpha-value>)`

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: token('--bg'),
        surface: token('--surface'),
        'surface-2': token('--surface-2'),
        'surface-3': token('--surface-3'),
        ink: token('--ink'),
        body: token('--body'),
        muted: token('--muted'),
        faint: token('--faint'),
        line: token('--line'),
        'line-strong': token('--line-strong'),
        accent: {
          DEFAULT: token('--accent'),
          soft: token('--accent-soft'),
          dark: token('--accent-dark'),
        },
        success: {
          DEFAULT: token('--success'),
          soft: token('--success-soft'),
          line: token('--success-line'),
        },
        warn: {
          DEFAULT: token('--warn'),
          soft: token('--warn-soft'),
          line: token('--warn-line'),
        },
        danger: {
          DEFAULT: token('--danger'),
          soft: token('--danger-soft'),
          line: token('--danger-line'),
        },
        formula: token('--formula'),
        'on-accent': token('--on-accent'),
        'bg-on-accent': token('--bg-on-accent'),
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: { xl: '12px', lg: '9px' },
      boxShadow: {
        pop: '0 1px 2px rgba(0,0,0,0.05), 0 12px 32px -12px rgba(0,0,0,0.28)',
        sheet: '0 -8px 40px -16px rgba(0,0,0,0.32)',
      },
      maxWidth: { content: '1120px' },
      textSize: {
        xs: ['0.75rem', { lineHeight: '1.25' }],
        sm: ['0.875rem', { lineHeight: '1.375' }],
        base: ['1rem', { lineHeight: '1.5' }],
        lg: ['1.25rem', { lineHeight: '1.625' }],
        xl: ['1.5rem', { lineHeight: '2' }],
        '2xl': ['2rem', { lineHeight: '2.5' }],
        '3xl': ['2.5rem', { lineHeight: '3' }],
        '4xl': ['3.25rem', { lineHeight: '3.5' }],
        '5xl': ['4rem', { lineHeight: '1' }],
      },
    },
  },
  plugins: [],
}
export default config
