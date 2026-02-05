import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/ui/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      /* ============================================================
         FONT FAMILY
         ============================================================ */
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "Fira Code",
          "Consolas",
          "Monaco",
          "Courier New",
          "monospace",
        ],
      },

      /* ============================================================
         COLORS
         ============================================================
         Primary (yellow/gold) — CTA buttons, accents, selection
         Lavender — app background, gradient overlays
         Success/Warning/Error/Info — semantic feedback
         ============================================================ */
      colors: {
        // Primary - Yellow/Gold accent
        primary: {
          50: "#FFFDE7",
          100: "#FFF8E1",
          200: "#FFECB3",
          300: "#FFE082",
          400: "#FFD54F",
          500: "#FFCA28",
          600: "#FFB300",
          700: "#FFA000",
          800: "#FF8F00",
          900: "#FF6F00",
        },

        // Lavender - Background tones
        lavender: {
          50: "#FDFCFF",
          100: "#F8F7FF",
          200: "#F4F3FF",
          300: "#EBE9FE",
          400: "#DDD9FE",
          500: "#C4B5FD",
        },

        // Success
        success: {
          50: "#f0fdf4",
          100: "#dcfce7",
          500: "#22c55e",
          600: "#16a34a",
        },

        // Warning
        warning: {
          50: "#fffbeb",
          100: "#fef3c7",
          500: "#f59e0b",
          600: "#d97706",
        },

        // Error
        error: {
          50: "#fef2f2",
          100: "#fee2e2",
          500: "#ef4444",
          600: "#dc2626",
        },

        // Info
        info: {
          50: "#eff6ff",
          100: "#dbeafe",
          500: "#3b82f6",
          600: "#2563eb",
        },
      },

      /* ============================================================
         BOX SHADOW
         ============================================================ */
      boxShadow: {
        card: "0 2px 8px rgba(0, 0, 0, 0.08)",
        "card-hover": "0 4px 16px rgba(0, 0, 0, 0.12)",
        button: "0 2px 4px rgba(0, 0, 0, 0.1)",
        chat: "0 4px 20px -2px rgba(0, 0, 0, 0.08)",
      },

      /* ============================================================
         ANIMATIONS & KEYFRAMES
         ============================================================ */
      animation: {
        "fade-in": "fadeIn 0.3s ease-in-out",
        "fade-in-up": "fadeInUp 0.4s ease-out",
        "slide-in-right": "slideInRight 0.3s ease-out",
        "scale-in": "scaleIn 0.2s ease-out",
        shimmer: "shimmer 2s linear infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideInRight: {
          "0%": { opacity: "0", transform: "translateX(10px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
