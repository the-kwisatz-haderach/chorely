/** Joins the truthy class names, for adding a caller's or a state's class to a primitive's own. */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}
