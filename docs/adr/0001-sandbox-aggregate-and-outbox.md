# ADR 0001: Persist the demo sandbox as an aggregate with an outbox

- Status: Accepted, publication storage and relay terminology refined by ADR 0002
- Date: 2026-07-17

## Context

The first UI prototype could demonstrate the journey with browser and API memory.
That model could not survive restarts, coordinate concurrent edits, or prove that an
audit entry and its visible state change belonged to the same commit.

The form and workflow are schema-versioned documents that change together. Audit,
attachment metadata, and delivery records need independent lifecycle and query
behavior.

## Decision

Use the sandbox as the application aggregate. Store its current form, workflow,
publication state, and submission as validated data in PostgreSQL. Store audit
entries, attachment metadata, and outbox events in related tables.

Every mutation uses an aggregate-version compare-and-swap and writes the aggregate,
audit row, optional attachment row, and outbox row in one Prisma transaction. Draft
edits also require the public expected revision so the UI can offer an explicit
conflict choice.

Use an application-level `SandboxRepository` port with PostgreSQL and memory
implementations. The memory adapter is not a production persistence mode.

## Consequences

- Restart-safe sandboxes and atomic audit records become the default with a database.
- Concurrent changes fail safely instead of using last-write-wins behavior.
- Socket delivery can retry independently after the database commit.
- Relay work may repeat, so consumers deduplicate event IDs and reload canonical
  state. ADR 0002 distinguishes server relay from best-effort browser delivery.
- JSON document fields require runtime parsing on read and explicit schema migration
  when a future schema version changes shape.
- Cleanup owns both relational data and the matching object-storage prefix. ADR 0002
  defines the failure-safe deletion order.

## Rejected alternatives

- Browser-owned workflow state was rejected because it can display transitions the
  server never accepted.
- One relational table per form field and workflow node was rejected for this slice
  because versioned document snapshots are the unit of publication and execution.
- Publishing directly to Socket.IO inside the database transaction was rejected
  because a successful commit and failed network send would lose the notification.
- An exactly-once claim was rejected because network retries and process failure do
  not permit that guarantee across the API, queue, and browser.
