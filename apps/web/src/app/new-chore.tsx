"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { type MemberDto } from "@chorely/api-client";
import { api } from "./api";
import { ChoreFields, PlacementToggle, choreFieldValues, placementValue, type Placement } from "./chore-fields";
import { errorMessage } from "./error-message";

/** Full-page add screen, reached by "More options" from the Queue's add sheet with its title and placement carried over. */
export function NewChore({ groupId, title, placement }: { groupId: string; title: string; placement: Placement }) {
  const router = useRouter();
  const [members, setMembers] = useState<MemberDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    api
      .getGroup(groupId)
      .then((detail) => setMembers(detail.members))
      .catch((err: unknown) => setError(errorMessage(err)));
  }, [groupId]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = { ...choreFieldValues(e.currentTarget), ...placementValue(e.currentTarget) };
    setBusy(true);
    setError(undefined);
    try {
      await api.addChore(groupId, body);
      router.push("/");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <>
      <h2>Add a Chore</h2>
      <form aria-label="Add a Chore" onSubmit={(e) => void onSubmit(e)}>
        <ChoreFields chore={{ title }} members={members} />
        <PlacementToggle defaultValue={placement} />
        <p>On Back, a Chore with a Due date is placed by its date instead.</p>
        <button disabled={busy}>Add</button>
        <a href="/">Cancel</a>
      </form>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
