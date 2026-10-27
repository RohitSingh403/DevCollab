/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#f6f7f9',
        ink: '#121417',
        muted: '#5f6773',
        faint: '#8b929c',
        line: '#e6e8ec',
        brand: {
          DEFAULT: '#1f4b99',
          hover: '#173a78',
          soft: '#eef3fb',
        },
        danger: '#b42318',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        pop: '0 12px 32px rgba(18, 20, 23, 0.12)',
        card: '0 1px 2px rgba(18, 20, 23, 0.04)',
      },
    },
  },
  plugins: [],
};
