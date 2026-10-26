/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#f4f5f7',
        ink: '#1c2128',
        muted: '#5c6570',
        faint: '#8b939e',
        line: '#e2e5ea',
        brand: {
          DEFAULT: '#1d4f91',
          hover: '#163e73',
          soft: '#e8f0fa',
        },
        sidebar: '#1a2332',
        danger: '#b42318',
      },
      fontFamily: {
        sans: ['Source Sans 3', 'Segoe UI', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        pop: '0 8px 24px rgba(23, 32, 48, 0.12)',
      },
    },
  },
  plugins: [],
};
