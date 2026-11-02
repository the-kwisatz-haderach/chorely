"use client";

import { useEffect, useState, type FormEvent } from "react";
import { type GroupDetailResponse } from "@chorely/api-client";
import { api } from "./api";
import { errorMessage } from "./error-message";
import { inviteUrl } from "./invite";

/** The Group screen: rename the Group, share or replace its Invite link, and see its Members. */
export function GroupSettings({
  detail,
  onChange,
}: {
  detail: GroupDetailResponse;
  onChange(detail: GroupDetailResponse): void;
}) {
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [inviteToken, setInviteToken] = useState<string>();
  const [copied, setCopied] = useState(false);

  const groupId = detail.group.id;
  useEffect(() => {
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

  const name = (e: FormEvent<HTMLFormElement>) => String(new FormData(e.currentTarget).get("name") ?? "");

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
    <section aria-label="Group screen">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const groupName = name(e);
          void run(async () => {
            const { group } = await api.renameGroup(groupId, { name: groupName });
            onChange({ ...detail, group });
          });
        }}
      >
        <label>
          Rename Group <input name="name" maxLength={60} defaultValue={detail.group.name} required />
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
            const { token } = await api.createInviteLink(groupId);
            setCopied(false);
            setInviteToken(token);
          })
        }
      >
        {inviteToken ? "Replace Invite link" : "Create Invite link"}
      </button>
      <h3>Members</h3>
      <ul>
        {detail.members.map((m) => (
          <li key={m.id}>{m.displayName ?? "Unnamed"}</li>
        ))}
      </ul>

      {error && <p role="alert">{error}</p>}
    </section>
  );
}
