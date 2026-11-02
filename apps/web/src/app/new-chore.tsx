"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { type MemberDto } from "@chorely/api-client";
import { type Placement } from "@chorely/domain";
import { Button, buttonClassName, ErrorBanner } from "../ui";
import { api } from "./api";
import { ChoreFields, PlacementToggle, addChoreBody } from "./chore-fields";
import styles from "./chore-form.module.css";
import { errorMessage } from "./error-message";
import { RecurrenceFields, recurrenceValue } from "./recurrence-fields";

/** Full-page add screen, reached by "More options" from the Queue's add sheet with its title and placement carried over. */
export function NewChore({ groupId, title, placement }: { groupId: string; title: string; placement: Placement }) {
  const router = useRouter();
  const [members, setMembers] = useState<MemberDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    api
      .getGroup(groupId)
      .then((detail) => setMembers(detail.members))
      .catch((err: unknown) => setError(errorMessage(err)));
  }, [groupId]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const repeat = recurrenceValue(e.currentTarget);
    if ("error" in repeat) {
      setError(repeat.error);
      return;
    }
    const body = { ...addChoreBody(e.currentTarget), recurrence: repeat.recurrence };
    setBusy(true);
    setError(undefined);
    try {
      await api.addChore(groupId, body);
      router.push("/");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <section className={styles.screen}>
      <h2 className={styles.title}>Add a Chore</h2>
      <form aria-label="Add a Chore" className={styles.card} onSubmit={(e) => void onSubmit(e)}>
        <ChoreFields chore={{ title }} members={members} />
        <div className={styles.field}>
          <PlacementToggle defaultValue={placement} stacked />
          <p className={styles.hint}>On Back, a Chore with a Due date is placed by its date instead.</p>
        </div>
        <RecurrenceFields recurrence={null} dueDate={null} members={members} />
        {error && <ErrorBanner message={error} className={styles.banner} />}
        <div className={styles.actions}>
          <Button type="submit" variant="primary" disabled={busy}>
            Add
          </Button>
          <a href="/" className={buttonClassName()}>
            Cancel
          </a>
        </div>
      </form>
    </section>
  );
}
