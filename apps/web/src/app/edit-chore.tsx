"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { type ChoreDto, type MemberDto } from "@chorely/api-client";
import { api } from "./api";
import { ChoreFields, choreFieldValues } from "./chore-fields";
import { errorMessage } from "./error-message";

/** Full-page edit screen for one open Chore: change any field, or delete it after a confirm. */
export function EditChore({ groupId, choreId }: { groupId: string; choreId: string }) {
  const router = useRouter();
  const [chore, setChore] = useState<ChoreDto | null>();
  const [members, setMembers] = useState<MemberDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    Promise.all([api.getQueue(groupId), api.getGroup(groupId)])
      .then(([queue, detail]) => {
        setChore(queue.chores.find((c) => c.id === choreId) ?? null);
        setMembers(detail.members);
      })
      .catch((err: unknown) => setError(errorMessage(err)));
  }, [groupId, choreId]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      router.push("/");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (chore === undefined) return error ? <p role="alert">{error}</p> : <p>Loading…</p>;
  if (chore === null) {
    return (
      <>
        <p>This Chore is no longer in the Queue. It may have been completed or deleted.</p>
        <a href="/">Back to the Queue</a>
      </>
    );
  }

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const body = choreFieldValues(e.currentTarget);
    void run(async () => {
      await api.updateChore(groupId, choreId, body);
    });
  };

  return (
    <>
      <h2>Edit Chore</h2>
      <form aria-label="Edit Chore" onSubmit={onSubmit}>
        <ChoreFields chore={chore} members={members} />
        <p>Changing the Due date does not move the Chore in the Queue.</p>
        <button disabled={busy}>Save</button>
        <a href="/">Cancel</a>
      </form>
      <button
        disabled={busy}
        onClick={() => {
          if (!window.confirm(`Delete "${chore.title}"? This cannot be undone.`)) return;
          void run(async () => {
            await api.deleteChore(groupId, choreId);
          });
        }}
      >
        Delete Chore
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
