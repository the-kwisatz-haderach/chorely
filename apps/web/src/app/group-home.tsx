"use client";

import { useEffect, useState, type FormEvent } from "react";
import { type GroupDetailResponse } from "@chorely/api-client";
import { api } from "./api";
import { errorMessage } from "./error-message";
import { tokenFromPasted } from "./invite";
import { Queue } from "./queue";
import { TopBar } from "./top-bar";

type State = { name: "loading" } | { name: "none" } | { name: "ready"; detail: GroupDetailResponse };

/** The home screen: first run when the Account has no Group, otherwise the app shell around the Group's Queue. */
export function GroupHome({ accountId }: { accountId: string }) {
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
      .catch((err: unknown) => setError(errorMessage(err)));
  }, []);

  async function enter(action: () => Promise<{ group: { id: string } }>) {
    setBusy(true);
    setError(undefined);
    try {
      const { group } = await action();
      setState({ name: "ready", detail: await api.getGroup(group.id) });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const field = (e: FormEvent<HTMLFormElement>, key: string) => String(new FormData(e.currentTarget).get(key) ?? "");

  return (
    <>
      {state.name === "ready" ? (
        <>
          <TopBar title={state.detail.group.name} groupId={state.detail.group.id} />
          <Queue groupId={state.detail.group.id} members={state.detail.members} accountId={accountId} />
        </>
      ) : (
        <TopBar title="Chorely" />
      )}

      {state.name === "none" && (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const name = field(e, "name");
              void enter(() => api.createGroup({ name }));
            }}
          >
            <h2>Create your Group</h2>
            <label>
              Group name <input name="name" maxLength={60} required />
            </label>
            <button disabled={busy}>Create Group</button>
          </form>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const token = tokenFromPasted(field(e, "invite"));
              void enter(() => api.joinGroup({ token }));
            }}
          >
            <h2>Or join a Group</h2>
            <label>
              Paste an Invite link <input name="invite" required />
            </label>
            <button disabled={busy}>Join Group</button>
          </form>
        </>
      )}

      {error && <p role="alert">{error}</p>}
    </>
  );
}
