import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './modules/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Design tokens de marca (paleta ICONIC oficial). El nombre visible del
        // producto es "Presupuestos"; estos tokens son swappables por tenant.
        brand: {
          50: '#e8f1fd',
          100: '#c7dced', // softBlueGray ICONIC
          200: '#9fcbf5',
          300: '#5aa6f0',
          400: '#1e7fe0',
          500: '#005dd6', // azul ICONIC principal
          600: '#0050bc',
          700: '#013e97',
          800: '#012e73',
          900: '#020148', // navy profundo ICONIC
        },
        iconic: {
          primary: '#005DD6',
          accent: '#00B8FF', // cian de acento
          navy: '#020148',
          graphite: '#1B1F3E',
          soft: '#C7DCED',
          light: '#F2F4F7',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '0.375rem',
      },
    },
  },
  plugins: [],
};

export default config;
