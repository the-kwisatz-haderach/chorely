"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ApiError, type ChoreDto, type MemberDto } from "@chorely/api-client";
import { api } from "./api";

function message(err: unknown): string {
  return err instanceof ApiError ? err.message : "Something went wrong. Try again.";
}

function ChoreMeta({ chore, members }: { chore: ChoreDto; members: MemberDto[] }) {
  const assignee = members.find((m) => m.id === chore.assigneeId);
  return (
    <>
      {chore.dueDate && <span> Due {chore.dueDate}</span>}
      <span> {assignee ? `Assigned to ${assignee.displayName ?? "Unnamed"}` : "Unassigned"}</span>
    </>
  );
}

/** The Group's Queue: a Next-up hero for the first Chore, the rest as a numbered list, and an add form. */
export function Queue({ groupId, members, inviteLink }: { groupId: string; members: MemberDto[]; inviteLink?: string }) {
  const [chores, setChores] = useState<ChoreDto[]>();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    api
      .getQueue(groupId)
      .then(({ chores }) => setChores(chores))
      .catch((err: unknown) => setError(message(err)));
  }, [groupId]);

  async function submit(form: HTMLFormElement, placement: "front" | undefined) {
    const data = new FormData(form);
    const text = (key: string) => String(data.get(key) ?? "");
    setBusy(true);
    setError(undefined);
    try {
      await api.addChore(groupId, {
        title: text("title"),
        note: text("note"),
        dueDate: text("dueDate") || null,
        assigneeId: text("assigneeId") || null,
        ...(placement ? { placement } : {}),
      });
      setChores((await api.getQueue(groupId)).chores);
      setAdding(false);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  const [next, ...rest] = chores ?? [];

  return (
    <section aria-label="Queue">
      <h3>Queue</h3>
      {chores && !next && (
        <p>
          Nothing in the Queue yet. Add your first Chore{inviteLink ? ` and share the Invite link: ${inviteLink}` : " and share the Invite link"}.
        </p>
      )}
      {next && (
        <article aria-label="Next up">
          <h4>Next up</h4>
          <strong>{next.title}</strong>
          {next.note && <p>{next.note}</p>}
          <ChoreMeta chore={next} members={members} />
        </article>
      )}
      {rest.length > 0 && (
        <ol start={2} aria-label="Queue list">
          {rest.map((c) => (
            <li key={c.id}>
              <strong>{c.title}</strong>
              <ChoreMeta chore={c} members={members} />
            </li>
          ))}
        </ol>
      )}

      {adding ? (
        <form
          aria-label="Add a Chore"
          onSubmit={(e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            const placement = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "front" ? "front" : undefined;
            void submit(e.currentTarget, placement);
          }}
        >
          <label>
            Title <input name="title" maxLength={100} required />
          </label>
          <label>
            Note <textarea name="note" maxLength={1000} />
          </label>
          <label>
            Due date <input name="dueDate" type="date" />
          </label>
          <label>
            Assignee
            <select name="assigneeId" defaultValue="">
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName ?? "Unnamed"}
                </option>
              ))}
            </select>
          </label>
          <p>Without a Due date a Chore goes to the back; with one, it is placed by date.</p>
          <button disabled={busy} value="back">
            Add
          </button>
          <button disabled={busy} value="front">
            Add to front
          </button>
          <button type="button" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <button style={{ position: "fixed", right: 24, bottom: 24, padding: "12px 20px" }} onClick={() => setAdding(true)}>
          + Add a Chore
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
