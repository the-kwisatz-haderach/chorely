import { useState } from "react";
import { type MemberDto, type RecurrenceBody, type RecurrenceDto } from "@chorely/api-client";
import { type Weekday } from "@chorely/domain";
import { SegmentedControl } from "../ui";
import { MemberOptions } from "./chore-fields";
import { todayLocal } from "./today";

type Unit = RecurrenceDto["unit"];

const UNITS: Record<Unit, string> = { day: "days", week: "weeks", month: "months" };
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** The ISO weekday (1 is Monday) of a `YYYY-MM-DD` date. */
function weekdayOf(date: string): Weekday {
  return (((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1) as Weekday;
}

/**
 * A Chore's schedule: Repeats (none, days, weeks or months) and, once it repeats, every N, the weekdays or day of the
 * month, fixed calendar or after completion, and the Member each new Occurrence goes to. A new schedule starts on
 * the weekday or day of the Due date, or of today.
 */
export function RecurrenceFields({
  recurrence,
  dueDate,
  members,
}: {
  recurrence: RecurrenceDto | null;
  dueDate: string | null;
  members: MemberDto[];
}) {
  const [unit, setUnit] = useState<Unit | "">(recurrence?.unit ?? "");
  const start = dueDate ?? todayLocal();
  const weekdays = recurrence?.unit === "week" ? recurrence.weekdays : [weekdayOf(start)];
  const dayOfMonth = recurrence?.unit === "month" ? recurrence.dayOfMonth : Number(start.slice(8, 10));
  const assignee = members.some((m) => m.id === recurrence?.assigneeId) ? (recurrence?.assigneeId ?? "") : "";

  return (
    <fieldset>
      <legend>Repeat</legend>
      <label>
        Repeats
        <select name="repeatUnit" value={unit} onChange={(e) => setUnit(e.target.value as Unit | "")}>
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
          <label>
            Every <input name="repeatEvery" type="number" min={1} max={unit === "day" ? 365 : unit === "week" ? 52 : 24} defaultValue={recurrence?.every ?? 1} required />{" "}
            {UNITS[unit]}
          </label>
          {unit === "week" && (
            <fieldset>
              <legend>On</legend>
              {WEEKDAYS.map((label, i) => (
                <label key={label}>
                  <input type="checkbox" name="repeatWeekday" value={i + 1} defaultChecked={weekdays.includes((i + 1) as Weekday)} />
                  {label}
                </label>
              ))}
            </fieldset>
          )}
          {unit === "month" && (
            <label>
              On day <input name="repeatDayOfMonth" type="number" min={1} max={31} defaultValue={dayOfMonth} required />
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
          />
          <label>
            Assign each new Occurrence to
            <select name="repeatAssigneeId" defaultValue={assignee}>
              <MemberOptions members={members} />
            </select>
          </label>
        </>
      )}
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
