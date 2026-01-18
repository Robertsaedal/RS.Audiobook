/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./index.tsx",
    "./App.tsx",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'aether-purple': '#9D50BB',
        'aether-dark': '#6E48AA',
      },
      fontFamily: {
        'mono-timer': ['"Roboto Mono"', 'monospace'],
      },
      animation: {
        'slide-up': 'slide-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'tap-pop': 'tap-pop 0.2s cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
        'fade-in': 'fade-in 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
      },
      keyframes: {
        'slide-up': {
          'from': { transform: 'translateY(100%)', opacity: '0' },
          'to': { transform: 'translateY(0)', opacity: '1' },
        },
        'tap-pop': {
          '0%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.1)' },
          '100%': { transform: 'scale(1)' },
        },
        'fade-in': {
          'from': { opacity: '0', transform: 'translateX(10px)' },
          'to': { opacity: '1', transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
}
