"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ApiError, type GroupDetailResponse } from "@chorely/api-client";
import { api } from "./api";
import { Queue } from "./queue";

type State = { name: "loading" } | { name: "none" } | { name: "ready"; detail: GroupDetailResponse };

function message(err: unknown): string {
  return err instanceof ApiError ? err.message : "Something went wrong. Try again.";
}

/** First-run screen when the Account has no Group, otherwise the Group's Members and its name. */
export function GroupScreen() {
  const [state, setState] = useState<State>({ name: "loading" });
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .listGroups()
      .then(async ({ groups }) => {
        const first = groups[0];
        setState(first ? { name: "ready", detail: await api.getGroup(first.id) } : { name: "none" });
      })
      .catch((err: unknown) => setError(message(err)));
  }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  const name = (e: FormEvent<HTMLFormElement>) => String(new FormData(e.currentTarget).get("name") ?? "");

  return (
    <section>
      {state.name === "none" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const groupName = name(e);
            void run(async () => {
              const { group } = await api.createGroup({ name: groupName });
              setState({ name: "ready", detail: await api.getGroup(group.id) });
            });
          }}
        >
          <h2>Create your Group</h2>
          <label>
            Group name <input name="name" maxLength={60} required />
          </label>
          <button disabled={busy}>Create Group</button>
        </form>
      )}

      {state.name === "ready" && (
        <>
          <h2>{state.detail.group.name}</h2>
          <Queue groupId={state.detail.group.id} members={state.detail.members} />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const groupName = name(e);
              const { id } = state.detail.group;
              void run(async () => {
                const { group } = await api.renameGroup(id, { name: groupName });
                setState({ name: "ready", detail: { ...state.detail, group } });
              });
            }}
          >
            <label>
              Rename Group <input name="name" maxLength={60} defaultValue={state.detail.group.name} required />
            </label>
            <button disabled={busy}>Rename</button>
          </form>
          <h3>Members</h3>
          <ul>
            {state.detail.members.map((m) => (
              <li key={m.id}>{m.displayName ?? "Unnamed"}</li>
            ))}
          </ul>
        </>
      )}

      {error && <p role="alert">{error}</p>}
    </section>
  );
}
