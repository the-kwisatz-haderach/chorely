"use client";

import { useEffect, useRef, useState, type FormEvent, type HTMLAttributes } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Check,
  ChevronDown,
  ClipboardList,
  Ellipsis,
  GripVertical,
  Plus,
  TriangleAlert,
} from "lucide-react";
import { ApiError, type ChoreDto, type MemberDto } from "@chorely/api-client";
import { api } from "./api";
import { PlacementToggle, placementValue } from "./chore-fields";
import { errorMessage } from "./error-message";
import { Button, EmptyState, ErrorBanner, Menu, MenuItem, Sheet, Toast } from "../ui";
import { useMovableQueue } from "./use-movable-queue";
import styles from "./queue.module.css";

/** Today as a local `YYYY-MM-DD`, comparable with a Chore's date-only Due date. */
function todayLocal(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** How long the Undo toast stays up after a Chore is completed. */
const UNDO_MS = 8000;

const LOST_CLAIM = "Someone else got there first, so nothing changed. The Queue has been refreshed.";

interface ChoreMetaProps {
  chore: ChoreDto;
  members: MemberDto[];
  myMemberId: string | undefined;
  disabled: boolean;
  onClaim(): void;
  onUnclaim(): void;
  onAssign(assigneeId: string | null): void;
}

/** The muted line under a Chore's title: its Due date, its Assignee as a pill that reassigns, and Claim or Unclaim. */
function ChoreMeta({ chore, members, myMemberId, disabled, onClaim, onUnclaim, onAssign }: ChoreMetaProps) {
  // A Chore whose Assignee has left reads as unassigned (the server nulls it; this covers a stale Queue).
  const assignee = members.find((m) => m.id === chore.assigneeId);
  const overdue = chore.dueDate !== null && chore.dueDate < todayLocal();
  return (
    <div className={styles.meta}>
      {chore.dueDate &&
        (overdue ? (
          <span className={styles.overdue}>
            <TriangleAlert aria-hidden size={14} />
            Due {chore.dueDate} · Overdue
          </span>
        ) : (
          <span>Due {chore.dueDate}</span>
        ))}
      {/* The pill shows the Assignee; the transparent select over it reassigns to any Member. */}
      <span className={styles.pill}>
        {assignee ? (
          <>
            <span className={styles.visuallyHidden}>Assigned to </span>
            {assignee.displayName ?? "Unnamed"}
          </>
        ) : (
          "Unassigned"
        )}
        <ChevronDown aria-hidden size={12} />
        <select
          aria-label={`Assign ${chore.title}`}
          className={styles.pillSelect}
          disabled={disabled}
          value={assignee?.id ?? ""}
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
      {!assignee && (
        <Button className={styles.claim} disabled={disabled} onClick={onClaim} aria-label={`Claim ${chore.title}`}>
          Claim
        </Button>
      )}
      {assignee && assignee.id === myMemberId && (
        <Button className={styles.claim} disabled={disabled} onClick={onUnclaim} aria-label={`Unclaim ${chore.title}`}>
          Unclaim
        </Button>
      )}
    </div>
  );
}

/** A Chore's title, which opens its edit screen. */
function ChoreTitle({ groupId, chore, className }: { groupId: string; chore: ChoreDto; className?: string }) {
  return (
    <strong className={className}>
      <a href={`/groups/${groupId}/chores/${chore.id}/edit`} aria-label={`Edit ${chore.title}`}>
        {chore.title}
      </a>
    </strong>
  );
}

/** The grip a row is dragged by. Hidden from assistive tech: the "⋯" Move menu is the keyboard and fallback path. */
function DragHandle(props: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={styles.handle} title="Drag to reorder" aria-hidden {...props}>
      <GripVertical size={18} />
    </span>
  );
}

/** The "⋯" menu: Move to front and Move to back. */
function MoveMenu({ chore, onMove }: { chore: ChoreDto; onMove(to: "front" | "back"): void }) {
  return (
    <Menu label={`Move ${chore.title}`} trigger={<Ellipsis aria-hidden size={20} />} triggerClassName={styles.more}>
      <MenuItem onClick={() => onMove("front")}>
        <ArrowUpToLine aria-hidden size={16} className={styles.menuIcon} />
        Move to front
      </MenuItem>
      <MenuItem onClick={() => onMove("back")}>
        <ArrowDownToLine aria-hidden size={16} className={styles.menuIcon} />
        Move to back
      </MenuItem>
    </Menu>
  );
}

