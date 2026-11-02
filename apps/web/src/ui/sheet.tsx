"use client";

import { useId, type ReactNode } from "react";
import { useModal } from "./use-modal";
import styles from "./sheet.module.css";

export interface SheetProps {
  open: boolean;
  /** Called when the user dismisses the sheet (Escape); set `open` to false in response. */
  onClose(): void;
  title: string;
  children: ReactNode;
}

/** A bottom sheet on native `<dialog>`, for short forms. */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  const ref = useModal(open);
  const titleId = useId();
  return (
    <dialog ref={ref} className={styles.sheet} aria-labelledby={titleId} onClose={onClose}>
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
      {children}
    </dialog>
  );
}
