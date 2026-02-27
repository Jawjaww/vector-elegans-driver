/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './App.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#10b981', // Emerald 500
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        'primary-dark': '#064e3b',
        accent: '#10b981',
        background: '#171717',
        'bg-start': '#171717',
        'bg-mid': '#262626',
        'bg-end': '#262626',
        surface: 'rgba(255, 255, 255, 0.02)',
        'surface-light': 'rgba(255, 255, 255, 0.06)',
        'surface-heavy': 'rgba(255, 255, 255, 0.12)',
        border: 'rgba(255, 255, 255, 0.06)',
        'neon-green': '#05c46b',
        'neon-green-light': '#9efbd1',
        'neon-green-bright': '#10ff8c',
        bordeaux: '#7c2230',
        'bordeaux-icon': '#a0303a',
        'elegant-bg-start': '#171717',
        'elegant-bg-mid': '#262626',
        'elegant-bg-end': '#262626',
        'elegant-accent': '#10b981',
        'elegant-accent-600': '#059669',
        gray: {
          50: '#f9fafb',
          100: '#f3f4f6',
          200: '#e5e7eb',
          300: '#d1d5db',
          400: '#9ca3af',
          500: '#6b7280',
          600: '#4b5563',
          700: '#374151',
          800: '#1f2937',
          900: '#111827',
        },
        black: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular'],
      },
      borderRadius: {
        '4xl': '2rem',
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        'glass': '0 8px 24px rgba(0, 0, 0, 0.55)',
        'glass-modal': 'inset 0 1px 0 rgba(255, 255, 255, 0.01), 0 12px 36px rgba(0, 0, 0, 0.5)',
        'glass-card': '0 6px 18px rgba(0, 0, 0, 0.45)',
      },
      animation: {
        'slide-down': 'slideDown 200ms cubic-bezier(0.87, 0, 0.13, 1)',
        'slide-up': 'slideUp 200ms cubic-bezier(0.87, 0, 0.13, 1)',
        'fade-in': 'fadeIn 300ms ease-out',
        'scale-in': 'scaleIn 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        'elegant-spin': 'elegantSpin 1.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) infinite',
      },
      keyframes: {
        slideDown: {
          from: { height: '0', opacity: '0' },
          to: { height: 'var(--radix-collapsible-content-height)', opacity: '1' },
        },
        slideUp: {
          from: { height: 'var(--radix-collapsible-content-height)', opacity: '1' },
          to: { height: '0', opacity: '0' },
        },
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        elegantSpin: {
          '0%': { transform: 'rotate(0deg)', borderTopColor: 'rgba(16, 185, 129, 0.8)', borderRightColor: 'rgba(16, 185, 129, 0.4)' },
          '25%': { borderTopColor: 'rgba(16, 185, 129, 1)', borderRightColor: 'rgba(16, 185, 129, 0.8)' },
          '50%': { transform: 'rotate(180deg)', borderTopColor: 'rgba(16, 185, 129, 0.8)', borderRightColor: 'rgba(16, 185, 129, 0.4)' },
          '75%': { borderTopColor: 'rgba(16, 185, 129, 0.4)', borderRightColor: 'rgba(16, 185, 129, 0.8)' },
          '100%': { transform: 'rotate(360deg)', borderTopColor: 'rgba(16, 185, 129, 0.8)', borderRightColor: 'rgba(16, 185, 129, 0.4)' },
        },
      },
    },
  },
  plugins: [],
  corePlugins: {
    preflight: false, // Disable default Tailwind preflight to avoid conflicts with React Native
  },
}
