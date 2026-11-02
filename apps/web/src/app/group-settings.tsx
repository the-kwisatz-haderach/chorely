"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Copy, LogOut, RefreshCw, Share2, Trash2 } from "lucide-react";
import { ApiError, type AccountDto, type GroupDetailResponse } from "@chorely/api-client";
import { Button, Dialog, ErrorBanner, VisuallyHidden } from "../ui";
import { api } from "./api";
import { errorMessage } from "./error-message";
import styles from "./group-settings.module.css";
import { inviteUrl } from "./invite";

/**
 * The Group screen: rename the Group, see its Members, share or replace its Invite link, leave the Group, and see
 * or delete your Account.
 */
export function GroupSettings({
  detail,
  account,
  onChange,
}: {
  detail: GroupDetailResponse;
  account: AccountDto;
  onChange(detail: GroupDetailResponse): void;
}) {
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [inviteToken, setInviteToken] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState<"replace" | "leave" | "delete-account">();
  const linkInput = useRef<HTMLInputElement>(null);

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
  const url = inviteToken && inviteUrl(window.location.origin, inviteToken);

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // The browser may refuse clipboard access; leave the link selected to copy by hand.
      linkInput.current?.select();
      setError("Could not copy the link. It is selected, so copy it from there.");
    }
  }

  async function share(url: string) {
    try {
      await navigator.share({ title: "Join my Group on Chorely", url });
    } catch {
      // Dismissing the share sheet is not an error.
    }
  }

  const newInviteLink = () =>
    run(async () => {
      const { token } = await api.createInviteLink(groupId);
      setCopied(false);
      setInviteToken(token);
    });

  const isLastMember = detail.members.length === 1;

  const leave = () =>
    run(async () => {
      try {
        await api.leaveGroup(groupId, { deleteGroup: isLastMember });
      } catch (err) {
        // The others left meanwhile: refresh so asking again warns that the Group will be deleted.
        if (err instanceof ApiError && err.code === "conflict") onChange(await api.getGroup(groupId));
        throw err;
      }
      window.location.assign("/");
    });

  const deleteAccount = () =>
    run(async () => {
      await api.deleteAccount();
      window.location.assign("/");
    });

  return (
    <section aria-label="Group screen" className={styles.screen}>
      {error && <ErrorBanner message={error} />}

      <Card title="Group name">
        <form
          className={styles.row}
          onSubmit={(e) => {
            e.preventDefault();
            const groupName = name(e);
            void run(async () => {
              const { group } = await api.renameGroup(groupId, { name: groupName });
              onChange({ ...detail, group });
            });
          }}
        >
          <label className={styles.grow}>
            <VisuallyHidden>Rename Group</VisuallyHidden>
            <input name="name" className={styles.input} maxLength={60} defaultValue={detail.group.name} required />
          </label>
          <Button type="submit" disabled={busy}>
            Rename
          </Button>
        </form>
      </Card>

      <Card title="Members" count={detail.members.length}>
        <ul className={styles.members}>
          {detail.members.map((m) => (
            <li key={m.id} className={styles.member}>
              <span className={styles.avatar} aria-hidden>
                {(m.displayName ?? "?").charAt(0).toUpperCase()}
              </span>
              <span className={styles.grow}>{m.displayName ?? "Unnamed"}</span>
              {m.accountId === account.id && <span className={styles.you}>You</span>}
            </li>
          ))}
        </ul>
        <Button variant="ghost" size="small" className={styles.inlineAction} disabled={busy} onClick={() => setConfirming("leave")}>
          <LogOut aria-hidden size={14} />
          Leave Group
        </Button>
      </Card>

      <Card title="Invite link">
        {url ? (
          <>
            <p className={styles.muted}>Share this link. Anyone who opens it can join the Group.</p>
            <input
              ref={linkInput}
              readOnly
              aria-label="Invite link"
              className={styles.input}
              value={url}
              onFocus={(e) => e.currentTarget.select()}
            />
            <div className={styles.actions}>
              <Button variant="primary" disabled={busy} onClick={() => void run(() => copy(url))}>
                <Copy aria-hidden size={18} />
                Copy
              </Button>
              {canShare && (
                <Button disabled={busy} onClick={() => void run(() => share(url))}>
                  <Share2 aria-hidden size={18} />
                  Share
                </Button>
              )}
              {copied && (
                <span role="status" className={styles.muted}>
                  Copied
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="small"
              className={styles.inlineAction}
              disabled={busy}
              onClick={() => setConfirming("replace")}
            >
              <RefreshCw aria-hidden size={14} />
              Replace Invite link
            </Button>
          </>
        ) : (
          <>
            <p className={styles.muted}>Make an Invite link to add people. Making a new one stops any link shared before.</p>
            <Button variant="primary" disabled={busy} onClick={() => void newInviteLink()}>
              Create Invite link
            </Button>
          </>
        )}
      </Card>

      <Card title="Account">
        <dl className={styles.account}>
          <dt>Display name</dt>
          <dd>{account.displayName}</dd>
          <dt>Email</dt>
          <dd>{account.email}</dd>
        </dl>
        <Button
          variant="ghost"
          size="small"
          className={styles.inlineAction}
          disabled={busy}
          onClick={() => setConfirming("delete-account")}
        >
          <Trash2 aria-hidden size={14} />
          Delete Account
        </Button>
      </Card>

      <Confirm
        open={confirming === "replace"}
        onClose={() => setConfirming(undefined)}
        title="Replace this link?"
        action="Replace link"
        variant="primary"
        onConfirm={() => void newInviteLink()}
      >
        The current link stops working. Anyone who has it but has not joined yet needs the new one.
      </Confirm>

      <Confirm
        open={confirming === "leave"}
        onClose={() => setConfirming(undefined)}
        title={isLastMember ? `Leave and delete ${detail.group.name}?` : `Leave ${detail.group.name}?`}
        action={isLastMember ? "Leave and delete Group" : "Leave Group"}
        onConfirm={() => void leave()}
      >
        {isLastMember
          ? "You are the last Member, so the Group is deleted with all its Chores and its Done list. This cannot be undone."
          : "Your Chores become unassigned, and the Done list shows you as a Former member. You can join again with an Invite link."}
      </Confirm>

      <Confirm
        open={confirming === "delete-account"}
        onClose={() => setConfirming(undefined)}
        title="Delete your Account?"
        action="Delete Account"
        onConfirm={() => void deleteAccount()}
      >
        You are signed out and your Account is deleted. You leave {detail.group.name}
        {isLastMember ? ", and as its last Member the Group is deleted with all its Chores." : " and show there as a Former member."} This
        cannot be undone.
      </Confirm>
    </section>
  );
}

/** A confirm Dialog: Cancel, or the action, which closes it and runs `onConfirm`. */
function Confirm({
  open,
  title,
  action,
  variant = "danger",
  onClose,
  onConfirm,
  children,
}: {
  open: boolean;
  title: string;
  action: string;
  variant?: "primary" | "danger";
  onClose(): void;
  onConfirm(): void;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <p className={styles.muted}>{children}</p>
      <div className={styles.dialogActions}>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant={variant}
          onClick={() => {
            onClose();
            onConfirm();
          }}
        >
          {action}
        </Button>
      </div>
    </Dialog>
  );
}

/** One titled section of the Group screen, on a card. */
function Card({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className={styles.card}>
      <h2 className={styles.heading}>
        {title}
        {count !== undefined && <span className={styles.count}> {count}</span>}
      </h2>
      {children}
    </section>
  );
}
