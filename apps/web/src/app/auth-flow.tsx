"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { type AccountDto } from "@chorely/api-client";
import { type Placement } from "@chorely/domain";
import { Button, ErrorBanner, Loading } from "../ui";
import { api } from "./api";
import styles from "./auth-flow.module.css";
import { EditChore } from "./edit-chore";
import { EntryCard, Wordmark } from "./entry";
import entryStyles from "./entry.module.css";
import { errorMessage } from "./error-message";
import { GroupHome } from "./group-home";
import { GroupPage, type GroupView } from "./group-page";
import { JoinInvite } from "./join-invite";
import { NewChore } from "./new-chore";
import { TopBar } from "./top-bar";

type Step = { name: "loading" } | { name: "email" } | { name: "code"; email: string } | { name: "signed-in"; account: AccountDto };

/** Signs the person in, then shows the page's screen. Screens inside a Group bring their own top bar. */
export function AuthFlow({
  inviteToken,
  editChore,
  newChore,
  groupPage,
  intro,
}: {
  inviteToken?: string;
  editChore?: { groupId: string; choreId: string };
  newChore?: { groupId: string; title: string; placement: Placement };
  groupPage?: { groupId: string; view: GroupView };
  /** Shown in the sign-in card until the person is signed in. */
  intro?: ReactNode;
}) {
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
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const field = (e: FormEvent<HTMLFormElement>, name: string) => String(new FormData(e.currentTarget).get(name) ?? "");

  if (step.name === "loading") {
    return (
      <main>
        <Wordmark />
        <Loading />
      </main>
    );
  }

  const signedIn = step.name === "signed-in" && step.account.displayName;
  // Screens inside a Group show the Group's top bar; the edit and add screens still show the plain one.
  const ownTopBar = signedIn && !inviteToken && !editChore && !newChore;
  // Signing in, choosing a Display name and the Invite landing are cards under the wordmark.
  const isEntryScreen = !signedIn || Boolean(inviteToken);
  const banner = error && <ErrorBanner message={error} className={isEntryScreen ? entryStyles.banner : undefined} />;

  return (
    <main>
      {isEntryScreen ? <Wordmark /> : !ownTopBar && <TopBar title="Chorely" />}

      {step.name === "email" && (
        <EntryCard>
          <h2 className={entryStyles.heading}>Sign in</h2>
          {intro && <p className={entryStyles.lead}>{intro}</p>}
          <form
            className={entryStyles.form}
            onSubmit={(e) => {
              e.preventDefault();
              const email = field(e, "email");
              void run(async () => {
                await api.requestCode({ email });
                setStep({ name: "code", email });
              });
            }}
          >
            <label className={entryStyles.field}>
              Email <input name="email" type="email" autoComplete="email" enterKeyHint="send" required />
            </label>
            {banner}
            <Button type="submit" variant="primary" className={entryStyles.fullWidth} disabled={busy}>
              Send code
            </Button>
          </form>
        </EntryCard>
      )}

      {step.name === "code" && (
        <EntryCard>
          <h2 className={entryStyles.heading}>Check your email</h2>
          <p className={entryStyles.lead}>
            We emailed a 6-digit code to <strong>{step.email}</strong>.
          </p>
          <form
            className={entryStyles.form}
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
            <label className={entryStyles.field}>
              Code{" "}
              <input
                name="code"
                className={entryStyles.code}
                inputMode="numeric"
                autoComplete="one-time-code"
                enterKeyHint="go"
                pattern="\d{6}"
                maxLength={6}
                autoFocus
                required
              />
            </label>
            {banner}
            <Button type="submit" variant="primary" className={entryStyles.fullWidth} disabled={busy}>
              Sign in
            </Button>
            <Button
              variant="ghost"
              size="small"
              className={entryStyles.secondaryAction}
              onClick={() => {
                setError(undefined);
                setStep({ name: "email" });
              }}
            >
              Use a different email
            </Button>
          </form>
        </EntryCard>
      )}

      {step.name === "signed-in" && !step.account.displayName && (
        <EntryCard>
          {intro && <p className={entryStyles.lead}>{intro}</p>}
          <form
            className={entryStyles.form}
            onSubmit={(e) => {
              e.preventDefault();
              const displayName = field(e, "displayName");
              void run(async () => {
                const { account } = await api.setDisplayName({ displayName });
                setStep({ name: "signed-in", account });
              });
            }}
          >
            <label className={entryStyles.field}>
              What should we call you?{" "}
              <input name="displayName" autoComplete="nickname" maxLength={50} autoFocus required />
            </label>
            {banner}
            <Button type="submit" variant="primary" className={entryStyles.fullWidth} disabled={busy}>
              Continue
            </Button>
          </form>
        </EntryCard>
      )}

      {step.name === "signed-in" && step.account.displayName && (
        <>
          {inviteToken ? (
            <JoinInvite token={inviteToken} />
          ) : editChore ? (
            <EditChore {...editChore} />
          ) : newChore ? (
            <NewChore {...newChore} />
          ) : groupPage ? (
            <GroupPage {...groupPage} account={step.account} />
          ) : (
            <GroupHome accountId={step.account.id} />
          )}
          <footer className={styles.account}>
            <p>Signed in as {step.account.displayName}</p>
            <Button
              variant="ghost"
              size="small"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api.signOut();
                  setStep({ name: "email" });
                })
              }
            >
              Sign out
            </Button>
          </footer>
          {banner}
        </>
      )}
    </main>
  );
}
