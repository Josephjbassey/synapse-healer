import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
      colors: {
        obsidian: {
          950: "#060709", // Deep obsidian background canvas
          900: "#0C0E12", // Primary container surfaces
          850: "#11141A", // Card & code well background
          800: "#161A22", // Card hover state
          750: "#1E232E", // Elevated borders / dividers
          700: "#2B3240", // Muted interactive borders
        },
        carbon: {
          950: "#060709", // App canvas background
          900: "#0C0E12", // Primary container surfaces
          850: "#11141A", // Card & code well background
          800: "#161A22", // Card hover state
          750: "#1E232E", // Elevated borders / dividers
          700: "#2B3240", // Muted interactive borders
        },
        synapse: {
          cyan: "#38BDF8",
          indigo: "#6366F1",
          violet: "#A78BFA",
          emerald: "#10B981",
          amber: "#F59E0B",
          rose: "#F43F5E",
        },
      },
      boxShadow: {
        subtle: "0 1px 2px 0 rgba(0, 0, 0, 0.4)",
        card: "inset 0 1px 0 0 rgba(255, 255, 255, 0.05), 0 4px 20px -2px rgba(0, 0, 0, 0.5)",
        highlight: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)",
        glowCyan: "0 0 25px -5px rgba(56, 189, 248, 0.25)",
        glowIndigo: "0 0 25px -5px rgba(99, 102, 241, 0.25)",
        glowViolet: "0 0 25px -5px rgba(167, 139, 250, 0.25)",
        glowEmerald: "0 0 25px -5px rgba(16, 185, 129, 0.25)",
      },
    },
  },
  plugins: [],
};
export default config;
