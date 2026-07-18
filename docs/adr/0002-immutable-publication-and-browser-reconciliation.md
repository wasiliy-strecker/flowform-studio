# ADR 0002: Store immutable publications and reconcile browser state

- Status: Accepted
- Date: 2026-07-18

## Context

The v0.2 aggregate retained only its latest publication as JSON. Republishing could
therefore replace the workflow later used by an existing submission, and historical
versions could not be inspected. Repeating a publish request also created another
version even when the draft had not changed.

The outbox column `publishedAt` was similarly ambiguous. It recorded a server-side
Socket.IO broadcast attempt, but its name could be read as proof that a browser had
received an event. Socket.IO rooms do not provide that durable client acknowledgement.

Finally, deleting PostgreSQL metadata before the MinIO prefix made a storage failure
capable of leaving objects without the sandbox ID needed for a later retry.

## Decision

Store every form and workflow publication in `PublishedFormVersion`, keyed by sandbox
ID and monotonically increasing version. Keep the editable draft on the sandbox
aggregate. A publication transaction inserts the snapshot, audit entry, and outbox
event together with the aggregate compare-and-swap update.

Treat publication of an already published draft revision as an idempotent no-op. A
submission stores the selected version number, and all workflow validation and
transitions load that exact snapshot. The aggregate response exposes the latest
snapshot, total version count, and the snapshot pinned to an active submission.
Dedicated endpoints list version metadata and return a complete historical snapshot.

Rename outbox persistence fields to `relayedAt` and `relayAttempts`. These describe
the server relay boundary only. The browser treats Socket.IO as an invalidation hint,
deduplicates event IDs, and refetches canonical state after durable events and every
authenticated reconnect. Periodic HTTP refresh remains the final repair path.

For expired sandboxes, delete the object-storage prefix before deleting PostgreSQL
metadata. If object deletion fails, retain the expired and inaccessible row for the
next cleanup pass.

## Consequences

- Published definitions remain queryable and cannot be overwritten by later drafts.
- Running submissions preserve their original validation and workflow semantics.
- Concurrent retries of the same publish produce one snapshot, audit entry, and
  outbox event.
- A relayed event may be duplicated or missed by a browser. PostgreSQL, never the
  socket stream, remains authoritative.
- Cleanup failures remain visible and retryable instead of silently orphaning files.
- The v0.2 migration can preserve only its latest snapshot. When a legacy submission
  references an older, unavailable snapshot, the migration aligns it to the snapshot
  whose behavior v0.2 actually used.
