# Chorely

A shared work queue for a group of people, built first for households. Members add, order, claim and complete Chores in one place.

## Language

**Group**:
The set of people who share one Queue. A household is the typical Group, but a team or flat-share is equally valid.
_Avoid_: Household (as the canonical term), team, organization

**Member**:
A person's membership in a Group, held through their Account. All Members are equal; there are no roles. A Member who leaves stays in the history of completed Chores as a "Former member".
_Avoid_: User, participant

**Account**:
The sign-in identity of a person, independent of any Group. An Account has one Member per Group it belongs to.
_Avoid_: User, profile

**Display name**:
The name other people in a Group see for an Account, asked for once after the first sign-in. It is carried by the Account, not the Member.
_Avoid_: Username, nickname

**Chore**:
A unit of work that appears in a Group's Queue, whether housework or any other work.
_Avoid_: Task, work item, to-do

**Queue**:
The single, manually ordered list of open Chores belonging to a Group. A Chore's position expresses its urgency.
_Avoid_: List, backlog, board

**Position**:
Where a Chore sits in the Queue. Members can place a Chore at the front or back, or move it, and a manual placement always overrides any automatic one.
_Avoid_: Priority, rank

**Due date**:
An optional date on a Chore that seeds its initial Position when it is added. It never reorders the Queue afterwards.
_Avoid_: Deadline

**Overdue**:
A marker shown beside a Chore whose Due date is before today. It is only a label: it never changes the Chore's Position. Completed Chores are not marked.
_Avoid_: Late, expired

**Assignee**:
The optional Member responsible for a Chore. A Chore with no Assignee is unassigned and any Member can claim it.
_Avoid_: Owner

**Claim**:
A Member taking an unassigned Chore, which makes them its Assignee.
Any Member can also assign or reassign a Chore to any Member, or unassign it. The Assignee can **unclaim** a Chore to make it unassigned again.
_Avoid_: Pick up, grab

**Complete**:
Any Member marking a Chore done, recording who completed it and when. The Chore leaves the Queue but keeps its Position, so **Undo** (a short client-side window right after) puts it back in its place. Once that window has passed there is no reopen.
_Avoid_: Finish, close, check off

**Delete**:
Permanently removing an open Chore from the Queue, after a confirm. A completed Chore cannot be deleted; it stays in the Done list.
_Avoid_: Archive, remove

**Done list**:
The read-only list of completed Chores, newest first, each with its completer. A completer who has left shows as a "Former member".
_Avoid_: History, archive

**Recurring Chore**:
A Chore that comes back into the Queue on a schedule after it is completed: every N days, every N weeks on chosen weekdays, or every N months on a day of the month. The schedule is either a fixed calendar (the default), where the next Due date is the first schedule date after both today and the completed Occurrence's Due date, or counted from the day of completion. It may name a fixed Assignee for every new Occurrence. **Stop repeating** deletes the schedule and leaves the open Occurrence as a one-off.
_Avoid_: Repeating task, routine

**Occurrence**:
One instance of a Recurring Chore. A Recurring Chore has only one open Occurrence at a time; completing it creates the next, and Undo deletes that next one again. Undo is refused once a Member has changed that next Occurrence (assigned, claimed, edited, moved it, or made it a one-off with Stop repeating), so their change is never lost; a Member leaving the Group does not count as a change. Deleting an open Occurrence either skips it ("Delete this one", which creates the next) or ends the series ("Delete and stop repeating"). Schedule edits apply from the next Occurrence.
_Avoid_: Instance, repeat

**Invite link**:
A shareable link that lets a person join a Group as a Member. Each Group has one reusable Invite link; any Member can replace it, which stops the old one working.
_Avoid_: Invitation code
