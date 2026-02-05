// ============================================================
// Root Layout
// ============================================================
// Vissocial - AI Instagram Content Platform
// Global layout with Inter font and design system
// ============================================================

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Vissocial - AI Instagram Content Platform",
  description:
    "AI that plans, creates, and improves your Instagram content. Create your next 30 days of posts automatically.",
  keywords: ["Instagram", "AI", "Content Creation", "Social Media", "Marketing"],
  authors: [{ name: "Vissocial" }],
  openGraph: {
    title: "Vissocial - AI Instagram Content Platform",
    description:
      "Create your next 30 days of posts automatically from your existing profile.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={`${inter.className} antialiased`}>
        {children}
      </body>
    </html>
  );
}
