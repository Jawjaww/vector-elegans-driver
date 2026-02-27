module.exports = {
  content: [
    './App.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
    './app/**/*.{js,jsx,ts,tsx}',
  ],
  presets: ['nativewind/preset'],
  theme: {
    extend: {
      colors: {
        primary: '#4a77a8',
        'primary-dark': '#395f84',
        accent: '#4a77a8',
        background: '#0b1220',
        'bg-start': '#0b1220',
        'bg-mid': '#041428',
        'bg-end': '#041428',
        surface: 'rgba(255, 255, 255, 0.02)',
        'surface-light': 'rgba(255, 255, 255, 0.06)',
        'surface-heavy': 'rgba(255, 255, 255, 0.12)',
        border: 'rgba(255, 255, 255, 0.06)',
        'neon-green': '#05c46b',
        'neon-green-light': '#9efbd1',
        'neon-green-bright': '#10ff8c',
        bordeaux: '#7c2230',
        'bordeaux-icon': '#a0303a',
        'elegant-bg-start': '#0b1220',
        'elegant-bg-mid': '#041428',
        'elegant-bg-end': '#041428',
        'elegant-accent': '#4a77a8',
        'elegant-accent-600': '#395f84',
      },
      fontFamily: {
        sans: ['System'],
      },
      boxShadow: {
        'glass': '0 8px 24px rgba(2, 6, 23, 0.55)',
        'glass-modal': 'inset 0 1px 0 rgba(255, 255, 255, 0.01), 0 12px 36px rgba(2, 6, 23, 0.5)',
        'glass-card': '0 6px 18px rgba(2, 6, 23, 0.45)',
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
          '0%': { transform: 'rotate(0deg)', borderTopColor: 'rgba(59, 130, 246, 0.8)', borderRightColor: 'rgba(59, 130, 246, 0.4)' },
          '25%': { borderTopColor: 'rgba(59, 130, 246, 1)', borderRightColor: 'rgba(59, 130, 246, 0.8)' },
          '50%': { transform: 'rotate(180deg)', borderTopColor: 'rgba(59, 130, 246, 0.8)', borderRightColor: 'rgba(59, 130, 246, 0.4)' },
          '75%': { borderTopColor: 'rgba(59, 130, 246, 0.4)', borderRightColor: 'rgba(59, 130, 246, 0.8)' },
          '100%': { transform: 'rotate(360deg)', borderTopColor: 'rgba(59, 130, 246, 0.8)', borderRightColor: 'rgba(59, 130, 246, 0.4)' },
        },
      },
    },
  },
  plugins: [],
};
