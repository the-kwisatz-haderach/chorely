"use client";

import { useEffect, useState, type ReactNode } from "react";
import styles from "./loading.module.css";

/** How long a wait goes unremarked: quick loads never flash a message. */
const DELAY_MS = 300;

/** A muted "Loading…" line, shown only once the wait passes about 300 ms. No skeletons or spinners. */
export function Loading({ children = "Loading…" }: { children?: ReactNode }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShown(true), DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  return shown ? <p className={styles.loading}>{children}</p> : null;
}
