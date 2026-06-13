/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Geist"', '"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        display: ['"Geist"', '"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        apple: {
          bg: '#f2f2f7',
          surface: '#ffffff',
          text: '#1d1d1f',
          label: '#6e6e73',
          muted: '#86868b',
          border: 'rgba(0,0,0,0.08)',
          fill: '#ebebf0',
          'fill-hover': '#e0e0e5',
          highlight: '#f0f4ff',
          'highlight-strong': '#e4ecff',
          shell: 'rgba(0,0,0,0.04)',
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
        apple: '14px',
        'apple-lg': '20px',
        'apple-xl': '28px',
        bezel: '2rem',
      },
      boxShadow: {
        apple:
          '0 1px 2px rgba(0,0,0,0.02), 0 4px 16px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.03)',
        'apple-md':
          '0 2px 8px rgba(0,0,0,0.03), 0 12px 40px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
        'apple-lg':
          '0 4px 16px rgba(0,0,0,0.04), 0 24px 64px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.05)',
        ambient:
          '0 32px 64px -12px rgba(0,0,0,0.08), 0 16px 32px -8px rgba(0,0,0,0.04)',
        inset:
          'inset 0 1px 1px rgba(255,255,255,0.6), inset 0 -1px 1px rgba(0,0,0,0.04)',
      },
      letterSpacing: {
        tightest: '-0.028em',
        eyebrow: '0.2em',
      },
      transitionTimingFunction: {
        premium: 'cubic-bezier(0.32, 0.72, 0, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      transitionDuration: {
        premium: '700ms',
      },
      backdropBlur: {
        glass: '40px',
      },
    },
  },
  plugins: [],
};
