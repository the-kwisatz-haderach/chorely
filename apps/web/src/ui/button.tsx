import type { ButtonHTMLAttributes } from "react";
import styles from "./button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

/** A native `<button>` in one of the four looks. Defaults to `type="button"`, so pass `type="submit"` in forms. */
export function Button({
  variant = "secondary",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button type={type} className={[styles.button, styles[variant], className].filter(Boolean).join(" ")} {...props} />;
}
