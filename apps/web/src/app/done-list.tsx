"use client";

import { useCallback, useEffect, useState } from "react";
import { type DoneChoreDto, type MemberDto } from "@chorely/api-client";
import { api } from "./api";
import { errorMessage } from "./error-message";

/** Read-only list of completed Chores, newest first, loaded a page at a time. `version` changes reload it. */
export function DoneList({ groupId, members, version }: { groupId: string; members: MemberDto[]; version: number }) {
  const [chores, setChores] = useState<DoneChoreDto[]>();
  const [nextCursor, setNextCursor] = useState<string | null>(null);
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
  }, [load, version]);

  const completer = (c: DoneChoreDto) =>
    members.find((m) => m.id === c.completedById)?.displayName ?? (c.completedById ? "Unnamed" : "Former member");

  return (
    <section aria-label="Done list">
      <h3>Done</h3>
      {chores && chores.length === 0 && <p>Nothing completed yet.</p>}
      {chores && chores.length > 0 && (
        <ul>
          {chores.map((c) => (
            <li key={c.id}>
              <strong>{c.title}</strong> Done by {completer(c)} on {new Date(c.completedAt).toLocaleString()}
            </li>
          ))}
        </ul>
      )}
      {nextCursor && <button onClick={() => void load(nextCursor)}>Load more</button>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
