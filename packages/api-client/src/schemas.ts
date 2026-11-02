import { z } from "zod";

export const healthResponseSchema = z.object({ status: z.literal("ok") });
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const accountSchema = z.object({
  id: z.string(),
  email: z.string(),
  /** Null until the person has chosen one after their first sign-in. */
  displayName: z.string().nullable(),
});
export type AccountDto = z.infer<typeof accountSchema>;

export const okResponseSchema = z.object({ status: z.literal("ok") });
export type OkResponse = z.infer<typeof okResponseSchema>;

const emailSchema = z.string().trim().toLowerCase().email().max(254);

export const requestCodeBodySchema = z.object({ email: emailSchema });
export type RequestCodeBody = z.input<typeof requestCodeBodySchema>;

export const verifyCodeBodySchema = z.object({
  email: emailSchema,
  code: z.string().regex(/^\d{6}$/),
  /** `cookie` sets an httpOnly session cookie (web); `bearer` returns a token in the body (native). */
  transport: z.enum(["cookie", "bearer"]).default("cookie"),
});
export type VerifyCodeBody = z.input<typeof verifyCodeBodySchema>;

export const verifyCodeResponseSchema = z.object({
  account: accountSchema,
  /** Only present for the `bearer` transport. */
  token: z.string().optional(),
});
export type VerifyCodeResponse = z.infer<typeof verifyCodeResponseSchema>;

export const meResponseSchema = z.object({ account: accountSchema });
export type MeResponse = z.infer<typeof meResponseSchema>;

export const setDisplayNameBodySchema = z.object({ displayName: z.string().trim().min(1).max(50) });
export type SetDisplayNameBody = z.input<typeof setDisplayNameBodySchema>;

export const groupSchema = z.object({ id: z.string(), name: z.string() });
export type GroupDto = z.infer<typeof groupSchema>;

export const memberSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  /** Null until that person has chosen one. */
  displayName: z.string().nullable(),
});
export type MemberDto = z.infer<typeof memberSchema>;

export const groupIdSchema = z.string().uuid();

/** Body for both creating and renaming a Group. */
export const groupNameBodySchema = z.object({ name: z.string().trim().min(1).max(60) });
export type CreateGroupBody = z.input<typeof groupNameBodySchema>;
export type RenameGroupBody = CreateGroupBody;

export const listGroupsResponseSchema = z.object({ groups: z.array(groupSchema) });
export type ListGroupsResponse = z.infer<typeof listGroupsResponseSchema>;

export const groupResponseSchema = z.object({ group: groupSchema });
export type GroupResponse = z.infer<typeof groupResponseSchema>;

export const groupDetailResponseSchema = z.object({ group: groupSchema, members: z.array(memberSchema) });
export type GroupDetailResponse = z.infer<typeof groupDetailResponseSchema>;

/** An Invite link token: 128 random bits, base64url. */
export const inviteTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{22}$/);

export const inviteLinkResponseSchema = z.object({ token: inviteTokenSchema });
export type InviteLinkResponse = z.infer<typeof inviteLinkResponseSchema>;

/** The Group's current Invite link token, or null when it has none yet. */
export const currentInviteLinkResponseSchema = z.object({ token: inviteTokenSchema.nullable() });
export type CurrentInviteLinkResponse = z.infer<typeof currentInviteLinkResponseSchema>;

export const joinGroupBodySchema = z.object({ token: z.string() });
export type JoinGroupBody = z.input<typeof joinGroupBodySchema>;

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
  }, "Not a calendar date");

export const choreIdSchema = z.string().uuid();

export const choreSchema = z.object({
  id: z.string(),
  title: z.string(),
  note: z.string(),
  /** Date-only, `YYYY-MM-DD`. */
  dueDate: z.string().nullable(),
  /** The assigned Member's id; null when unassigned. */
  assigneeId: z.string().nullable(),
  position: z.string(),
});
export type ChoreDto = z.infer<typeof choreSchema>;

export const addChoreBodySchema = z.object({
  title: z.string().trim().min(1).max(100),
  note: z.string().trim().max(1000).default(""),
  dueDate: dateOnlySchema.nullish().transform((d) => d ?? null),
  assigneeId: z.string().uuid().nullish().transform((a) => a ?? null),
  /** Omit to let the Due date seed the Position; otherwise a manual placement wins. */
  placement: z.enum(["front", "back"]).optional(),
});
export type AddChoreBody = z.input<typeof addChoreBodySchema>;
export type AddChoreInput = z.output<typeof addChoreBodySchema>;

/** The Queue: open Chores in order, with the Group revision they were read at. */
export const queueResponseSchema = z.object({ chores: z.array(choreSchema), revision: z.number().int() });
export type QueueResponse = z.infer<typeof queueResponseSchema>;

export const addChoreResponseSchema = z.object({ chore: choreSchema, revision: z.number().int() });
export type AddChoreResponse = z.infer<typeof addChoreResponseSchema>;

/** Assigns, reassigns or (with null) unassigns a Chore. */
export const assignChoreBodySchema = z.object({ assigneeId: z.string().uuid().nullable() });
export type AssignChoreBody = z.input<typeof assignChoreBodySchema>;

/** The Chore after a Claim or assignment change, with the new Group revision. */
export const choreResponseSchema = z.object({ chore: choreSchema, revision: z.number().int() });
export type ChoreResponse = z.infer<typeof choreResponseSchema>;
