import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LP Draft QA Scanner",
  description: "Pre-QA guidance tool for Luxury Presence Website Builders",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
