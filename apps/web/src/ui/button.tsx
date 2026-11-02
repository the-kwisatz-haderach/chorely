import type { ButtonHTMLAttributes } from "react";
import { cx } from "./class-names";
import styles from "./button.module.css";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "inverse";
export type ButtonSize = "regular" | "small";

/** A Button's classes, for a link that should look like one. */
export function buttonClassName({
  variant = "secondary",
  size = "regular",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}): string {
  return cx(styles.button, styles[variant], size === "small" && styles.small, className);
}

/**
 * A native `<button>` in one of the looks, regular or small. `outline` takes its colour from its surroundings and
 * `inverse` is for a `--color-primary` surface. Defaults to `type="button"`, so pass `type="submit"` in forms.
 */
export function Button({
  variant,
  size,
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type={type} className={buttonClassName({ variant, size, className })} {...props} />;
}
