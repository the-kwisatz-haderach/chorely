import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface Email {
  to: string;
  subject: string;
  text: string;
}

export type SendEmail = (email: Email) => Promise<void>;

/** Dev transport: logs instead of sending, including the body outside production so codes are usable. */
export const logEmail: SendEmail = async (email) => {
  const body = process.env.NODE_ENV === "production" ? "" : `\n${email.text}`;
  console.log(`[email] to=${email.to} subject=${email.subject}${body}`);
};

/** Writes the latest email per recipient to `<dir>/<to>.json`. Lets the e2e journey read its sign-in code. */
export function fileEmail(dir: string): SendEmail {
  return async (email) => {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${encodeURIComponent(email.to)}.json`), JSON.stringify(email));
  };
}

export function resendEmail(apiKey: string, from: string): SendEmail {
  return async (email) => {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: email.to, subject: email.subject, text: email.text }),
    });
    if (!res.ok) throw new Error(`Resend responded ${res.status}`);
  };
}
