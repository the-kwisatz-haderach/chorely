"use client";

import { useEffect, useState, type FormEvent } from "react";
import { type GroupDetailResponse } from "@chorely/api-client";
import { api } from "./api";
import { errorMessage } from "./error-message";
import { inviteUrl, tokenFromPasted } from "./invite";
import { Queue } from "./queue";

type State = { name: "loading" } | { name: "none" } | { name: "ready"; detail: GroupDetailResponse };

/** First-run screen when the Account has no Group, otherwise the Group's Members and its name. */
export function GroupScreen({ accountId }: { accountId: string }) {
  const [state, setState] = useState<State>({ name: "loading" });
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [inviteToken, setInviteToken] = useState<string>();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api
      .listGroups()
      .then(async ({ groups }) => {
        const first = groups[0];
        setState(first ? { name: "ready", detail: await api.getGroup(first.id) } : { name: "none" });
      })
      .catch((err: unknown) => setError(errorMessage(err)));
  }, []);

  const groupId = state.name === "ready" ? state.detail.group.id : undefined;
  useEffect(() => {
    if (!groupId) return;
    api
      .getInviteLink(groupId)
      .then(({ token }) => setInviteToken(token ?? undefined))
      .catch((err: unknown) => setError(errorMessage(err)));
  }, [groupId]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const field = (e: FormEvent<HTMLFormElement>, key: string) => String(new FormData(e.currentTarget).get(key) ?? "");
  const name = (e: FormEvent<HTMLFormElement>) => field(e, "name");

  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copy(url: string) {
    await navigator.clipboard.writeText(url);
    setCopied(true);
  }

  async function share(url: string) {
    try {
      await navigator.share({ title: "Join my Group on Chorely", url });
    } catch {
      // Dismissing the share sheet is not an error.
    }
  }

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

      {state.name === "none" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const token = tokenFromPasted(field(e, "invite"));
            void run(async () => {
              const { group } = await api.joinGroup({ token });
              setState({ name: "ready", detail: await api.getGroup(group.id) });
            });
          }}
        >
          <h2>Or join a Group</h2>
          <label>
            Paste an Invite link <input name="invite" required />
          </label>
          <button disabled={busy}>Join Group</button>
        </form>
      )}

      {state.name === "ready" && (
        <>
          <h2>{state.detail.group.name}</h2>
          <Queue groupId={state.detail.group.id} members={state.detail.members} accountId={accountId} />
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
          <h3>Invite people</h3>
          {inviteToken ? (
            <>
              <p>Share this link. Anyone who opens it can join the Group.</p>
              <input readOnly aria-label="Invite link" value={inviteUrl(window.location.origin, inviteToken)} />
              <button onClick={() => void run(() => copy(inviteUrl(window.location.origin, inviteToken)))}>Copy</button>
              {canShare && (
                <button onClick={() => void run(() => share(inviteUrl(window.location.origin, inviteToken)))}>Share</button>
              )}
              {copied && <span role="status"> Copied</span>}
            </>
          ) : (
            <p>Make an Invite link to add people. Making a new one stops any link shared before.</p>
          )}
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const { token } = await api.createInviteLink(state.detail.group.id);
                setCopied(false);
                setInviteToken(token);
              })
            }
          >
            {inviteToken ? "Replace Invite link" : "Create Invite link"}
          </button>
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
