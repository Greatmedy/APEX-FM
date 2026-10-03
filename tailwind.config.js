/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: { ink: '#07111F', navy: '#0E1C33', pitch: '#14F195', gold: '#E2B657', danger: '#E11D48' },
      fontFamily: { display: ['Oswald', 'Barlow Condensed', 'Impact', 'sans-serif'], sans: ['Manrope', 'system-ui', 'sans-serif'] },
      boxShadow: { glow: '0 0 0 1px rgba(20,241,149,.35), 0 0 24px rgba(20,241,149,.18)', gold: '0 6px 24px rgba(226,182,87,.25)' },
    },
  },
  plugins: [],
};
