import styles from "./segmented-control.module.css";

/**
 * A radio group drawn as one row of segments with the checked option filled. Inline, the legend is the row's first
 * segment; `stacked`, it sits above like a form field's label and the segments share the full width.
 */
export function SegmentedControl<T extends string>({
  legend,
  name,
  options,
  defaultValue,
  stacked = false,
}: {
  legend: string;
  name: string;
  options: readonly { value: T; label: string }[];
  defaultValue: T;
  stacked?: boolean;
}) {
  const segments = options.map((o) => (
    <label key={o.value} className={styles.segment}>
      <input type="radio" name={name} value={o.value} defaultChecked={o.value === defaultValue} />
      {o.label}
    </label>
  ));
  if (stacked) {
    return (
      <fieldset className={styles.stacked}>
        <legend className={styles.stackedLegend}>{legend}</legend>
        <div className={styles.track}>{segments}</div>
      </fieldset>
    );
  }
  return (
    <fieldset className={styles.control}>
      <legend className={styles.legend}>{legend}</legend>
      {segments}
    </fieldset>
  );
}
