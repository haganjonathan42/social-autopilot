import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "social-autopilot",
  description: "Collect, review and publish daily social posts.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
