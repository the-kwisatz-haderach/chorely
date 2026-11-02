"use client";

import { useEffect, useRef } from "react";
import { api } from "./api";

/** How often an open, visible Queue asks whether the Group has changed. */
const POLL_MS = 4000;

/**
 * Polls the Group revision every few seconds while the tab is visible and hands each one to `onRevision`. Polling
 * stops while the tab is hidden and polls at once when it is shown again. A failed poll is dropped: the next one
 * retries.
 */
export function useRevisionPoll(groupId: string, onRevision: (revision: number) => Promise<void>) {
  const latest = useRef(onRevision);
  useEffect(() => {
    latest.current = onRevision;
  });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polling = false;
    let stopped = false;
    const visible = () => document.visibilityState === "visible";

    async function poll() {
      timer = undefined;
      polling = true;
      try {
        await latest.current((await api.getRevision(groupId)).revision);
      } catch {
        // Dropped; the next poll retries.
      } finally {
        polling = false;
      }
      if (!stopped && visible() && !timer) timer = setTimeout(() => void poll(), POLL_MS);
    }

    function onVisibilityChange() {
      clearTimeout(timer);
      timer = undefined;
      // A poll still running schedules the next one itself when it ends.
      if (visible() && !polling) void poll();
    }

    if (visible()) timer = setTimeout(() => void poll(), POLL_MS);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [groupId]);
}
