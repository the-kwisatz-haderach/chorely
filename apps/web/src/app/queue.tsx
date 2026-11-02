"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ApiError, type ChoreDto, type MemberDto } from "@chorely/api-client";
import { api } from "./api";
import { errorMessage } from "./error-message";

function ChoreMeta({ chore, members }: { chore: ChoreDto; members: MemberDto[] }) {
  const assignee = members.find((m) => m.id === chore.assigneeId);
  return (
    <>
      {chore.dueDate && <span> Due {chore.dueDate}</span>}
      <span> {assignee ? `Assigned to ${assignee.displayName ?? "Unnamed"}` : "Unassigned"}</span>
    </>
  );
}

const LOST_CLAIM = "Someone else got there first, so nothing changed. The Queue has been refreshed.";

interface ChoreActionsProps {
  chore: ChoreDto;
  members: MemberDto[];
  myMemberId: string | undefined;
  disabled: boolean;
  onClaim(): void;
  onUnclaim(): void;
  onAssign(assigneeId: string | null): void;
}

/** One-tap Claim or Unclaim, plus assigning the Chore to any Member. */
function ChoreActions({ chore, members, myMemberId, disabled, onClaim, onUnclaim, onAssign }: ChoreActionsProps) {
  // A Chore whose Assignee has left reads as unassigned (the server nulls it; this covers a stale Queue).
  const held = members.some((m) => m.id === chore.assigneeId) ? chore.assigneeId : null;
  return (
    <span>
      {!held && (
        <button disabled={disabled} onClick={onClaim} aria-label={`Claim ${chore.title}`}>
          Claim
        </button>
      )}
      {held && held === myMemberId && (
        <button disabled={disabled} onClick={onUnclaim} aria-label={`Unclaim ${chore.title}`}>
          Unclaim
        </button>
      )}
      <select
        aria-label={`Assign ${chore.title}`}
        disabled={disabled}
        value={held ?? ""}
        onChange={(e) => onAssign(e.target.value || null)}
      >
        <option value="">Unassigned</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.displayName ?? "Unnamed"}
          </option>
        ))}
      </select>
    </span>
  );
}

/** The Group's Queue: a Next-up hero for the first Chore, the rest as a numbered list, and an add form. */
export function Queue({
  groupId,
  members,
  accountId,
  inviteLink,
}: {
  groupId: string;
  members: MemberDto[];
  accountId: string;
  inviteLink?: string;
}) {
  const [chores, setChores] = useState<ChoreDto[]>();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    api
      .getQueue(groupId)
      .then(({ chores }) => setChores(chores))
      .catch((err: unknown) => setError(errorMessage(err)));
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
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const myMemberId = members.find((m) => m.accountId === accountId)?.id;

  /** Runs a Claim or assignment, then refetches. A 409 shows `lostRace` when given, else the server's message. */
  async function runAndRefetch(action: () => Promise<unknown>, lostRace?: string) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === "conflict" ? (lostRace ?? err.message) : errorMessage(err),
      );
    }
    try {
      setChores((await api.getQueue(groupId)).chores);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const actions = (chore: ChoreDto) => (
    <ChoreActions
      chore={chore}
      members={members}
      myMemberId={myMemberId}
      disabled={busy}
      onClaim={() => void runAndRefetch(() => api.claimChore(groupId, chore.id), LOST_CLAIM)}
      onUnclaim={() => void runAndRefetch(() => api.unclaimChore(groupId, chore.id))}
      onAssign={(assigneeId) => void runAndRefetch(() => api.assignChore(groupId, chore.id, { assigneeId }))}
    />
  );

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
          {actions(next)}
        </article>
      )}
      {rest.length > 0 && (
        <ol start={2} aria-label="Queue list">
          {rest.map((c) => (
            <li key={c.id}>
              <strong>{c.title}</strong>
              <ChoreMeta chore={c} members={members} />
              {actions(c)}
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
