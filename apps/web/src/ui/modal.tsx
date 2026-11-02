"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

export interface ModalProps {
  open: boolean;
  /** Called when the user dismisses it (Escape); set `open` to false in response. */
  onClose(): void;
  title: string;
  children: ReactNode;
}

/** A native `<dialog>` shown as a modal while `open` is true, titled by a heading. Dialog and Sheet differ only in styles. */
export function Modal({ open, onClose, title, children, styles }: ModalProps & { styles: { dialog?: string; title?: string } }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className={styles.dialog} aria-labelledby={titleId} onClose={onClose}>
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
      {children}
    </dialog>
  );
}
