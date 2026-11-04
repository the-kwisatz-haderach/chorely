import { describe, expect, it, vi } from "vitest";
import { allowlistEmail, type Email, type SendEmail } from "../src/server/email";

function outbox(): { sent: Email[]; send: SendEmail } {
  const sent: Email[] = [];
  return { sent, send: async (email) => void sent.push(email) };
}

const email = (to: string): Email => ({ to, subject: "Your Chorely code", text: "123456" });

describe("allowlistEmail (staging delivers only to allowlisted addresses)", () => {
  it("delivers to an allowlisted address and drops everyone else", async () => {
    const { sent, send } = outbox();
    const guarded = allowlistEmail("tester@example.com, other@example.com", send);

    await guarded(email("tester@example.com"));
    await guarded(email("stranger@example.com"));

    expect(sent.map((e) => e.to)).toEqual(["tester@example.com"]);
  });

  it("matches addresses regardless of case and spacing in the list", async () => {
    const { sent, send } = outbox();
    const guarded = allowlistEmail(" Tester@Example.com ,\nother@example.com ", send);

    await guarded(email("tester@example.com"));
    await guarded(email("OTHER@example.com"));

    expect(sent.map((e) => e.to)).toEqual(["tester@example.com", "OTHER@example.com"]);
  });

  it("logs a dropped email without its body, so the sign-in code never reaches the logs", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await allowlistEmail("tester@example.com", outbox().send)(email("stranger@example.com"));

      const lines = log.mock.calls.map((args) => args.join(" "));
      expect(lines.some((l) => l.includes("stranger@example.com"))).toBe(true);
      expect(lines.some((l) => l.includes("123456"))).toBe(false);
    } finally {
      log.mockRestore();
    }
  });
});
