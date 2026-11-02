"use client";

import { useEffect } from "react";

/** Registers `public/sw.js`, which is there for installability only and caches nothing. */
export function ServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
