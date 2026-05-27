/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#fef8f3',
          100: '#fde8d8',
          500: '#d97706',
          600: '#b45309',
          700: '#92400e',
          900: '#78350f',
        },
      },
    },
  },
  plugins: [],
};
