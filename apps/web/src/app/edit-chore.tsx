"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { type ChoreDto, type MemberDto } from "@chorely/api-client";
import { SearchX } from "lucide-react";
import { Button, buttonClassName, Dialog, EmptyState, ErrorBanner, Loading } from "../ui";
import { api } from "./api";
import { ChoreFields, choreFieldValues } from "./chore-fields";
import styles from "./chore-form.module.css";
import { errorMessage } from "./error-message";
import { RecurrenceFields, recurrenceValue } from "./recurrence-fields";
import { todayLocal } from "./today";

/**
 * Full-page edit screen for one open Chore: change any field or its schedule, stop it repeating, or delete it after
 * a confirm in the Dialog. Deleting an Occurrence of a Recurring Chore offers "Delete this one" or "Delete and stop
 * repeating".
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

  if (chore === undefined) return error ? <ErrorBanner message={error} /> : <Loading />;
  if (chore === null) {
    return (
      <EmptyState
        icon={<SearchX size={32} />}
        message="This Chore is no longer in the Queue. It may have been completed or deleted."
        action={
          <a href="/" className={buttonClassName({ variant: "primary" })}>
            Back to the Queue
          </a>
        }
      />
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

  /** A danger Button in the delete confirm: closes it, then deletes. */
  const confirmDelete = (label: string, stopRepeating: boolean) => (
    <Button
      variant="danger"
      onClick={() => {
        setConfirmingDelete(false);
        void remove(stopRepeating);
      }}
    >
      {label}
    </Button>
  );

  return (
    <section className={styles.screen}>
      <h2 className={styles.title}>Edit Chore</h2>
      <form aria-label="Edit Chore" className={styles.card} onSubmit={onSubmit}>
        <ChoreFields
          chore={chore}
          members={members}
          dueDateHint="Changing the Due date does not move the Chore in the Queue."
        />
        <RecurrenceFields
          recurrence={chore.recurrence}
          dueDate={chore.dueDate}
          members={members}
          hint={chore.recurrence ? "Schedule changes apply from the next Occurrence." : undefined}
        />
        {error && <ErrorBanner message={error} className={styles.banner} />}
        <div className={styles.actions}>
          <Button type="submit" variant="primary" disabled={busy}>
            Save
          </Button>
          <a href="/" className={buttonClassName()}>
            Cancel
          </a>
        </div>
      </form>
      <div className={styles.moreActions}>
        {chore.recurrence && (
          <Button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await api.updateChore(groupId, choreId, { recurrence: null });
              })
            }
          >
            Stop repeating
          </Button>
        )}
        <Button variant="danger" disabled={busy} onClick={() => setConfirmingDelete(true)}>
          Delete Chore
        </Button>
      </div>
      <Dialog open={confirmingDelete} onClose={() => setConfirmingDelete(false)} title={`Delete "${chore.title}"?`}>
        <p className={styles.muted}>
          {chore.recurrence
            ? "Delete just this Occurrence, so the next one is added now, or delete it and stop repeating. This cannot be undone."
            : "This cannot be undone."}
        </p>
        <div className={styles.dialogActions}>
          <Button onClick={() => setConfirmingDelete(false)}>Cancel</Button>
          {chore.recurrence ? (
            <>
              {confirmDelete("Delete this one", false)}
              {confirmDelete("Delete and stop repeating", true)}
            </>
          ) : (
            confirmDelete("Delete", false)
          )}
        </div>
      </Dialog>
    </section>
  );
}
