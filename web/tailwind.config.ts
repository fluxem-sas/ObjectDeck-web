import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)"
      },
      colors: {
        "od-background": "#f7f9fb",
        "od-surface": "#ffffff",
        "od-surface-low": "#f2f4f6",
        "od-surface-container": "#eceef0",
        "od-surface-high": "#e6e8ea",
        "od-surface-highest": "#e0e3e5",
        "od-text": "#191c1e",
        "od-text-muted": "#464554",
        "od-outline": "#767586",
        "od-outline-variant": "#c7c4d7",
        "od-primary": "#4648d4",
        "od-primary-strong": "#6063ee",
        "od-secondary": "#565e74",
        "od-secondary-container": "#dae2fd",
        "od-error": "#ba1a1a",
        "od-error-container": "#ffdad6",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))"
      }
    }
  },
  plugins: [tailwindcssAnimate]
};

export default config;
