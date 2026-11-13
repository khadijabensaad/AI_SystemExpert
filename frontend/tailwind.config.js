/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { 950: "#060a14", 900: "#0B1120", 800: "#111a2e", 700: "#1a2540" },
        teal: { DEFAULT: "#00D1C1", 400: "#2ee6d7", 600: "#00a89b" },
        electric: "#38BDF8",
        violet: { DEFAULT: "#8B5CF6", 400: "#a78bfa" },
        lvl: { self: "#22c55e", routine: "#eab308", urgent: "#f97316", emergency: "#ef4444" },
      },
      fontFamily: {
        sans: ["Manrope", "Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 24px -6px rgba(0,209,193,0.45)",
        "glow-violet": "0 0 24px -6px rgba(139,92,246,0.5)",
      },
    },
  },
  plugins: [],
};
