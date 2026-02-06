// ============================================================
// Root Layout
// ============================================================
// Vissocial - AI Instagram Content Platform
// Global layout with design system and shared navigation
// ============================================================

import type { Metadata } from "next";
import "./globals.css";
import AppHeader from "@/ui/AppHeader";

export const metadata: Metadata = {
  title: "Vissocial - AI Instagram Content Platform",
  description: "AI that plans, creates, and improves your Instagram content. Create your next 30 days of posts automatically.",
  keywords: ["Instagram", "AI", "Content Creation", "Social Media", "Marketing"],
  authors: [{ name: "Vissocial" }],
  openGraph: {
    title: "Vissocial - AI Instagram Content Platform",
    description: "Create your next 30 days of posts automatically from your existing profile.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="antialiased">
        {/* Shared navigation header — hides on / and /chat automatically */}
        <AppHeader />
        {children}
      </body>
    </html>
  );
}
