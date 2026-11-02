"use client";

import { useId, useRef, type ButtonHTMLAttributes, type ReactNode, type ToggleEvent } from "react";
import styles from "./menu.module.css";

/** A trigger button and a Popover API menu of `MenuItem`s, placed under the trigger's right edge. */
export function Menu({ label, trigger, children }: { label: string; trigger: ReactNode; children: ReactNode }) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Placed on open rather than with CSS anchor positioning, which not every target browser has yet.
  function place(e: ToggleEvent<HTMLDivElement>) {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (e.newState !== "open" || !rect) return;
    e.currentTarget.style.setProperty("--menu-top", `${rect.bottom + 4}px`);
    e.currentTarget.style.setProperty("--menu-right", `${window.innerWidth - rect.right}px`);
  }

  return (
    <>
      <button ref={triggerRef} type="button" className={styles.trigger} popoverTarget={id} aria-label={label}>
        {trigger}
      </button>
      <div id={id} popover="auto" className={styles.menu} onBeforeToggle={place}>
        {children}
      </div>
    </>
  );
}

/** One action in a `Menu`; picking it closes the menu. */
export function MenuItem({ onClick, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={styles.item}
      onClick={(e) => {
        e.currentTarget.closest<HTMLElement>("[popover]")?.hidePopover();
        onClick?.(e);
      }}
      {...props}
    />
  );
}
