/** Date-only, `YYYY-MM-DD`, in the Member's local calendar. */
type DateOnly = string;

/** ISO weekday: 1 is Monday, 7 is Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * What a Recurring Chore repeats on. `calendar` keeps a fixed schedule; `completion` counts from the day the
 * Occurrence was completed.
 */
export type Recurrence = { anchor: "calendar" | "completion"; every: number } & (
  | { unit: "day" }
  | { unit: "week"; weekdays: readonly Weekday[] }
  /** Days 29 to 31 fall on the last day of shorter months. */
  | { unit: "month"; dayOfMonth: number }
);

const DAY_MS = 86_400_000;

function toDays(date: DateOnly): number {
  return Date.parse(`${date}T00:00:00Z`) / DAY_MS;
}

function fromDays(days: number): DateOnly {
  return new Date(days * DAY_MS).toISOString().slice(0, 10);
}

/** Day 0 (1 Jan 1970) was a Thursday. */
function weekday(days: number): Weekday {
  return ((((days + 3) % 7) + 7) % 7 + 1) as Weekday;
}

/** The ISO weekday of a date. */
export function weekdayOf(date: DateOnly): Weekday {
  return weekday(toDays(date));
}

function mondayOf(days: number): number {
  return days - weekday(days) + 1;
}

/** Months since January of year 0, so months can be counted across years. */
function monthIndex(date: DateOnly): number {
  return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
}

/** `dayOfMonth` in the month `index`, or that month's last day when it is shorter. */
function dayInMonth(index: number, dayOfMonth: number): DateOnly {
  const year = Math.floor(index / 12);
  const month = index % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(dayOfMonth, lastDay))).toISOString().slice(0, 10);
}

/** The day in `days` closest to `target`, the later one on a tie. */
function nearest(days: number[], target: number): number {
  return days.reduce((best, day) => {
    const closer = Math.abs(day - target) - Math.abs(best - target);
    return closer < 0 || (closer === 0 && day > best) ? day : best;
  });
}

/** `n` mod `m`, never negative. */
function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/** The Due date of the Occurrence that completing one due `dueDate` on `today` creates. */
export function nextDueDate(recurrence: Recurrence, { dueDate, today }: { dueDate: DateOnly | null; today: DateOnly }): DateOnly {
  const { every } = recurrence;
  if (recurrence.anchor === "completion") {
    // The schedule day nearest to N periods after completion, the later one on a tie.
    if (recurrence.unit === "day") return fromDays(toDays(today) + every);
    if (recurrence.unit === "month") {
      const target = toDays(dayInMonth(monthIndex(today) + every, Number(today.slice(8, 10))));
      const month = monthIndex(fromDays(target));
      const candidates = [month - 1, month, month + 1].map((m) => toDays(dayInMonth(m, recurrence.dayOfMonth)));
      return fromDays(nearest(candidates, target));
    }
    const target = toDays(today) + 7 * every;
    const candidates = [-3, -2, -1, 0, 1, 2, 3].map((offset) => target + offset);
    return fromDays(nearest(candidates.filter((day) => recurrence.weekdays.includes(weekday(day))), target));
  }

  // The schedule is anchored on the Due date. The next date is after both today and that Due date, so missed
  // dates are skipped (no catch-ups) and completing early never repeats the date just done.
  const anchor = toDays(dueDate ?? today);
  const after = Math.max(anchor, toDays(today));
  if (recurrence.unit === "day") return fromDays(anchor + (Math.floor((after - anchor) / every) + 1) * every);

  if (recurrence.unit === "month") {
    // Every `every`-th month counted from the anchor's month. The first candidate month is the one `after` is
    // in, or the one after it when the schedule day there is not later.
    const anchorMonth = monthIndex(fromDays(anchor));
    let month = anchorMonth + Math.ceil((monthIndex(fromDays(after)) - anchorMonth) / every) * every;
    if (toDays(dayInMonth(month, recurrence.dayOfMonth)) <= after) month += every;
    return dayInMonth(month, recurrence.dayOfMonth);
  }

  // Every `every`-th week counted from the anchor's week, on the chosen weekdays. A schedule date turns up
  // within `every` weeks, so the search is bounded.
  const anchorWeek = mondayOf(anchor);
  for (let day = after + 1; day <= after + 7 * every + 7; day++) {
    const onWeek = mod((mondayOf(day) - anchorWeek) / 7, every) === 0;
    if (onWeek && recurrence.weekdays.includes(weekday(day))) return fromDays(day);
  }
  throw new Error("A weekly Recurrence needs at least one weekday");
}
