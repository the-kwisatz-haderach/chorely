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

/**
 * Leaves the Group. The last Member leaving deletes the Group with its Chores and history, so they must send
 * `deleteGroup: true`; without it that is a `conflict`, which also covers the others leaving in the meantime.
 */
export const leaveGroupBodySchema = z.object({ deleteGroup: z.boolean().default(false) });
export type LeaveGroupBody = z.input<typeof leaveGroupBodySchema>;

export const leaveGroupResponseSchema = z.object({ groupDeleted: z.boolean() });
export type LeaveGroupResponse = z.infer<typeof leaveGroupResponseSchema>;

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

const recurrenceCommon = {
  /** `calendar` (the default) keeps a fixed schedule; `completion` counts from the day an Occurrence is completed. */
  anchor: z.enum(["calendar", "completion"]).default("calendar"),
  /** The Member each new Occurrence is assigned to; null leaves new Occurrences unassigned. */
  assigneeId: z.string().uuid().nullish().transform((a) => a ?? null),
};

/**
 * How a Recurring Chore repeats: every N days, every N weeks on ISO weekdays (1 is Monday, 7 is Sunday), or every
 * N months on a day of the month (29 to 31 fall on the last day of shorter months). Shared by its Occurrences.
 */
export const recurrenceSchema = z.discriminatedUnion("unit", [
  z.object({ unit: z.literal("day"), every: z.number().int().min(1).max(365), ...recurrenceCommon }),
  z.object({
    unit: z.literal("week"),
    every: z.number().int().min(1).max(52),
    weekdays: z
      .array(z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7)]))
      .min(1)
      .max(7)
      .transform((days) => [...new Set(days)].sort((a, b) => a - b)),
    ...recurrenceCommon,
  }),
  z.object({ unit: z.literal("month"), every: z.number().int().min(1).max(24), dayOfMonth: z.number().int().min(1).max(31), ...recurrenceCommon }),
]);
export type RecurrenceBody = z.input<typeof recurrenceSchema>;
export type RecurrenceDto = z.output<typeof recurrenceSchema>;

export const choreSchema = z.object({
  id: z.string(),
  title: z.string(),
  note: z.string(),
  /** Date-only, `YYYY-MM-DD`. */
  dueDate: z.string().nullable(),
  /** The assigned Member's id; null when unassigned. */
  assigneeId: z.string().nullable(),
  position: z.string(),
  /** The schedule of a Recurring Chore's Occurrence; null for a one-off Chore. */
  recurrence: recurrenceSchema.nullable(),
});
export type ChoreDto = z.infer<typeof choreSchema>;

export const addChoreBodySchema = z.object({
  title: z.string().trim().min(1).max(100),
  note: z.string().trim().max(1000).default(""),
  dueDate: dateOnlySchema.nullish().transform((d) => d ?? null),
  assigneeId: z.string().uuid().nullish().transform((a) => a ?? null),
  /** Omit to let the Due date seed the Position; otherwise a manual placement wins. */
  placement: z.enum(["front", "back"]).optional(),
  /** Makes the Chore the first Occurrence of a Recurring Chore. */
  recurrence: recurrenceSchema.nullish().transform((r) => r ?? null),
});
export type AddChoreBody = z.input<typeof addChoreBodySchema>;
export type AddChoreInput = z.output<typeof addChoreBodySchema>;

/** The Queue: open Chores in order, with the Group revision they were read at. */
export const queueResponseSchema = z.object({ chores: z.array(choreSchema), revision: z.number().int() });
export type QueueResponse = z.infer<typeof queueResponseSchema>;

export const addChoreResponseSchema = z.object({ chore: choreSchema, revision: z.number().int() });
export type AddChoreResponse = z.infer<typeof addChoreResponseSchema>;

/**
 * Edits an open Chore. Omitted fields stay as they are; `dueDate` and `assigneeId` take null to clear. Never moves the
 * Chore. A `recurrence` sets or changes the schedule for future Occurrences only; null is "Stop repeating", which
 * leaves this Occurrence as a one-off.
 */
