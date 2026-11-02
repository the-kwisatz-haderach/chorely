"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ApiError, createApiClient, type AccountDto } from "@chorely/api-client";

// Same typed client as native; the browser sends the httpOnly session cookie itself.
const api = createApiClient({ baseUrl: "", fetch: (url, init) => fetch(url, init) });

type Step = { name: "loading" } | { name: "email" } | { name: "code"; email: string } | { name: "signed-in"; account: AccountDto };

function message(err: unknown): string {
  return err instanceof ApiError ? err.message : "Something went wrong. Try again.";
}

export function AuthFlow() {
  const [step, setStep] = useState<Step>({ name: "loading" });
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .getMe()
      .then(({ account }) => setStep({ name: "signed-in", account }))
      .catch(() => setStep({ name: "email" }));
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

  const field = (e: FormEvent<HTMLFormElement>, name: string) => String(new FormData(e.currentTarget).get(name) ?? "");

  if (step.name === "loading") return <p>Loading…</p>;

  return (
    <>
      {step.name === "email" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const email = field(e, "email");
            void run(async () => {
              await api.requestCode({ email });
              setStep({ name: "code", email });
            });
          }}
        >
          <label>
            Email <input name="email" type="email" autoComplete="email" required />
          </label>
          <button disabled={busy}>Send code</button>
        </form>
      )}

      {step.name === "code" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const code = field(e, "code");
            const { email } = step;
            void run(async () => {
              const { account } = await api.verifyCode({ email, code });
              setStep({ name: "signed-in", account });
            });
          }}
        >
          <p>We emailed a 6-digit code to {step.email}.</p>
          <label>
            Code{" "}
            <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required />
          </label>
          <button disabled={busy}>Sign in</button>
          <button type="button" onClick={() => setStep({ name: "email" })}>
            Use a different email
          </button>
        </form>
      )}

      {step.name === "signed-in" && !step.account.displayName && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const displayName = field(e, "displayName");
            void run(async () => {
              const { account } = await api.setDisplayName({ displayName });
              setStep({ name: "signed-in", account });
            });
          }}
        >
          <label>
            What should we call you? <input name="displayName" maxLength={50} required />
          </label>
          <button disabled={busy}>Continue</button>
        </form>
      )}

      {step.name === "signed-in" && step.account.displayName && (
        <>
          <p>Signed in as {step.account.displayName}</p>
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await api.signOut();
                setStep({ name: "email" });
              })
            }
          >
            Sign out
          </button>
        </>
      )}

      {error && <p role="alert">{error}</p>}
    </>
  );
}
