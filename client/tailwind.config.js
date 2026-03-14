/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        felt: {
          DEFAULT: '#1a5c2a',
          dark: '#0f3a19',
          light: '#2a7a3a',
        },
        gold: {
          DEFAULT: '#d4af37',
          light: '#f0d060',
          dark: '#a88a20',
        },
        navy: '#1a2340',
        cream: '#fef9ed',
      },
      fontFamily: {
        serif: ['Georgia', 'Cambria', 'Times New Roman', 'serif'],
      },
    },
  },
  plugins: [],
};
