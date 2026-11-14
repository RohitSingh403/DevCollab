/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#f4f2ee',
        ink: '#1c1917',
        muted: '#57534e',
        faint: '#a8a29e',
        line: '#e7e5e4',
        sidebar: '#1c1917',
        brand: {
          DEFAULT: '#1d4ed8',
          hover: '#1e40af',
          soft: '#e8eefc',
        },
        danger: '#b42318',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        pop: '0 16px 40px rgba(28, 25, 23, 0.16)',
        card: '0 1px 2px rgba(28, 25, 23, 0.05), 0 8px 20px rgba(28, 25, 23, 0.04)',
      },
    },
  },
  plugins: [],
};
