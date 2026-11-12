import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#F8F8F5',
        surface: '#FFFFFF',
        ink: '#202124',
        muted: '#777777',
        line: '#E9E9E5',
        accent: { DEFAULT: '#3157D5', soft: '#EEF1FC', dark: '#2A4AB8' },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: { xl: '12px', lg: '9px' },
      boxShadow: {
        pop: '0 1px 2px rgba(24,24,20,0.04), 0 12px 32px -12px rgba(24,24,20,0.18)',
        sheet: '0 -8px 40px -16px rgba(24,24,20,0.22)',
      },
      maxWidth: { content: '1120px' },
    },
  },
  plugins: [],
}
export default config
