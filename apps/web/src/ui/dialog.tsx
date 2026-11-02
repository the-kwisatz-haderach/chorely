import { Modal, type ModalProps } from "./modal";
import styles from "./dialog.module.css";

/** A centred modal on native `<dialog>`, for confirms. */
export function Dialog(props: ModalProps) {
  return <Modal {...props} styles={styles} />;
}
