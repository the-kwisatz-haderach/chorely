# Fractional-index string keys for Chore Position

A Chore's Position is a fractional-index string key (for example from the `fractional-indexing` library), stored as `text` with `COLLATE "C"`. Front, back and between inserts each write exactly one row, and concurrent moves of different Chores never conflict. We rejected float midpoints (precision runs out), dense integers renumbered on every move (many-row writes that conflict under concurrency) and prev/next linked lists (awkward to query and repair).

## Consequences

- The Queue is ordered by `(position, id)`. There is no unique constraint on position; identical keys from simultaneous inserts are tie-broken by the UUIDv7 id.
- Clients send moves as anchors (`{ choreId, beforeId?, afterId? }`); the server reads the anchors' keys and generates the new key. Front and back omit one anchor. A completed anchor's retained key is still valid; if an anchor was hard-deleted the server falls back to the other anchor, otherwise it returns a conflict and the client refetches.
- A new Chore with no Due date goes to the back (the add form offers "add to front"). A dated Chore is inserted before the first open Chore with a later Due date, skipping undated Chores, ties after the existing Chore; with no later date it goes to the back. Editing a Due date later never moves the Chore.
- A Chore keeps its Position on completion; undoing a completion restores its place.
- Concurrent moves of the same Chore are last-write-wins, with no versioning. Clients update optimistically, reconcile with the key in the response, and ignore polls for a Chore while its move is in flight.
- Keys grow when inserting repeatedly into one gap. No rebalancing in v1; a key-length test lives in `packages/domain`, and a per-Group re-key job can be added later.
- Where a Recurring Chore re-enters the Queue is decided in the Recurrence model ticket.
