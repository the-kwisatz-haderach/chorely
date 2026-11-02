import type { ReactNode } from "react";
import styles from "./toast.module.css";

/** A short status message that slides up above the bottom edge, with an optional action. */
export function Toast({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div role="status" className={styles.toast}>
      <span>{children}</span>
      {action}
    </div>
  );
}
