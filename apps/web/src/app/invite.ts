export function inviteUrl(origin: string, token: string): string {
  return `${origin}/join/${token}`;
}

/** Accepts a whole pasted Invite link or just its token. */
export function tokenFromPasted(text: string): string {
  const trimmed = text.trim();
  const path = trimmed.split(/[?#]/)[0] ?? "";
  return path.split("/").filter(Boolean).at(-1) ?? trimmed;
}
