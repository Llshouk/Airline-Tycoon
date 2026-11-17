import type { Config } from "tailwindcss";

// Visual language: airport wayfinding. Deep apron navy for chrome, signal yellow for the one
// thing you should look at, chart-paper surfaces for dense data, airway magenta for the network.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#12263a",
        runway: "#edf1f5",
        jet: "#1b4f8f",
        sky: "#7fb2e5",
        coral: "#c2362b",
        mint: "#15805a",
        apron: { DEFAULT: "#0d2137", light: "#16324f", line: "#274566" },
        sign: { DEFAULT: "#ffc629", deep: "#f0b400", soft: "#fff4cf" },
        airway: "#b7127b",
        caution: "#b86e00",
        // Neutral scale tinted towards apron navy so greys sit with the chrome instead of fighting it.
        slate: {
          50: "#f5f7fa", 100: "#e9eef3", 200: "#d6dee7", 300: "#bcc8d5", 400: "#8d9cae",
          500: "#5f7084", 600: "#465669", 700: "#324357", 800: "#1e3147", 900: "#12263a", 950: "#0a1a2c"
        }
      },
      fontFamily: {
        sans: ["Barlow", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Barlow Semi Condensed", "Barlow", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", "sans-serif"]
      },
      fontWeight: { semibold: "600", bold: "600", extrabold: "700", black: "700" },
      borderRadius: { sm: "2px", DEFAULT: "3px", md: "4px", lg: "6px" },
      boxShadow: {
        soft: "0 1px 2px rgba(13, 33, 55, 0.06)",
        lift: "0 10px 30px rgba(13, 33, 55, 0.18)"
      }
    }
  },
  plugins: []
};

export default config;
