"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleCheck, ListChecks } from "lucide-react";
import { type DoneChoreDto, type MemberDto } from "@chorely/api-client";
import { Button, EmptyState, ErrorBanner, Loading } from "../ui";
import { api } from "./api";
import styles from "./done-list.module.css";
import { errorMessage } from "./error-message";

const completedAtFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Read-only list of completed Chores, newest first, loaded a page at a time. */
export function DoneList({ groupId, members }: { groupId: string; members: MemberDto[] }) {
  const [chores, setChores] = useState<DoneChoreDto[]>();
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(
    async (cursor?: string) => {
      try {
        const page = await api.getDoneList(groupId, cursor ? { cursor } : {});
        setChores((prev) => (cursor && prev ? [...prev, ...page.chores] : page.chores));
        setNextCursor(page.nextCursor);
        setError(undefined);
      } catch (err) {
        setError(errorMessage(err));
      }
    },
    [groupId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function loadMore(cursor: string) {
    setLoadingMore(true);
    await load(cursor);
    setLoadingMore(false);
  }

  const completer = (c: DoneChoreDto) =>
    members.find((m) => m.id === c.completedById)?.displayName ?? (c.completedById ? "Unnamed" : "Former member");

  return (
    <section aria-label="Done list">
      <h2 className={styles.heading}>Done</h2>
      {error && <ErrorBanner message={error} />}
      {!chores && !error && <Loading />}
      {chores && chores.length === 0 && <EmptyState icon={<ListChecks size={40} />} message="Nothing completed yet." />}
      {chores && chores.length > 0 && (
        <ul className={styles.list}>
          {chores.map((c) => (
            <li key={c.id} className={styles.row}>
              <CircleCheck aria-hidden size={20} className={styles.check} />
              <div className={styles.body}>
                <strong className={styles.title}>{c.title}</strong>
                <p className={styles.meta}>
                  Done by {completer(c)} · <time dateTime={c.completedAt}>{completedAtFormat.format(new Date(c.completedAt))}</time>
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {nextCursor && (
        <Button className={styles.more} disabled={loadingMore} onClick={() => void loadMore(nextCursor)}>
          Load more
        </Button>
      )}
    </section>
  );
}
