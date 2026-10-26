/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#090b10',
          900: '#10141b',
          800: '#171d27',
          700: '#222a38',
          600: '#313b4e',
        },
        mist: {
          50: '#f5f7fb',
          200: '#d5deea',
          300: '#b7c3d4',
          400: '#93a0b5',
          500: '#7d8ba0',
        },
        acid: '#e7f56a',
        mint: '#5ee0b5',
        sky: '#8eb6ff',
        amber: '#f0b429',
        rose: '#ff6b81',
      },
      fontFamily: {
        sans: ['Figtree', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Syne', 'Figtree', 'ui-sans-serif', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        panel: '0 24px 60px rgba(0, 0, 0, 0.28)',
      },
    },
  },
  plugins: [],
};
