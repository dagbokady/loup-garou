/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        nuit: { 950: '#070a1a', 900: '#0b1030', 800: '#121a45', 700: '#1c2660', 600: '#2a3680' },
        mystic: { 900: '#1e0f33', 800: '#2d1650', 700: '#43207a', 600: '#5b2ea3', 500: '#7c4dcc', 400: '#a07ce6' },
        foret: { 900: '#0b1f17', 800: '#123326', 700: '#1b4a37', 600: '#24624a', 500: '#2f7d5e', 400: '#4fa383' },
        or: { 100: '#fbf1d3', 200: '#f3dfa2', 300: '#e9c96f', 400: '#d9ad45', 500: '#b98b2b', 600: '#8f6a1f', 700: '#5e4513' },
        parchemin: { 50: '#fbf6ea', 100: '#f3e9cf', 200: '#e6d4a8', 300: '#d1b77c' },
        sang: { 500: '#b3323a', 600: '#8e2128', 700: '#5f141a' },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'system-ui', 'sans-serif'],
        display: ['Inter', '-apple-system', 'system-ui', 'sans-serif'],
        title: ['Inter', '-apple-system', 'system-ui', 'sans-serif'],
        body: ['Inter', '-apple-system', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
      boxShadow: {
        glow: '0 4px 12px rgba(0, 0, 0, 0.25)',
        'glow-violet': '0 4px 12px rgba(0, 0, 0, 0.25)',
        inset: 'inset 0 0 40px rgba(0,0,0,0.55)',
      },
      borderRadius: { xs: '4px', sm: '6px', md: '8px', lg: '8px', xl: '12px', '2xl': '16px', '3xl': '24px' },
      keyframes: {
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
        flicker: { '0%,100%': { opacity: '0.9' }, '45%': { opacity: '0.65' }, '55%': { opacity: '1' } },
        rise: { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        drift: { from: { transform: 'translateY(0) translateX(0)' }, to: { transform: 'translateY(-110vh) translateX(30px)' } },
      },
      animation: {
        float: 'float 5s ease-in-out infinite',
        flicker: 'flicker 3s ease-in-out infinite',
        rise: 'rise .45s ease-out both',
      },
    },
  },
  plugins: [],
};
