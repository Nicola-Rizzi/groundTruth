/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./stories/**/*.{ts,tsx}",
    "../../packages/acme-ui/src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand:    { DEFAULT: "#6D28D9", hover: "#5B21B6", foreground: "#FFFFFF", accent: "#D97706", "accent-fg": "#FFFFFF" },
        surface:  { DEFAULT: "#FAFAF9", card: "#FFFFFF", subtle: "#F5F5F4" },
        text:     { DEFAULT: "#1C1917", muted: "#78716C" },
        border:   { DEFAULT: "#D6D3D1", focus: "#6D28D9" },
        feedback: { error: "#B91C1C", success: "#15803D" },
      },
      borderRadius: { sm: "6px", md: "10px", lg: "14px", full: "9999px" },
      boxShadow: {
        sm: "0 1px 3px rgba(0,0,0,0.08)",
        md: "0 4px 8px rgba(0,0,0,0.10)",
      },
    },
  },
  plugins: [],
}
