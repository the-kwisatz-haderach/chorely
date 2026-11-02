import styles from "./segmented-control.module.css";

/** A radio group drawn as one row of segments, its legend first and the checked option filled. */
export function SegmentedControl<T extends string>({
  legend,
  name,
  options,
  defaultValue,
}: {
  legend: string;
  name: string;
  options: readonly { value: T; label: string }[];
  defaultValue: T;
}) {
  return (
    <fieldset className={styles.control}>
      <legend className={styles.legend}>{legend}</legend>
      {options.map((o) => (
        <label key={o.value} className={styles.segment}>
          <input type="radio" name={name} value={o.value} defaultChecked={o.value === defaultValue} />
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}
