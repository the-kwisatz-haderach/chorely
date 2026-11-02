"use client";

import { useRef, useState, type DragEvent } from "react";
import { ApiError, type ChoreDto } from "@chorely/api-client";
import { positionBetween } from "@chorely/domain";
import { api } from "./api";
import { errorMessage } from "./error-message";

/** The Queue order the server uses: `(position, id)`, byte-wise (keys and ids are ASCII). */
function inQueueOrder(chores: ChoreDto[]): ChoreDto[] {
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return [...chores].sort((a, b) => cmp(a.position, b.position) || cmp(a.id, b.id));
}

const LOST_MOVE = "The Queue changed while you were moving that Chore, so it has been refreshed.";

/**
 * The Group's open Chores, reorderable by drag and by Move to front / back (ADR 0002). Moves show instantly with a
 * provisional key and are reconciled with the key the server generates; a failed move refetches the Queue.
 */
export function useMovableQueue(groupId: string, setError: (message: string | undefined) => void) {
  const [chores, setChores] = useState<ChoreDto[]>();
  const queue = chores ?? [];

  // Moves still in flight, by Chore id: the latest move's number and its provisional key. A fetched Queue keeps
  // these keys so it cannot undo an optimistic move, and only the latest move's response is reconciled.
  const moving = useRef(new Map<string, { seq: number; position: string }>());
  const moveSeq = useRef(0);
  // Moves are sent one at a time, in order: each one's anchors assume the moves before it have landed.
  const moveChain = useRef<Promise<void>>(Promise.resolve());
  const dragged = useRef<string>(undefined);
  const [dragging, setDragging] = useState<string>();
  const [over, setOver] = useState<string>();

  /** Shows a fetched Queue, keeping the provisional key of any Chore whose move is still in flight. */
  function showQueue(fetched: ChoreDto[]) {
    setChores(inQueueOrder(fetched.map((c) => ({ ...c, position: moving.current.get(c.id)?.position ?? c.position }))));
  }

  /** Moves a Chore to `index` among the others. */
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

  function moveToEnd(chore: ChoreDto, to: "front" | "back") {
    void move(chore, to === "front" ? 0 : queue.length - 1);
  }

  /**
   * Drag and drop from a row's handle: dropping on a Chore lands below it when dragging down, above it when dragging
   * up. `row` goes on the Chore's row and marks it `data-dragging` while lifted and `data-drop="before"|"after"` where
   * the dragged Chore will land; `handle` goes on its drag handle.
   */
  function dragProps(chore: ChoreDto) {
    const from = queue.findIndex((c) => c.id === dragging);
    const at = queue.findIndex((c) => c.id === chore.id);
    const drop = dragging && over === chore.id && from !== at ? (at > from ? "after" : "before") : undefined;
    const endDrag = () => {
      dragged.current = undefined;
      setDragging(undefined);
      setOver(undefined);
    };
    return {
      row: {
        "data-drag-row": "",
        "data-dragging": dragging === chore.id || undefined,
        "data-drop": drop,
        onDragOver: (e: DragEvent) => {
          if (!dragged.current) return;
          e.preventDefault();
          setOver(chore.id);
        },
        onDrop: (e: DragEvent) => {
          e.preventDefault();
          const moved = queue.find((c) => c.id === dragged.current);
          const to = queue.findIndex((c) => c.id === chore.id);
          endDrag();
          if (!moved || moved.id === chore.id) return;
          void move(moved, to);
        },
      },
      handle: {
        draggable: true,
        onDragStart: (e: DragEvent<HTMLElement>) => {
          dragged.current = chore.id;
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", chore.id);
          // The whole row is the drag image, held where the handle was grabbed.
          const row = e.currentTarget.closest<HTMLElement>("[data-drag-row]");
          if (row) {
            const box = row.getBoundingClientRect();
            e.dataTransfer.setDragImage(row, e.clientX - box.left, e.clientY - box.top);
          }
          // Lifted on the next frame: changing the source row during dragstart can cancel the drag in some browsers.
          requestAnimationFrame(() => {
            if (dragged.current === chore.id) setDragging(chore.id);
          });
        },
        onDragEnd: endDrag,
      },
    };
  }

  return { chores, showQueue, moveToEnd, dragProps };
}
