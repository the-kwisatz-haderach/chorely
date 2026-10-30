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

**Assignee**:
The optional Member responsible for a Chore. A Chore with no Assignee is unassigned and any Member can claim it.
_Avoid_: Owner

**Claim**:
A Member taking an unassigned Chore, which makes them its Assignee.
_Avoid_: Pick up, grab

**Recurring Chore**:
A Chore that comes back into the Queue on a schedule after it is completed.
_Avoid_: Repeating task, routine

**Occurrence**:
One instance of a Recurring Chore. A Recurring Chore has only one open Occurrence at a time; completing it creates the next.
_Avoid_: Instance, repeat

**Invite link**:
A shareable link that lets a person join a Group as a Member. Each Group has one reusable Invite link; any Member can replace it, which stops the old one working.
_Avoid_: Invitation code
