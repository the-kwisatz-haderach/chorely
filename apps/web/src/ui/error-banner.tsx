import { CircleAlert } from "lucide-react";
import { cx } from "./class-names";
import styles from "./error-banner.module.css";

/** Shows an API error's `message` (or any failure) as an alert. */
export function ErrorBanner({ message, className }: { message: string; className?: string }) {
  return (
    <p role="alert" className={cx(styles.banner, className)}>
      <CircleAlert aria-hidden size={20} className={styles.icon} />
      {message}
    </p>
  );
}
