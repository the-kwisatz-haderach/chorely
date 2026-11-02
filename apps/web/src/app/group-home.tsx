"use client";

import { useEffect, useState, type FormEvent } from "react";
import { type GroupDetailResponse } from "@chorely/api-client";
import { Button, ErrorBanner, Loading } from "../ui";
import { api } from "./api";
import { EntryCard, Wordmark } from "./entry";
import styles from "./entry.module.css";
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

  if (state.name === "ready") {
    return (
      <>
        <TopBar title={state.detail.group.name} groupId={state.detail.group.id} />
        <Queue groupId={state.detail.group.id} members={state.detail.members} accountId={accountId} />
      </>
    );
  }

  return (
    <>
      <Wordmark />
      {state.name === "loading" && (error ? <ErrorBanner message={error} /> : <Loading />)}

      {state.name === "none" && (
        <EntryCard>
          {/* One banner for both ways in, above them, so it is never under the wrong form. */}
          {error && <ErrorBanner message={error} className={styles.banner} />}
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              const name = field(e, "name");
              void enter(() => api.createGroup({ name }));
            }}
          >
            <h2 className={styles.heading}>Create your Group</h2>
            <label className={styles.field}>
              Group name <input name="name" maxLength={60} required />
            </label>
            <Button type="submit" variant="primary" className={styles.fullWidth} disabled={busy}>
              Create Group
            </Button>
          </form>
          <p className={styles.divider}>or</p>
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              const token = tokenFromPasted(field(e, "invite"));
              void enter(() => api.joinGroup({ token }));
            }}
          >
            <h2 className={styles.heading}>Join a Group</h2>
            <label className={styles.field}>
              Paste an Invite link <input name="invite" inputMode="url" autoComplete="off" required />
            </label>
            <Button type="submit" variant="secondary" className={styles.fullWidth} disabled={busy}>
              Join Group
            </Button>
          </form>
        </EntryCard>
      )}
    </>
  );
}
