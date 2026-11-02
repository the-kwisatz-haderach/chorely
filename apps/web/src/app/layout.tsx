import type { ReactNode } from "react";
import type { Viewport } from "next";
import "../ui/tokens.css";
import "../ui/base.css";

export const metadata = { title: "Chorely" };

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
