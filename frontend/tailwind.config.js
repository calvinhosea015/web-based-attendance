/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          '"SF Pro Display"',
          'system-ui',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      colors: {
        apple: {
          bg: '#f5f5f7',
          surface: '#ffffff',
          text: '#1d1d1f',
          label: '#6e6e73',
          muted: '#86868b',
          border: '#d2d2d7',
          fill: 'rgba(0, 0, 0, 0.04)',
          'fill-hover': 'rgba(0, 0, 0, 0.06)',
        },
        brand: {
          50: '#f0f7ff',
          100: '#e8f2ff',
          500: '#0077ed',
          600: '#0071e3',
          700: '#0066cc',
          900: '#1d1d1f',
        },
      },
      borderRadius: {
        apple: '12px',
        'apple-lg': '18px',
        'apple-xl': '22px',
      },
      boxShadow: {
        apple: '0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)',
        'apple-md': '0 4px 24px rgba(0, 0, 0, 0.06)',
        'apple-lg': '0 12px 40px rgba(0, 0, 0, 0.08)',
      },
      letterSpacing: {
        tightest: '-0.022em',
      },
    },
  },
  plugins: [],
};
