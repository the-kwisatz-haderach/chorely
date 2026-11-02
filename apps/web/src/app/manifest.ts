import type { MetadataRoute } from "next";
import { LIGHT_BG } from "./theme-colors";

/** The web app manifest that, with the service worker in `public/sw.js`, makes Chorely installable. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Chorely",
    short_name: "Chorely",
    description: "A shared Queue of Chores for your household.",
    start_url: "/",
    display: "standalone",
    theme_color: LIGHT_BG,
    background_color: LIGHT_BG,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
