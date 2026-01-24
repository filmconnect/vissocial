import type { Config } from "tailwindcss";
export default {
  content: ["./src/app/**/*.{ts,tsx}","./src/ui/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: []
} satisfies Config;
