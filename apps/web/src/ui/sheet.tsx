import { Modal, type ModalProps } from "./modal";
import styles from "./sheet.module.css";

/** A bottom sheet on native `<dialog>`, for short forms. */
export function Sheet(props: ModalProps) {
  return <Modal {...props} styles={{ dialog: styles.sheet, title: styles.title }} />;
}
