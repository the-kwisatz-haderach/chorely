import { type AddChoreBody, type ChoreDto, type MemberDto } from "@chorely/api-client";
import { type Placement } from "@chorely/domain";
import { useId } from "react";
import { SegmentedControl } from "../ui";
import styles from "./chore-form.module.css";

/** Reads a query or form value as a Placement: anything but "front" is the back. */
export function parsePlacement(value: unknown): Placement {
  return value === "front" ? "front" : "back";
}

/** The add form's Front/Back toggle, as a radio pair named `placement`. `stacked` is the full add screen's look. */
export function PlacementToggle({ defaultValue = "back", stacked }: { defaultValue?: Placement; stacked?: boolean }) {
  return (
    <SegmentedControl
      legend="Add to"
      name="placement"
      options={[
        { value: "front", label: "Front" },
        { value: "back", label: "Back" },
      ]}
      defaultValue={defaultValue}
      stacked={stacked}
    />
  );
}

/** A select's options for choosing an Assignee: Unassigned, then every Member. */
export function MemberOptions({ members }: { members: MemberDto[] }) {
  return (
    <>
      <option value="">Unassigned</option>
      {members.map((m) => (
        <option key={m.id} value={m.id}>
          {m.displayName ?? "Unnamed"}
        </option>
      ))}
    </>
  );
}

/** A Chore's Title, Note, Due date and Assignee inputs, shared by the full add and edit screens. */
export function ChoreFields({
  chore,
  members,
  dueDateHint,
}: {
  chore?: Partial<Pick<ChoreDto, "title" | "note" | "dueDate" | "assigneeId">>;
  members: MemberDto[];
  /** A muted line under the Due date, linked to it as its description. */
  dueDateHint?: string;
}) {
  const dueDateId = useId();
  const assignee = members.some((m) => m.id === chore?.assigneeId) ? (chore?.assigneeId ?? "") : "";
  return (
    <>
      <label className={styles.field}>
        Title
        <input name="title" className={styles.control} maxLength={100} defaultValue={chore?.title} required />
      </label>
      <label className={styles.field}>
        Note
        <textarea name="note" className={styles.control} maxLength={1000} defaultValue={chore?.note} />
      </label>
      <div className={styles.field}>
        <label htmlFor={dueDateId}>Due date</label>
        <input
          id={dueDateId}
          name="dueDate"
          type="date"
          className={styles.control}
          defaultValue={chore?.dueDate ?? ""}
          aria-describedby={dueDateHint ? `${dueDateId}-hint` : undefined}
        />
        {dueDateHint && (
          <p id={`${dueDateId}-hint`} className={styles.hint}>
            {dueDateHint}
          </p>
        )}
      </div>
      <label className={styles.field}>
        Assignee
        <select name="assigneeId" className={styles.control} defaultValue={assignee}>
          <MemberOptions members={members} />
        </select>
      </label>
    </>
  );
}

/** Reads `ChoreFields` from a submitted form as the API's update body. Fields the form lacks read as empty. */
export function choreFieldValues(form: HTMLFormElement) {
  const data = new FormData(form);
  const text = (key: string) => String(data.get(key) ?? "");
  return {
    title: text("title"),
    note: text("note"),
    dueDate: text("dueDate") || null,
    assigneeId: text("assigneeId") || null,
  };
}

/**
 * Reads an add form (the Queue's sheet or the full add screen) as the API's add body. Back leaves `placement` out,
 * so a Due date can seed the Position; without one, the server adds to the back anyway.
 */
export function addChoreBody(form: HTMLFormElement): AddChoreBody {
  const front = parsePlacement(new FormData(form).get("placement")) === "front";
  return { ...choreFieldValues(form), ...(front ? { placement: "front" } : {}) };
}
