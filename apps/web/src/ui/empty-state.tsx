import type { ReactNode } from "react";
import styles from "./empty-state.module.css";

/** Shown in place of an empty list: an icon, one line, and an optional action. */
export function EmptyState({ icon, message, action }: { icon: ReactNode; message: ReactNode; action?: ReactNode }) {
  return (
    <div className={styles.empty}>
      <span className={styles.icon} aria-hidden>
        {icon}
      </span>
      <p>{message}</p>
      {action}
    </div>
  );
}
