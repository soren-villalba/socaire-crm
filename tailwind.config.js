/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#FAF6F1',
          100: '#F5EFE6', // crema
          200: '#E6D8C3', // arena
          400: '#B08D5B', // bronce
          600: '#6B4F3A', // café
          700: '#5A4231',
          800: '#3E2C20', // café oscuro
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'],
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(28,25,23,0.04), 0 1px 3px rgba(28,25,23,0.06)',
        pop: '0 10px 30px rgba(28,25,23,0.12)',
      },
    },
  },
  plugins: [],
}
