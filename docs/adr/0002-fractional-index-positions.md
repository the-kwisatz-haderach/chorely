# Fractional-index string keys for Chore Position

A Chore's Position is a fractional-index string key (for example from the `fractional-indexing` library), stored as `text` with `COLLATE "C"`. Front, back and between inserts each write exactly one row, and concurrent moves of different Chores never conflict. We rejected float midpoints (precision runs out), dense integers renumbered on every move (many-row writes that conflict under concurrency) and prev/next linked lists (awkward to query and repair).

## Consequences

- The Queue is ordered by `(position, id)`. There is no unique constraint on position; identical keys from simultaneous inserts are tie-broken by the UUIDv7 id.
- Clients send moves as anchors (`{ choreId, beforeId?, afterId? }`); the server reads the anchors' keys and generates the new key. Front and back omit one anchor. A completed anchor's retained key is still valid; if an anchor was hard-deleted the server falls back to the other anchor, otherwise it returns a conflict and the client refetches.
- A new Chore with no Due date goes to the back (the add form offers "add to front"). A dated Chore is inserted before the first open Chore with a later Due date, skipping undated Chores, ties after the existing Chore; with no later date it goes to the back. Editing a Due date later never moves the Chore.
- A Chore keeps its Position on completion; undoing a completion restores its place.
- Concurrent moves of the same Chore are last-write-wins, with no versioning. Clients update optimistically, reconcile with the key in the response, and ignore polls for a Chore while its move is in flight. A client sends its own moves one at a time, in order, because each move's anchors assume the earlier ones have landed.
- `afterId` is the Chore the moved one lands right after and `beforeId` the one it lands right before. Omitting `afterId` means the very front of the Queue as it is now, omitting `beforeId` the very back. When both are sent but the pair is unusable (one was hard-deleted, or they are tied or out of order because of another move), the Chore lands right beside a surviving anchor, between it and its nearest open neighbour. Only a pair with neither anchor left is a conflict, so moves of different Chores still never conflict.
- Keys grow when inserting repeatedly into one gap. No rebalancing in v1; a key-length test lives in `packages/domain`, and a per-Group re-key job can be added later.
- Where a Recurring Chore re-enters the Queue is decided in the Recurrence model ticket.
