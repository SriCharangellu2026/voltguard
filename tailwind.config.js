/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Cascadia Code"', 'Consolas', 'monospace'],
      },
      colors: {
        steel: {
          950: '#07090c',
          900: '#0d1117',
          850: '#121821',
          800: '#18202b',
          700: '#232e3c',
          600: '#334155',
        },
        hazard: {
          yellow: '#facc15',
          orange: '#f97316',
          red: '#ef4444',
        },
      },
      backgroundImage: {
        'hazard-stripes':
          'repeating-linear-gradient(-45deg, #facc15 0 12px, #0d1117 12px 24px)',
      },
    },
  },
  plugins: [],
};
