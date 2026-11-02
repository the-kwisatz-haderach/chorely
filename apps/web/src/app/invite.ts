export function inviteUrl(origin: string, token: string): string {
  return `${origin}/join/${token}`;
}

/** Accepts a whole pasted Invite link or just its token. */
export function tokenFromPasted(text: string): string {
  const path = text.trim().split(/[?#]/)[0] ?? "";
  return path.split("/").filter(Boolean).at(-1) ?? "";
}
