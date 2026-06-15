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
        // Tokens de marca — paleta ICONIC oficial (ver docs/branding).
        // Nombre visible del producto: "Presupuestos"; swappable por tenant.
        brand: {
          50: '#e8f1fd',
          100: '#c7dced', // soft-blue ICONIC
          200: '#9fcbf5',
          300: '#5aa6f0',
          400: '#1e7fe0',
          500: '#005dd6', // iconic-primary
          600: '#0050bc',
          700: '#013e97',
          800: '#012e73',
          900: '#020148', // iconic-ink (azul noche)
        },
        iconic: {
          primary: '#005DD6',
          cyan: '#00B8FF',
          ink: '#020148',
          graphite: '#1B1F3E',
          'soft-blue': '#C7DCED',
          gray: '#F2F4F7',
          white: '#FFFFFF',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '0.375rem',
      },
      // Aditivo (no altera utilidades existentes): elevación sutil para superficies
      // premium del shell (menús/cards). Uso opcional vía `shadow-iconic`.
      boxShadow: {
        iconic: '0 1px 2px rgba(2,1,72,0.04), 0 8px 24px -8px rgba(2,1,72,0.12)',
      },
    },
  },
  plugins: [],
};

export default config;
