"use client";

import { useEffect, useState } from "react";
import { api } from "./api";
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

  if (state.name === "joining") return <p>Joining the Group…</p>;
  return (
    <>
      <p role="alert">{state.message}</p>
      <a href="/">Go to Chorely</a>
    </>
  );
}
