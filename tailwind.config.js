/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        darkBg: '#0B0F17',
        darkCard: '#131B2A',
        darkBorder: '#1E293B',
        darkText: '#F8FAFC',
        darkMuted: '#94A3B8',
        brandPrimary: '#0052FF',
        brandAccent: '#10B981',
        brandWarning: '#F59E0B',
        brandDanger: '#EF4444',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
