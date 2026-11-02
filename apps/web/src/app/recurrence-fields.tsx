import { useState } from "react";
import { type MemberDto, type RecurrenceBody, type RecurrenceDto } from "@chorely/api-client";
import { weekdayOf, type Weekday } from "@chorely/domain";
import { SegmentedControl } from "../ui";
import { MemberOptions } from "./chore-fields";
import styles from "./chore-form.module.css";
import { todayLocal } from "./today";

type Unit = RecurrenceDto["unit"];

const UNITS: Record<Unit, string> = { day: "days", week: "weeks", month: "months" };
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/**
 * A Chore's schedule: Repeats (none, days, weeks or months) and, once it repeats, every N, the weekdays or day of the
 * month, fixed calendar or after completion, and the Member each new Occurrence goes to. A new schedule starts on
 * the weekday or day of the Due date, or of today.
 */
export function RecurrenceFields({
  recurrence,
  dueDate,
  members,
  scheduleHint,
}: {
  recurrence: RecurrenceDto | null;
  dueDate: string | null;
  members: MemberDto[];
  /** A muted line at the end of the section. */
  scheduleHint?: string;
}) {
  const [unit, setUnit] = useState<Unit | "">(recurrence?.unit ?? "");
  const start = dueDate ?? todayLocal();
  const weekdays = recurrence?.unit === "week" ? recurrence.weekdays : [weekdayOf(start)];
  const dayOfMonth = recurrence?.unit === "month" ? recurrence.dayOfMonth : Number(start.slice(8, 10));
  const assignee = members.some((m) => m.id === recurrence?.assigneeId) ? (recurrence?.assigneeId ?? "") : "";

  return (
    <fieldset className={styles.section}>
      <legend className={styles.sectionHeading}>Repeat</legend>
      <label className={styles.field}>
        Repeats
        <select name="repeatUnit" className={styles.control} value={unit} onChange={(e) => setUnit(e.target.value as Unit | "")}>
          <option value="">Does not repeat</option>
          {Object.entries(UNITS).map(([value, label]) => (
            <option key={value} value={value}>
              Every N {label}
            </option>
          ))}
        </select>
      </label>
      {unit && (
        <>
          <label className={styles.inlineField}>
            Every
            <input
              name="repeatEvery"
              type="number"
              className={styles.control}
              min={1}
              max={unit === "day" ? 365 : unit === "week" ? 52 : 24}
              defaultValue={recurrence?.every ?? 1}
              required
            />
            {UNITS[unit]}
          </label>
          {unit === "week" && (
            <fieldset className={styles.weekdays}>
              <legend className={styles.weekdaysLegend}>On</legend>
              {WEEKDAYS.map((label, i) => (
                <label key={label} className={styles.weekday}>
                  <input type="checkbox" name="repeatWeekday" value={i + 1} defaultChecked={weekdays.includes((i + 1) as Weekday)} />
                  {label}
                </label>
              ))}
            </fieldset>
          )}
          {unit === "month" && (
            <label className={styles.inlineField}>
              On day
              <input name="repeatDayOfMonth" type="number" className={styles.control} min={1} max={31} defaultValue={dayOfMonth} required />
            </label>
          )}
          <SegmentedControl
            legend="Schedule"
            name="repeatAnchor"
            options={[
              { value: "calendar", label: "Fixed calendar" },
              { value: "completion", label: "After completion" },
            ]}
            defaultValue={recurrence?.anchor ?? "calendar"}
            stacked
          />
          <label className={styles.field}>
            Assign each new Occurrence to
            <select name="repeatAssigneeId" className={styles.control} defaultValue={assignee}>
              <MemberOptions members={members} />
            </select>
          </label>
        </>
      )}
      {scheduleHint && <p className={styles.hint}>{scheduleHint}</p>}
    </fieldset>
  );
}

/** Reads `RecurrenceFields` from a submitted form: null when it does not repeat, or an error to show. */
export function recurrenceValue(form: HTMLFormElement): { recurrence: RecurrenceBody | null } | { error: string } {
  const data = new FormData(form);
  const unit = String(data.get("repeatUnit") ?? "");
  if (unit !== "day" && unit !== "week" && unit !== "month") return { recurrence: null };
  const common = {
    every: Number(data.get("repeatEvery")),
    anchor: data.get("repeatAnchor") === "completion" ? "completion" : "calendar",
    assigneeId: String(data.get("repeatAssigneeId") ?? "") || null,
  } as const;
  if (unit === "week") {
    const weekdays = data.getAll("repeatWeekday").map((d) => Number(d) as Weekday);
    if (weekdays.length === 0) return { error: "Pick at least one weekday to repeat on." };
    return { recurrence: { unit, ...common, weekdays } };
  }
  if (unit === "month") return { recurrence: { unit, ...common, dayOfMonth: Number(data.get("repeatDayOfMonth")) } };
  return { recurrence: { unit, ...common } };
}
