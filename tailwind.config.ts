import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      fontFamily: {
        bangla: ["var(--font-hind-siliguri)", "Hind Siliguri", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(15 23 42 / 0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
