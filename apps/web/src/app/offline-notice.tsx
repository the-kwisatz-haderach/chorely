"use client";

import { useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";
import styles from "./offline-notice.module.css";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** A strip above every screen while the browser is offline. Offline use is not supported in v1, so it says so. */
export function OfflineNotice() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  return (
    <div role="status" className={styles.slot}>
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
