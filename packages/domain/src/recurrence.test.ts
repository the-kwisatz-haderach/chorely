import { describe, expect, it } from "vitest";
import { nextDueDate } from "./recurrence";

describe("nextDueDate, calendar anchor", () => {
  it("steps every N days from the Due date", () => {
    expect(nextDueDate({ unit: "day", every: 3, anchor: "calendar" }, { dueDate: "2030-01-10", today: "2030-01-10" })).toBe(
      "2030-01-13",
    );
  });

  it("skips missed dates: the next one is the first schedule date after today", () => {
    const every3 = { unit: "day", every: 3, anchor: "calendar" } as const;
    // Schedule from Jan 10: 13, 16, 19, 22. Completed on the 19th, so the 19th itself is not "after today".
    expect(nextDueDate(every3, { dueDate: "2030-01-10", today: "2030-01-19" })).toBe("2030-01-22");
    expect(nextDueDate(every3, { dueDate: "2030-01-10", today: "2030-01-20" })).toBe("2030-01-22");
  });

  it("completing early still moves on past the current Due date", () => {
    expect(nextDueDate({ unit: "day", every: 7, anchor: "calendar" }, { dueDate: "2030-01-10", today: "2030-01-08" })).toBe(
      "2030-01-17",
    );
  });

  it("starts from today when the Occurrence had no Due date", () => {
    expect(nextDueDate({ unit: "day", every: 2, anchor: "calendar" }, { dueDate: null, today: "2030-02-27" })).toBe(
      "2030-03-01",
    );
  });

  it("steps every N weeks on the chosen weekdays, keeping the weeks of the Due date", () => {
    // Every 2 weeks on Monday and Thursday from Monday 7 Jan: 7, 10, 21, 24 Jan, 4 Feb.
    const fortnightly = { unit: "week", every: 2, weekdays: [1, 4], anchor: "calendar" } as const;
    expect(nextDueDate(fortnightly, { dueDate: "2030-01-07", today: "2030-01-07" })).toBe("2030-01-10");
    expect(nextDueDate(fortnightly, { dueDate: "2030-01-10", today: "2030-01-11" })).toBe("2030-01-21");
    expect(nextDueDate(fortnightly, { dueDate: "2030-01-10", today: "2030-01-25" })).toBe("2030-02-04");
  });

  it("treats Sunday as the last day of the week", () => {
    // Weekly on Sunday from Sunday 13 Jan: the Sunday at the end of the next week.
    const sundays = { unit: "week", every: 1, weekdays: [7], anchor: "calendar" } as const;
    expect(nextDueDate(sundays, { dueDate: "2030-01-13", today: "2030-01-13" })).toBe("2030-01-20");
  });

  it("steps every N months on the chosen day of the month", () => {
    const quarterly = { unit: "month", every: 3, dayOfMonth: 15, anchor: "calendar" } as const;
    expect(nextDueDate(quarterly, { dueDate: "2030-01-15", today: "2030-01-15" })).toBe("2030-04-15");
    // Missed April and July: the first schedule date after 20 July is in October.
    expect(nextDueDate(quarterly, { dueDate: "2030-01-15", today: "2030-07-20" })).toBe("2030-10-15");
    // Across a year end.
    expect(nextDueDate(quarterly, { dueDate: "2030-10-15", today: "2030-10-15" })).toBe("2031-01-15");
  });

  it("uses the last day of shorter months for days 29 to 31, without drifting", () => {
    const monthEnd = { unit: "month", every: 1, dayOfMonth: 31, anchor: "calendar" } as const;
    expect(nextDueDate(monthEnd, { dueDate: "2030-01-31", today: "2030-01-31" })).toBe("2030-02-28");
    expect(nextDueDate(monthEnd, { dueDate: "2030-02-28", today: "2030-02-28" })).toBe("2030-03-31");
    expect(nextDueDate(monthEnd, { dueDate: "2030-03-31", today: "2030-03-31" })).toBe("2030-04-30");
    // A leap year keeps 29 February.
    const day29 = { unit: "month", every: 1, dayOfMonth: 29, anchor: "calendar" } as const;
    expect(nextDueDate(day29, { dueDate: "2032-01-29", today: "2032-01-29" })).toBe("2032-02-29");
  });

  it("counts the months from the Due date's month even when its day is off the schedule", () => {
    // Every 2 months on the 1st, but this Occurrence was moved to 20 January: next is 1 March.
    const bimonthly = { unit: "month", every: 2, dayOfMonth: 1, anchor: "calendar" } as const;
    expect(nextDueDate(bimonthly, { dueDate: "2030-01-20", today: "2030-01-20" })).toBe("2030-03-01");
  });
});

