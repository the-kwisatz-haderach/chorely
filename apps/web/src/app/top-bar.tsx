import Link from "next/link";
import { ListChecks, Settings } from "lucide-react";
import styles from "./top-bar.module.css";

/** The app's top bar: the Group name (linking home to the Queue) and icon links to its Done list and Group screen. */
export function TopBar({ title, groupId }: { title: string; groupId?: string }) {
  return (
    <header className={styles.bar}>
      <h1 className={styles.title}>{groupId ? <Link href="/">{title}</Link> : title}</h1>
      {groupId && (
        <nav aria-label="Group" className={styles.nav}>
          <Link href={`/groups/${groupId}/done`} aria-label="Done" className={styles.icon}>
            <ListChecks aria-hidden size={22} />
          </Link>
          <Link href={`/groups/${groupId}/settings`} aria-label="Group settings" className={styles.icon}>
            <Settings aria-hidden size={22} />
          </Link>
        </nav>
      )}
    </header>
  );
}
