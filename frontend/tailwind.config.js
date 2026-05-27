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
          50: '#f8f4ee',
          100: '#efe3d4',
          500: '#8b6b3f',
          600: '#735533',
          900: '#2f2720',
        },
      },
    },
  },
  plugins: [],
};
