"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { type ChoreDto, type MemberDto } from "@chorely/api-client";
import { Button, Dialog } from "../ui";
import { api } from "./api";
import { ChoreFields, choreFieldValues } from "./chore-fields";
import { errorMessage } from "./error-message";
import { RecurrenceFields, recurrenceValue } from "./recurrence-fields";
import { todayLocal } from "./today";

/**
 * Full-page edit screen for one open Chore: change any field or its schedule, stop it repeating, or delete it after
 * a confirm. Deleting an Occurrence of a Recurring Chore offers "Delete this one" or "Delete and stop repeating".
 */
export function EditChore({ groupId, choreId }: { groupId: string; choreId: string }) {
  const router = useRouter();
  const [chore, setChore] = useState<ChoreDto | null>();
  const [members, setMembers] = useState<MemberDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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
    const repeat = recurrenceValue(e.currentTarget);
    if ("error" in repeat) {
      setError(repeat.error);
      return;
    }
    const body = { ...choreFieldValues(e.currentTarget), recurrence: repeat.recurrence };
    void run(async () => {
      await api.updateChore(groupId, choreId, body);
    });
  };

  const remove = (stopRepeating: boolean) =>
    run(async () => {
      await api.deleteChore(groupId, choreId, { stopRepeating, today: todayLocal() });
    });

  return (
    <>
      <h2>Edit Chore</h2>
      <form aria-label="Edit Chore" onSubmit={onSubmit}>
        <ChoreFields chore={chore} members={members} />
        <p>Changing the Due date does not move the Chore in the Queue.</p>
        <RecurrenceFields recurrence={chore.recurrence} dueDate={chore.dueDate} members={members} />
        {chore.recurrence && <p>Schedule changes apply from the next Occurrence.</p>}
        <button disabled={busy}>Save</button>
        <a href="/">Cancel</a>
      </form>
      {chore.recurrence && (
        <button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await api.updateChore(groupId, choreId, { recurrence: null });
            })
          }
        >
          Stop repeating
        </button>
      )}
      <button
        disabled={busy}
        onClick={() => {
          if (chore.recurrence) {
            setConfirmingDelete(true);
            return;
          }
          if (!window.confirm(`Delete "${chore.title}"? This cannot be undone.`)) return;
          void remove(false);
        }}
      >
        Delete Chore
      </button>
      <Dialog open={confirmingDelete} onClose={() => setConfirmingDelete(false)} title={`Delete "${chore.title}"?`}>
        <p>Delete just this Occurrence, so the next one is added now, or delete it and stop repeating. This cannot be undone.</p>
        <Button onClick={() => setConfirmingDelete(false)}>Cancel</Button>
        <Button
          variant="danger"
          onClick={() => {
            setConfirmingDelete(false);
            void remove(false);
          }}
        >
          Delete this one
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            setConfirmingDelete(false);
            void remove(true);
          }}
        >
          Delete and stop repeating
        </Button>
      </Dialog>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