/** The Group's Queue: a Next-up hero for the first Chore, the rest as numbered rows, and a FAB that opens the add sheet. */
export function Queue({ groupId, members, accountId }: { groupId: string; members: MemberDto[]; accountId: string }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const { chores, showQueue, moveToEnd, dragProps } = useMovableQueue(groupId, setError);
  const [undo, setUndo] = useState<{ id: string; title: string }>();
  const undoTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(undoTimer.current), []);

  useEffect(() => {
    api
      .getQueue(groupId)
      .then(({ chores }) => showQueue(chores))
      .catch((err: unknown) => setError(errorMessage(err)));
  }, [groupId]);

  async function submit(form: HTMLFormElement) {
    const title = String(new FormData(form).get("title") ?? "");
    setBusy(true);
    setError(undefined);
    try {
      await api.addChore(groupId, { title, ...placementValue(form) });
      showQueue((await api.getQueue(groupId)).chores);
      setAdding(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  /** Carries the sheet's title and placement over to the full add screen. */
  function moreOptions(form: HTMLFormElement) {
    const data = new FormData(form);
    const query = new URLSearchParams({
      title: String(data.get("title") ?? ""),
      placement: String(data.get("placement") ?? "back"),
    });
    router.push(`/groups/${groupId}/chores/new?${query}`);
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
      showQueue((await api.getQueue(groupId)).chores);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
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
  }

  async function undoComplete(id: string) {
    dismissUndo();
    await runAndRefetch(() => api.undoCompleteChore(groupId, id));
  }

  const meta = (chore: ChoreDto) => (
    <ChoreMeta
      chore={chore}
      members={members}
      myMemberId={myMemberId}
      disabled={busy}
      onClaim={() => void runAndRefetch(() => api.claimChore(groupId, chore.id), LOST_CLAIM)}
      onUnclaim={() => void runAndRefetch(() => api.unclaimChore(groupId, chore.id))}
      onAssign={(assigneeId) => void runAndRefetch(() => api.assignChore(groupId, chore.id, { assigneeId }))}
    />
  );
  const moveMenu = (chore: ChoreDto) => <MoveMenu chore={chore} onMove={(to) => moveToEnd(chore, to)} />;

  const [next, ...rest] = chores ?? [];
  const nextDrag = next && dragProps(next);

  return (
    <section aria-label="Queue" className={styles.queue}>
      <h2 className={styles.visuallyHidden}>Queue</h2>
      {error && <ErrorBanner message={error} />}
      {chores && !next && (
        <EmptyState
          icon={<ClipboardList size={40} />}
          message="Nothing in the Queue yet. Add your first Chore, then share the Invite link so the others can join."
          action={
            <div className={styles.emptyActions}>
              <Button variant="primary" onClick={() => setAdding(true)}>
                Add your first Chore
              </Button>
              <Link href={`/groups/${groupId}/settings`}>Share the Invite link</Link>
            </div>
          }
        />
      )}
      {next && nextDrag && (
        <article aria-label="Next up" className={styles.hero} {...nextDrag.row}>
          <div className={styles.heroHead}>
            <DragHandle {...nextDrag.handle} />
            <h3 className={styles.eyebrow}>Next up</h3>
            {moveMenu(next)}
          </div>
          <ChoreTitle groupId={groupId} chore={next} className={styles.heroTitle} />
          {next.note && <p className={styles.note}>{next.note}</p>}
          {meta(next)}
          <button
            disabled={busy}
            onClick={() => void complete(next)}
            aria-label={`Complete ${next.title}`}
            className={styles.complete}
          >
            <Check aria-hidden size={20} />
            Complete
          </button>
        </article>
      )}
      {rest.length > 0 && (
        // role="list" keeps list semantics in Safari, which drops them when the markers are hidden.
        <ol start={2} role="list" aria-label="Queue list" className={styles.list}>
          {rest.map((c, i) => {
            const drag = dragProps(c);
            return (
              <li key={c.id} className={styles.row} {...drag.row}>
                <DragHandle {...drag.handle} />
                <span className={styles.number} aria-hidden>
                  {i + 2}
                </span>
                <ChoreTitle groupId={groupId} chore={c} className={styles.title} />
                {moveMenu(c)}
                {meta(c)}
              </li>
            );
          })}
        </ol>
      )}

      <Button
        variant="primary"
        className={[styles.fab, undo && styles.fabRaised].filter(Boolean).join(" ")}
        onClick={() => setAdding(true)} aria-label="Add a Chore">
        <Plus aria-hidden size={28} />
      </Button>
      <Sheet open={adding} onClose={() => setAdding(false)} title="Add a Chore">
        {adding && (
          <form
            aria-label="Add a Chore"
            onSubmit={(e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              void submit(e.currentTarget);
            }}
          >
            <label className={styles.sheetField}>
              Title <input name="title" maxLength={100} required />
            </label>
            <PlacementToggle />
            <div className={styles.sheetActions}>
              <Button variant="ghost" onClick={(e) => e.currentTarget.form && moreOptions(e.currentTarget.form)}>
                More options
              </Button>
              <Button variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={busy}>
                Add
              </Button>
            </div>
          </form>
        )}
      </Sheet>
      {undo && (
        <Toast
          action={
            <button onClick={() => void undoComplete(undo.id)} aria-label={`Undo completing ${undo.title}`}>
              Undo
            </button>
          }
        >
          Completed {undo.title}
        </Toast>
      )}
    </section>
  );
}
