import type { ReactNode } from "react";
import styles from "./entry.module.css";

/** The "Chorely" wordmark, as text, heading the screens before the Queue. */
export function Wordmark() {
  return <h1 className={styles.wordmark}>Chorely</h1>;
}

/** The one centred card each screen before the Queue shows its step in. */
export function EntryCard({ children }: { children: ReactNode }) {
  return <section className={styles.card}>{children}</section>;
}
