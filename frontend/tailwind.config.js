/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Geist"', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', '"Geist"', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        // Refined, tighter type scale tuned for a dense daily tool.
        'display-lg': ['40px', { lineHeight: '1.05', letterSpacing: '-0.028em' }],
        display: ['32px', { lineHeight: '1.08', letterSpacing: '-0.026em' }],
        'display-sm': ['24px', { lineHeight: '1.15', letterSpacing: '-0.02em' }],
        title: ['19px', { lineHeight: '1.25', letterSpacing: '-0.015em' }],
      },
      colors: {
        apple: {
          bg: '#f5f5f7',
          surface: '#ffffff',
          text: '#1d1d1f',
          label: '#62626a',
          muted: '#8a8a91',
          border: 'rgba(0,0,0,0.08)',
          fill: '#ececed',
          'fill-hover': '#e2e2e4',
          highlight: '#eef3fb',
          'highlight-strong': '#e1ebfa',
          shell: 'rgba(0,0,0,0.028)',
        },
        // Calmer, slightly deeper and less saturated than iOS neon blue.
        brand: {
          50: '#f1f6fd',
          100: '#e2ecfa',
          200: '#c6d9f4',
          500: '#3a76d8',
          600: '#2563c9',
          700: '#1f54ad',
          900: '#1d1d1f',
        },
      },
      borderRadius: {
        apple: '12px',
        'apple-lg': '16px',
        'apple-xl': '22px',
        bezel: '1.5rem',
      },
      boxShadow: {
        // Flatter, softer elevation — depth without the glossy iOS sheen.
        apple:
          '0 1px 2px rgba(0,0,0,0.03), 0 1px 8px rgba(0,0,0,0.03)',
        'apple-md':
          '0 2px 6px rgba(0,0,0,0.04), 0 8px 28px rgba(0,0,0,0.05)',
        'apple-lg':
          '0 4px 12px rgba(0,0,0,0.05), 0 18px 48px rgba(0,0,0,0.07)',
        ambient:
          '0 24px 56px -16px rgba(0,0,0,0.07), 0 12px 24px -8px rgba(0,0,0,0.04)',
        inset:
          'inset 0 1px 0 rgba(255,255,255,0.5)',
      },
      letterSpacing: {
        tightest: '-0.028em',
        eyebrow: '0.16em',
      },
      transitionTimingFunction: {
        premium: 'cubic-bezier(0.32, 0.72, 0, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      transitionDuration: {
        fast: '200ms',
        medium: '400ms',
        premium: '700ms',
      },
      backdropBlur: {
        glass: '40px',
      },
    },
  },
  plugins: [],
};
