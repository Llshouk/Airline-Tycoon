import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#102026",
        runway: "#f4f7f7",
        jet: "#18545c",
        sky: "#6fa8dc",
        coral: "#d76745",
        mint: "#4f9d7e"
      },
      boxShadow: {
        soft: "0 12px 28px rgba(16, 32, 38, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
