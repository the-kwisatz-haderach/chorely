import type { ElementType, ReactNode } from "react";
import styles from "./visually-hidden.module.css";

/** Content for assistive tech only: in the accessibility tree and the page's text, but not shown. */
export function VisuallyHidden({ as: Tag = "span", children }: { as?: ElementType; children: ReactNode }) {
  return <Tag className={styles.hidden}>{children}</Tag>;
}