describe("nextDueDate, completion anchor", () => {
  it("counts N days from the day it was completed, whatever the Due date was", () => {
    const every10 = { unit: "day", every: 10, anchor: "completion" } as const;
    expect(nextDueDate(every10, { dueDate: "2030-01-01", today: "2030-01-25" })).toBe("2030-02-04");
    expect(nextDueDate(every10, { dueDate: "2030-02-01", today: "2030-01-25" })).toBe("2030-02-04");
  });

  it("lands on the chosen weekday nearest to N weeks after completion, never just a day later", () => {
    // Weekly on Monday, completed on Sunday 13 Jan: a week on is Sunday 20 Jan, and Monday 21 Jan is nearest.
    const mondays = { unit: "week", every: 1, weekdays: [1], anchor: "completion" } as const;
    expect(nextDueDate(mondays, { dueDate: null, today: "2030-01-13" })).toBe("2030-01-21");
    // Monday and Thursday, completed on Wednesday 9 Jan: a week on is Wednesday 16 Jan, a tie, so the later Thursday.
    const twice = { unit: "week", every: 1, weekdays: [1, 4], anchor: "completion" } as const;
    expect(nextDueDate(twice, { dueDate: null, today: "2030-01-09" })).toBe("2030-01-17");
  });

  it("lands on the chosen day nearest to N months after completion", () => {
    // Monthly on the 1st, completed on 31 Jan: a month on is 28 Feb, and 1 Mar is nearest.
    const firsts = { unit: "month", every: 1, dayOfMonth: 1, anchor: "completion" } as const;
    expect(nextDueDate(firsts, { dueDate: null, today: "2030-01-31" })).toBe("2030-03-01");
  });

  it("lands on a chosen weekday about N weeks after completion", () => {
    // Completed on Tuesday 8 Jan: the next week starts Monday 14 Jan, two weeks on starts Monday 21 Jan.
    const weekly = { unit: "week", every: 1, weekdays: [4, 1], anchor: "completion" } as const;
    expect(nextDueDate(weekly, { dueDate: "2030-01-10", today: "2030-01-08" })).toBe("2030-01-14");
    const fortnightly = { unit: "week", every: 2, weekdays: [4], anchor: "completion" } as const;
    expect(nextDueDate(fortnightly, { dueDate: null, today: "2030-01-08" })).toBe("2030-01-24");
  });

  it("lands on the chosen day of the month N months after the completion month, clamped to its end", () => {
    const monthly = { unit: "month", every: 1, dayOfMonth: 15, anchor: "completion" } as const;
    expect(nextDueDate(monthly, { dueDate: "2030-01-15", today: "2030-01-28" })).toBe("2030-02-15");
    expect(nextDueDate(monthly, { dueDate: "2030-01-15", today: "2030-01-03" })).toBe("2030-02-15");
    const monthEnd = { unit: "month", every: 13, dayOfMonth: 31, anchor: "completion" } as const;
    expect(nextDueDate(monthEnd, { dueDate: null, today: "2030-01-31" })).toBe("2031-02-28");
  });
});
