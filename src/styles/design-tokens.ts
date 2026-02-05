// ============================================================
// VISSOCIAL DESIGN TOKENS
// ============================================================
// Centralizirani design tokeni za konzistentan izgled aplikacije.
// Bazirano na Contently dizajnu - lavanda pozadina, Å¾uti akcenti.
// ============================================================

export const colors = {
  // Primary - Yellow accent color
  primary: {
    50: "#FFFDE7",
    100: "#FFF8E1",
    200: "#FFECB3",
    300: "#FFE082",
    400: "#FFD54F",
    500: "#FFCA28", // Main primary
    600: "#FFB300",
    700: "#FFA000",
    800: "#FF8F00",
    900: "#FF6F00",
  },

  // Background - Lavender/Purple tint
  background: {
    primary: "#F8F7FF",    // Main app background
    secondary: "#F4F3FF",  // Slightly darker sections
    tertiary: "#EBE9FE",   // Even darker for contrast
    card: "#FFFFFF",       // Card backgrounds
    overlay: "rgba(0, 0, 0, 0.5)", // Modal overlays
  },

  // Text colors
  text: {
    primary: "#1F2937",    // Main text
    secondary: "#6B7280",  // Muted text
    tertiary: "#9CA3AF",   // Even more muted
    inverse: "#FFFFFF",    // Text on dark backgrounds
    link: "#7C3AED",       // Links (purple)
    linkHover: "#6D28D9",  // Link hover
  },

  // Border colors
  border: {
    light: "#E5E7EB",      // Light borders
    medium: "#D1D5DB",     // Medium borders
    dark: "#9CA3AF",       // Dark borders
    focus: "#FFCA28",      // Focus ring (primary)
  },

  // Semantic colors
  semantic: {
    success: {
      light: "#D1FAE5",
      main: "#10B981",
      dark: "#059669",
    },
    warning: {
      light: "#FEF3C7",
      main: "#F59E0B",
      dark: "#D97706",
    },
    error: {
      light: "#FEE2E2",
      main: "#EF4444",
      dark: "#DC2626",
    },
    info: {
      light: "#DBEAFE",
      main: "#3B82F6",
      dark: "#2563EB",
    },
  },

  // Instagram gradient (for branding)
  instagram: {
    gradient: "linear-gradient(45deg, #F58529, #DD2A7B, #8134AF, #515BD4)",
  },
} as const;

export const typography = {
  // Font families
  fontFamily: {
    sans: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    mono: '"JetBrains Mono", "Fira Code", Consolas, monospace',
  },

  // Font sizes
  fontSize: {
    xs: "0.75rem",     // 12px
    sm: "0.875rem",    // 14px
    base: "1rem",      // 16px
    lg: "1.125rem",    // 18px
    xl: "1.25rem",     // 20px
    "2xl": "1.5rem",   // 24px
    "3xl": "1.875rem", // 30px
    "4xl": "2.25rem",  // 36px
    "5xl": "3rem",     // 48px
  },

  // Font weights
  fontWeight: {
    normal: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
  },

  // Line heights
  lineHeight: {
    tight: "1.25",
    normal: "1.5",
    relaxed: "1.75",
  },

  // Letter spacing
  letterSpacing: {
    tight: "-0.025em",
    normal: "0",
    wide: "0.025em",
  },
} as const;

export const spacing = {
  0: "0",
  1: "0.25rem",   // 4px
  2: "0.5rem",    // 8px
  3: "0.75rem",   // 12px
  4: "1rem",      // 16px
  5: "1.25rem",   // 20px
  6: "1.5rem",    // 24px
  8: "2rem",      // 32px
  10: "2.5rem",   // 40px
  12: "3rem",     // 48px
  16: "4rem",     // 64px
  20: "5rem",     // 80px
  24: "6rem",     // 96px
} as const;

export const borderRadius = {
  none: "0",
  sm: "0.25rem",    // 4px
  md: "0.5rem",     // 8px
  lg: "0.75rem",    // 12px
  xl: "1rem",       // 16px
  "2xl": "1.5rem",  // 24px
  full: "9999px",   // Pill shape
} as const;

export const shadows = {
  none: "none",
  sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
  md: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
  lg: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
  xl: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
  card: "0 2px 8px rgba(0, 0, 0, 0.08)",
  cardHover: "0 4px 16px rgba(0, 0, 0, 0.12)",
  button: "0 2px 4px rgba(0, 0, 0, 0.1)",
} as const;

export const transitions = {
  fast: "150ms ease-in-out",
  normal: "200ms ease-in-out",
  slow: "300ms ease-in-out",
} as const;

export const breakpoints = {
  sm: "640px",
  md: "768px",
  lg: "1024px",
  xl: "1280px",
  "2xl": "1536px",
} as const;

export const zIndex = {
  dropdown: 1000,
  sticky: 1020,
  fixed: 1030,
  modalBackdrop: 1040,
  modal: 1050,
  popover: 1060,
  tooltip: 1070,
} as const;

// ============================================================
// TAILWIND CLASS MAPPINGS
// ============================================================
// Pre-defined class combinations for common patterns

export const componentStyles = {
  // Buttons
  button: {
    base: "inline-flex items-center justify-center font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed",
    primary: "bg-primary-500 text-text-primary hover:bg-primary-600 focus:ring-primary-500 shadow-button",
    secondary: "bg-white text-text-primary border border-border-light hover:bg-gray-50 focus:ring-primary-500",
    ghost: "text-text-secondary hover:text-text-primary hover:bg-gray-100",
    sizes: {
      sm: "px-3 py-1.5 text-sm rounded-lg",
      md: "px-4 py-2 text-sm rounded-xl",
      lg: "px-6 py-3 text-base rounded-xl",
    },
  },

  // Chips
  chip: {
    base: "inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full transition-all duration-200 cursor-pointer select-none border",
    default: "bg-white text-text-primary border-border-light hover:border-border-medium hover:shadow-sm",
    selected: "bg-primary-100 text-text-primary border-primary-500",
    recommended: "bg-primary-100 text-text-primary border-primary-500",
  },

  // Cards
  card: {
    base: "bg-white rounded-2xl shadow-card",
    padding: {
      sm: "p-4",
      md: "p-6",
      lg: "p-8",
    },
  },

  // Inputs
  input: {
    base: "w-full px-4 py-3 text-text-primary bg-white border border-border-light rounded-xl transition-all duration-200 placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent",
  },

  // Chat bubbles
  chatBubble: {
    assistant: "bg-white rounded-2xl shadow-card",
    user: "bg-gray-100 text-text-primary rounded-2xl ml-auto",
  },
} as const;

// ============================================================
// EXPORT ALL
// ============================================================

export const designTokens = {
  colors,
  typography,
  spacing,
  borderRadius,
  shadows,
  transitions,
  breakpoints,
  zIndex,
  componentStyles,
} as const;

export default designTokens;
