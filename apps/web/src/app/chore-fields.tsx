import { type ChoreDto, type MemberDto } from "@chorely/api-client";
import styles from "./chore-fields.module.css";

export type Placement = "front" | "back";

/** The add form's Front/Back toggle, as a radio pair named `placement`. */
export function PlacementToggle({ defaultValue = "back" }: { defaultValue?: Placement }) {
  return (
    <fieldset className={styles.toggle}>
      <legend>Add to</legend>
      {(["front", "back"] as const).map((value) => (
        <label key={value} className={styles.segment}>
          <input type="radio" name="placement" value={value} defaultChecked={value === defaultValue} />
          {value === "front" ? "Front" : "Back"}
        </label>
      ))}
    </fieldset>
  );
}

/** A Chore's Title, Note, Due date and Assignee inputs, shared by the full add and edit screens. */
export function ChoreFields({
  chore,
  members,
}: {
  chore?: Partial<Pick<ChoreDto, "title" | "note" | "dueDate" | "assigneeId">>;
  members: MemberDto[];
}) {
  const assignee = members.some((m) => m.id === chore?.assigneeId) ? (chore?.assigneeId ?? "") : "";
  return (
    <>
      <label>
        Title <input name="title" maxLength={100} defaultValue={chore?.title} required />
      </label>
      <label>
        Note <textarea name="note" maxLength={1000} defaultValue={chore?.note} />
      </label>
      <label>
        Due date <input name="dueDate" type="date" defaultValue={chore?.dueDate ?? ""} />
      </label>
      <label>
        Assignee
        <select name="assigneeId" defaultValue={assignee}>
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName ?? "Unnamed"}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

/** Reads `ChoreFields` from a submitted form as the API's add or update body. */
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

/** The toggle's choice as the add body's `placement`: Back is left out, so a Due date can seed the Position. */
export function placementValue(form: HTMLFormElement): { placement?: "front" } {
  return new FormData(form).get("placement") === "front" ? { placement: "front" } : {};
}
