"use client";

import { useId, type ReactNode } from "react";
import { useModal } from "./use-modal";
import styles from "./dialog.module.css";

export interface DialogProps {
  open: boolean;
  /** Called when the user dismisses the dialog (Escape); set `open` to false in response. */
  onClose(): void;
  title: string;
  children: ReactNode;
}

/** A centred modal on native `<dialog>`, for confirms. */
export function Dialog({ open, onClose, title, children }: DialogProps) {
  const ref = useModal(open);
  const titleId = useId();
  return (
    <dialog ref={ref} className={styles.dialog} aria-labelledby={titleId} onClose={onClose}>
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
      {children}
    </dialog>
  );
}
