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
          50: '#f0f7ff',
          100: '#dceefc',
          500: '#2563eb',
          600: '#1d4ed8',
          900: '#0f172a',
        },
      },
    },
  },
  plugins: [],
};
