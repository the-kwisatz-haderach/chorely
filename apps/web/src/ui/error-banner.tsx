import { CircleAlert } from "lucide-react";
import styles from "./error-banner.module.css";

/** Shows an API error's `message` (or any failure) as an alert. */
export function ErrorBanner({ message }: { message: string }) {
  return (
    <p role="alert" className={styles.banner}>
      <CircleAlert aria-hidden size={20} className={styles.icon} />
      {message}
    </p>
  );
}
