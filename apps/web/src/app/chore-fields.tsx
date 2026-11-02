import { type AddChoreBody, type ChoreDto, type MemberDto } from "@chorely/api-client";
import { type Placement } from "@chorely/domain";
import { SegmentedControl } from "../ui";

/** Reads a query or form value as a Placement: anything but "front" is the back. */
export function parsePlacement(value: unknown): Placement {
  return value === "front" ? "front" : "back";
}

/** The add form's Front/Back toggle, as a radio pair named `placement`. */
export function PlacementToggle({ defaultValue = "back" }: { defaultValue?: Placement }) {
  return (
    <SegmentedControl
      legend="Add to"
      name="placement"
      options={[
        { value: "front", label: "Front" },
        { value: "back", label: "Back" },
      ]}
      defaultValue={defaultValue}
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