export const updateChoreBodySchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  note: z.string().trim().max(1000).optional(),
  dueDate: dateOnlySchema.nullable().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  recurrence: recurrenceSchema.nullable().optional(),
});
export type UpdateChoreBody = z.input<typeof updateChoreBodySchema>;
export type UpdateChoreInput = z.output<typeof updateChoreBodySchema>;

/**
 * Deleting an open Occurrence of a Recurring Chore either skips it ("Delete this one": the next Occurrence is created
 * as on completion) or, with `stopRepeating`, ends the series. `today` is as for completing. Sent as query parameters.
 */
export const deleteChoreQuerySchema = z.object({
  stopRepeating: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  today: dateOnlySchema.optional(),
});
export type DeleteChoreQuery = { stopRepeating?: boolean; today?: string };

/** The Group revision after a Chore was deleted, and the Occurrence that replaced it, if any. */
export const deleteChoreResponseSchema = z.object({ revision: z.number().int(), next: choreSchema.nullable() });
export type DeleteChoreResponse = z.infer<typeof deleteChoreResponseSchema>;

/**
 * Moves a Chore by anchors (ADR 0002): `afterId` is the Chore it lands right after, `beforeId` the one it lands
 * right before. Omitting `afterId` means the front of the Queue (send the current first Chore as `beforeId`),
 * omitting `beforeId` the back. The server picks the key.
 */
export const moveChoreBodySchema = z
  .object({ afterId: choreIdSchema.optional(), beforeId: choreIdSchema.optional() })
  .refine((b) => b.afterId !== undefined || b.beforeId !== undefined, "Give at least one anchor");
export type MoveChoreBody = z.input<typeof moveChoreBodySchema>;
export type MoveChoreInput = z.output<typeof moveChoreBodySchema>;

/** Assigns, reassigns or (with null) unassigns a Chore. */
export const assignChoreBodySchema = z.object({ assigneeId: z.string().uuid().nullable() });
export type AssignChoreBody = z.input<typeof assignChoreBodySchema>;

/** The Chore after a Claim or assignment change, with the new Group revision. */
export const choreResponseSchema = addChoreResponseSchema;
export type ChoreResponse = AddChoreResponse;

/** A completed Chore. It keeps its `position` so Undo can put it back. */
export const doneChoreSchema = choreSchema.extend({
  /** ISO 8601 instant. */
  completedAt: z.string(),
  /** The completer's Member id; null for a Former member. */
  completedById: z.string().nullable(),
});
export type DoneChoreDto = z.infer<typeof doneChoreSchema>;

/**
 * `today` is the Member's local date, which the next Occurrence's Due date counts from. It may differ from the
 * server's date by a day either way; omitted, the server's UTC date is used.
 */
export const completeChoreBodySchema = z.object({ today: dateOnlySchema.optional() });
export type CompleteChoreBody = z.input<typeof completeChoreBodySchema>;

/** The completed Chore, and the next Occurrence it created when it was an Occurrence of a Recurring Chore. */
export const completeChoreResponseSchema = z.object({
  chore: doneChoreSchema,
  next: choreSchema.nullable(),
  revision: z.number().int(),
});
export type CompleteChoreResponse = z.infer<typeof completeChoreResponseSchema>;

export const DONE_PAGE_SIZE_DEFAULT = 20;
export const DONE_PAGE_SIZE_MAX = 50;

/** The Done list is keyset-paginated, newest first; `cursor` is the opaque `nextCursor` of the previous page. */
export const doneQuerySchema = z.object({
  cursor: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(DONE_PAGE_SIZE_MAX).default(DONE_PAGE_SIZE_DEFAULT),
});
export type DoneQuery = z.input<typeof doneQuerySchema>;

export const doneListResponseSchema = z.object({
  chores: z.array(doneChoreSchema),
  /** Null on the last page. */
  nextCursor: z.string().nullable(),
});
export type DoneListResponse = z.infer<typeof doneListResponseSchema>;
