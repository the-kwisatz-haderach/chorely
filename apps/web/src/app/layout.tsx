import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import "../ui/tokens.css";
import "../ui/base.css";
import { OfflineNotice } from "./offline-notice";
import { ServiceWorker } from "./service-worker";
import { DARK_BG, LIGHT_BG } from "./theme-colors";

export const metadata: Metadata = {
  title: "Chorely",
  icons: { icon: "/icons/icon.svg", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { title: "Chorely" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: LIGHT_BG },
    { media: "(prefers-color-scheme: dark)", color: DARK_BG },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ServiceWorker />
        <OfflineNotice />
        {children}
      </body>
    </html>
  );
}
