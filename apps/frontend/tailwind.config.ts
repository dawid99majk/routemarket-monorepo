import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
        narrow: ['Archivo Narrow', 'Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        "display": ["2.25rem", { lineHeight: "2.5rem", fontWeight: "800" }],
        "h1": ["1.875rem", { lineHeight: "2.25rem", fontWeight: "700", letterSpacing: "-0.025em" }],
        "h2": ["1.5rem", { lineHeight: "2rem", fontWeight: "600", letterSpacing: "-0.025em" }],
        "h3": ["1.25rem", { lineHeight: "1.75rem", fontWeight: "600" }],
        "body": ["1rem", { lineHeight: "1.625" }],
        "body-sm": ["0.875rem", { lineHeight: "1.25rem" }],
        "caption": ["0.75rem", { lineHeight: "1rem" }],
      },
      spacing: {
        "1": "0.25rem",   // 4px
        "2": "0.5rem",    // 8px
        "3": "0.75rem",   // 12px
        "4": "1rem",      // 16px
        "6": "1.5rem",    // 24px
        "8": "2rem",      // 32px
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        danger: {
          DEFAULT: "hsl(var(--danger))",
          foreground: "hsl(var(--danger-foreground))",
        },
        neutral: {
          DEFAULT: "hsl(var(--neutral))",
          foreground: "hsl(var(--neutral-foreground))",
        },
        forest: {
          DEFAULT: "hsl(var(--forest))",
          foreground: "hsl(var(--forest-foreground))",
        },
        "forest-deep": {
          DEFAULT: "hsl(var(--forest-deep))",
          foreground: "hsl(var(--forest-deep-foreground))",
        },
        "burnt-orange": {
          DEFAULT: "hsl(var(--burnt-orange))",
          foreground: "hsl(var(--burnt-orange-foreground))",
        },
        sage: {
          DEFAULT: "hsl(var(--sage))",
          foreground: "hsl(var(--sage-foreground))",
        },
        "dusty-blue": {
          DEFAULT: "hsl(var(--dusty-blue))",
          foreground: "hsl(var(--dusty-blue-foreground))",
        },
        tan: {
          DEFAULT: "hsl(var(--tan))",
          foreground: "hsl(var(--tan-foreground))",
        },
        moss: {
          DEFAULT: "hsl(var(--moss))",
          foreground: "hsl(var(--moss-foreground))",
        },
        ink: {
          DEFAULT: "hsl(var(--ink))",
        },
        paper: {
          DEFAULT: "hsl(var(--surface))",
          card: "hsl(var(--surface-card))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius-lg)",
        md: "var(--radius-md)",
        sm: "var(--radius-sm)",
        xl: "var(--radius-xl)",
        full: "var(--radius-full)",
      },
      boxShadow: {
        "token-xs": "var(--shadow-xs)",
        "token-sm": "var(--shadow-sm)",
        "token-md": "var(--shadow-md)",
        "token-lg": "var(--shadow-lg)",
        "token-xl": "var(--shadow-xl)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
