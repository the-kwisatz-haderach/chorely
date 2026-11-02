"use client";

import { useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";
import { cx } from "../ui";
import styles from "./offline-notice.module.css";

function subscribeToOnlineStatus(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/**
 * Says so while the browser is offline, because offline use is not supported in v1. The top bar and the screens
 * before the Queue each place one, so it stays in view and stays clear of the safe area.
 */
export function OfflineNotice({ className }: { className?: string }) {
  const online = useSyncExternalStore(
    subscribeToOnlineStatus,
    () => navigator.onLine,
    () => true,
  );
  return (
    <div role="status" className={cx(styles.slot, className)}>
      {!online && (
        <p className={styles.notice}>
          <WifiOff aria-hidden size={18} className={styles.icon} />
          <span>
            <strong>You're offline.</strong> Changes won't save until you're back online.
          </span>
        </p>
      )}
    </div>
  );
}
