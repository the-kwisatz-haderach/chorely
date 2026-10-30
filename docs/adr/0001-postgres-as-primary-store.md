# PostgreSQL as the primary store

Chorely's data is relational and ordering-heavy: Groups, Accounts, Members (many-to-many), Chores with a Position, and Recurring Chores. Concurrent edits by several Members need transactions and foreign keys, for example reordering the Queue or two Members Claiming the same Chore. We chose PostgreSQL over MongoDB: Mongo offers no advantage for this model, and on the budget it costs more (Atlas Flex has no point-in-time restore or private networking from Cloud Run).

## Consequences

- Primary keys are app-generated UUIDv7; schema and migrations use Drizzle with checked-in SQL migrations.
- Group isolation is enforced in the app through a single data-access module, not row-level security.
- Hosting, region and SLA for the database are decided separately.
