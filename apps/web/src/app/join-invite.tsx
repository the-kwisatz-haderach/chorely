"use client";

import { useEffect, useState } from "react";
import { buttonClassName, ErrorBanner, Loading } from "../ui";
import { api } from "./api";
import { EntryCard } from "./entry";
import styles from "./entry.module.css";
import { errorMessage } from "./error-message";

type State = { name: "joining" } | { name: "failed"; message: string };

/** Joins the Group the Invite link belongs to, then goes to the Group screen. */
export function JoinInvite({ token }: { token: string }) {
  const [state, setState] = useState<State>({ name: "joining" });

  useEffect(() => {
    api
      .joinGroup({ token })
      .then(() => window.location.assign("/"))
      .catch((err: unknown) => setState({ name: "failed", message: errorMessage(err) }));
  }, [token]);

  if (state.name === "joining") return <Loading>Joining the Group…</Loading>;
  return (
    <EntryCard>
      <h2 className={styles.heading}>Can&apos;t join this Group</h2>
      <ErrorBanner message={state.message} className={styles.banner} />
      <a href="/" className={buttonClassName({ variant: "primary", className: styles.fullWidth })}>
        Go to Chorely
      </a>
    </EntryCard>
  );
}
