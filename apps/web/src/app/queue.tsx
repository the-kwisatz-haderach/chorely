"use client";

import { useEffect, useRef, useState, type DragEvent, type FormEvent, type MouseEvent } from "react";
import { ApiError, type ChoreDto, type MemberDto } from "@chorely/api-client";
import { positionBetween } from "@chorely/domain";
import { api } from "./api";
import { DoneList } from "./done-list";
import { errorMessage } from "./error-message";

/** Today as a local `YYYY-MM-DD`, comparable with a Chore's date-only Due date. */
function todayLocal(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function ChoreMeta({ chore, members }: { chore: ChoreDto; members: MemberDto[] }) {
  const assignee = members.find((m) => m.id === chore.assigneeId);
  const overdue = chore.dueDate !== null && chore.dueDate < todayLocal();
  return (
    <>
      {chore.dueDate && (
        <span>
          {" "}
          Due {chore.dueDate}
          {overdue && <strong style={{ color: "#b00020" }}> Overdue</strong>}
        </span>
      )}
      <span> {assignee ? `Assigned to ${assignee.displayName ?? "Unnamed"}` : "Unassigned"}</span>
    </>
  );
}

/** How long the Undo toast stays up after a Chore is completed. */
const UNDO_MS = 8000;

/** The Queue order the server uses: `(position, id)`, byte-wise (keys and ids are ASCII). */
function inQueueOrder(chores: ChoreDto[]): ChoreDto[] {
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return [...chores].sort((a, b) => cmp(a.position, b.position) || cmp(a.id, b.id));
}

const LOST_MOVE = "The Queue changed while you were moving that Chore, so it has been refreshed.";

const LOST_CLAIM = "Someone else got there first, so nothing changed. The Queue has been refreshed.";

interface ChoreActionsProps {
  groupId: string;
  chore: ChoreDto;
  members: MemberDto[];
  myMemberId: string | undefined;
  disabled: boolean;
  onClaim(): void;
  onUnclaim(): void;
  onAssign(assigneeId: string | null): void;
  onMove(to: "front" | "back"): void;
}

function closeMenu(e: MouseEvent<HTMLButtonElement>) {
  e.currentTarget.closest("details")?.removeAttribute("open");
}

/** One-tap Claim or Unclaim, plus assigning the Chore to any Member. */
function ChoreActions({ groupId, chore, members, myMemberId, disabled, onClaim, onUnclaim, onAssign, onMove }: ChoreActionsProps) {
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
      <a href={`/groups/${groupId}/chores/${chore.id}/edit`} aria-label={`Edit ${chore.title}`}>
        Edit
      </a>
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
      <details style={{ display: "inline-block" }}>
        <summary aria-label={`Move ${chore.title}`}>Move</summary>
        {(["front", "back"] as const).map((to) => (
          <button
            key={to}
            onClick={(e) => {
              closeMenu(e);
              onMove(to);
            }}
          >
            Move to {to}
          </button>
        ))}
      </details>
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
  const [undo, setUndo] = useState<{ id: string; title: string }>();
  const undoTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [showDone, setShowDone] = useState(false);
  // Bumped on every complete/undo so an open Done list reloads.
  const [doneVersion, setDoneVersion] = useState(0);

  // Moves still in flight, by Chore id: the latest move's number and its provisional key. A fetched Queue keeps
  // these keys so it cannot undo an optimistic move, and only the latest move's response is reconciled (ADR 0002).
  const moving = useRef(new Map<string, { seq: number; position: string }>());
  const moveSeq = useRef(0);
  // Moves are sent one at a time, in order: each one's anchors assume the moves before it have landed.
  const moveChain = useRef<Promise<void>>(Promise.resolve());
  const dragged = useRef<string>(undefined);

  useEffect(() => () => clearTimeout(undoTimer.current), []);

  /** Shows a fetched Queue, keeping the provisional key of any Chore whose move is still in flight. */
  function showQueue(fetched: ChoreDto[]) {
    setChores(inQueueOrder(fetched.map((c) => ({ ...c, position: moving.current.get(c.id)?.position ?? c.position }))));
  }

  useEffect(() => {
    api
      .getQueue(groupId)
      .then(({ chores }) => showQueue(chores))
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
      showQueue((await api.getQueue(groupId)).chores);
      setAdding(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const queue = chores ?? [];
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
      showQueue((await api.getQueue(groupId)).chores);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Moves a Chore to `index` among the others: instantly with a provisional key, then reconciled with the key the
   * server generates. On a conflict (or any failure) the Queue is refetched.
   */
  async function move(chore: ChoreDto, index: number) {
    const others = queue.filter((c) => c.id !== chore.id);
    const after = others[index - 1];
    const before = others[index];
    if (queue[index]?.id === chore.id || (!after && !before)) return;

    const seq = ++moveSeq.current;
    const position = positionBetween(after?.position ?? null, before?.position ?? null) ?? chore.position;
    moving.current.set(chore.id, { seq, position });
    setChores([...others.slice(0, index), { ...chore, position }, ...others.slice(index)]);
    setError(undefined);

    const isLatest = () => moving.current.get(chore.id)?.seq === seq;
    const sent = moveChain.current.then(() =>
      api.moveChore(groupId, chore.id, {
        ...(after ? { afterId: after.id } : {}),
        ...(before ? { beforeId: before.id } : {}),
      }),
    );
    moveChain.current = sent.then(
      () => undefined,
      () => undefined,
    );
    try {
      const res = await sent;
      if (!isLatest()) return;
      moving.current.delete(chore.id);
      setChores((current) => current && inQueueOrder(current.map((c) => (c.id === chore.id ? res.chore : c))));
    } catch (err) {
      if (!isLatest()) return;
      moving.current.delete(chore.id);
      setError(err instanceof ApiError && err.code === "conflict" ? LOST_MOVE : errorMessage(err));
      try {
        showQueue((await api.getQueue(groupId)).chores);
      } catch (refetchErr) {
        setError(errorMessage(refetchErr));
      }
    }
  }

  /** Drag and drop: dropping on a Chore lands below it when dragging down, above it when dragging up. */
  function dragProps(chore: ChoreDto) {
    return {
      draggable: true,
      style: { cursor: "grab" },
      onDragStart: (e: DragEvent) => {
        dragged.current = chore.id;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", chore.id);
      },
      onDragOver: (e: DragEvent) => {
        if (dragged.current) e.preventDefault();
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        const from = queue.findIndex((c) => c.id === dragged.current);
        const to = queue.findIndex((c) => c.id === chore.id);
        const moved = queue[from];
        dragged.current = undefined;
        if (!moved || from === to) return;
        void move(moved, to);
      },
      onDragEnd: () => {
        dragged.current = undefined;
      },
    };
  }

  function dismissUndo() {
    clearTimeout(undoTimer.current);
    setUndo(undefined);
  }

  async function complete(chore: ChoreDto) {
    await runAndRefetch(async () => {
      await api.completeChore(groupId, chore.id);
      setUndo({ id: chore.id, title: chore.title });
      clearTimeout(undoTimer.current);
      undoTimer.current = setTimeout(() => setUndo(undefined), UNDO_MS);
    });
    setDoneVersion((v) => v + 1);
  }

  async function undoComplete(id: string) {
    dismissUndo();
    await runAndRefetch(() => api.undoCompleteChore(groupId, id));
    setDoneVersion((v) => v + 1);
  }

  const actions = (chore: ChoreDto) => (
    <ChoreActions
      groupId={groupId}
      chore={chore}
      members={members}
      myMemberId={myMemberId}
      disabled={busy}
      onClaim={() => void runAndRefetch(() => api.claimChore(groupId, chore.id), LOST_CLAIM)}
      onUnclaim={() => void runAndRefetch(() => api.unclaimChore(groupId, chore.id))}
      onAssign={(assigneeId) => void runAndRefetch(() => api.assignChore(groupId, chore.id, { assigneeId }))}
      onMove={(to) => void move(chore, to === "front" ? 0 : queue.length - 1)}
    />
  );

  const [next, ...rest] = queue;

  return (
    <section aria-label="Queue">
      <h3>Queue</h3>
      {chores && !next && (
        <p>
          Nothing in the Queue yet. Add your first Chore{inviteLink ? ` and share the Invite link: ${inviteLink}` : " and share the Invite link"}.
        </p>
      )}
      {next && (
        <article aria-label="Next up" {...dragProps(next)}>
          <h4>Next up</h4>
          <strong>{next.title}</strong>
          {next.note && <p>{next.note}</p>}
          <ChoreMeta chore={next} members={members} />
          {actions(next)}
          <button
            disabled={busy}
            onClick={() => void complete(next)}
            aria-label={`Complete ${next.title}`}
            style={{ display: "block", width: "100%", padding: "16px", fontSize: "1.25rem", marginTop: 12 }}
          >
            Complete
          </button>
        </article>
      )}
      {rest.length > 0 && (
        <ol start={2} aria-label="Queue list">
          {rest.map((c) => (
            <li key={c.id} {...dragProps(c)}>
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
      {undo && (
        <div role="status" style={{ position: "fixed", left: 24, bottom: 24, padding: "12px 20px", background: "#222", color: "#fff" }}>
          Completed {undo.title}{" "}
          <button onClick={() => void undoComplete(undo.id)} aria-label={`Undo completing ${undo.title}`}>
            Undo
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}

      <button onClick={() => setShowDone((v) => !v)}>{showDone ? "Hide Done list" : "Show Done list"}</button>
      {showDone && <DoneList groupId={groupId} members={members} version={doneVersion} />}
    </section>
  );
}
