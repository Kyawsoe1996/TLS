import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TLS — AI Growth Platform for Tailor Shops",
  description: "AI marketing, SEO, analytics, and business insights for tailor shops.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
