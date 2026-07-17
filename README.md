# FlowForm Studio PRO

FlowForm Studio is a production-shaped React and Node.js portfolio application for
building forms, publishing immutable versions, and running conditional approval
workflows. The demo is deliberately one coherent vertical slice instead of a set of
disconnected screens.

Each visitor receives a token-protected sandbox that expires after 24 hours. The
role switcher makes the complete designer, applicant, operations, and management
journey reviewable without creating several accounts.

## What this repository demonstrates

- React 19, TypeScript, Vite, TanStack Query, Zustand, React Hook Form, and React Flow
- NestJS with versioned REST endpoints, OpenAPI, Socket.IO, and structured errors
- PostgreSQL persistence through Prisma with optimistic concurrency control
- A transactional audit and outbox write for every aggregate mutation
- Redis-backed event delivery with a direct development fallback
- Backpressure-aware uploads to private MinIO storage with signature and size checks
- Runtime-validated contracts shared between browser and server
- Unit, contract, HTTP integration, and Playwright browser tests
- Multi-stage Docker builds, health probes, migrations, and GitHub Actions

## Recruiter walkthrough

1. Edit the typed expense form in the visual builder
2. Inspect the conditional workflow where requests above EUR 5,000 require management
3. Publish an immutable form and workflow version
4. Submit the prefilled request as the applicant
5. Request clarification as operations and resubmit as the applicant
6. Complete operations and management approval
7. Inspect the server-generated audit trail

The Playwright specification in
[`apps/web/e2e/recruiter-flow.spec.ts`](apps/web/e2e/recruiter-flow.spec.ts)
executes this same journey against a running browser and API.

## Architecture

```text
React PWA
  ├─ TanStack Query owns the canonical sandbox returned by the API
  ├─ Zustand owns only UI state, draft history, and unsaved edits
  └─ Socket.IO invalidates canonical queries after durable changes
             │
             ▼
NestJS API ── optimistic revision and aggregate-version checks
  ├─ PostgreSQL: sandbox aggregate, audit entries, attachments, outbox
  ├─ Redis/BullMQ: retryable realtime delivery
  └─ MinIO: private streamed attachment objects
```

The form, workflow, API, and realtime boundaries are separate workspace packages.
Responses are parsed at runtime with Zod, so a successful HTTP status with an invalid
body is still rejected by the client.

See [`docs/architecture.md`](docs/architecture.md) for state ownership, consistency
boundaries, failure behavior, and module responsibilities. The main persistence
decision is recorded in
[`docs/adr/0001-sandbox-aggregate-and-outbox.md`](docs/adr/0001-sandbox-aggregate-and-outbox.md).

## Consistency and security guarantees

- Draft saves use an expected revision. Conflicts return `409 revision_conflict`
  instead of silently overwriting another edit.
- Aggregate state, its audit entry, attachment metadata, and its outbox event are
  written in one PostgreSQL transaction.
- Realtime delivery is at least once. Event IDs allow clients to deduplicate, and
  the UI always reloads canonical state after a durable event.
- Uploads are streamed with backpressure, capped at 5 MB, allowlisted by media type,
  checked by file signature, hashed with SHA-256, and removed with their sandbox.
- Access tokens are returned once and stored only as SHA-256 hashes by the API.
- The project does not claim exactly-once execution. A client may retry after losing
  a response, while revision and aggregate checks prevent stale overwrites.

PostgreSQL is used whenever `DATABASE_URL` is configured. A memory repository exists
only as an explicit local and test fallback and logs that its state is disposable.

## Repository layout

```text
apps/
  api/                     NestJS API, Prisma migration, workers
  web/                     React PWA and Playwright journey
packages/
  api-client/              typed, runtime-validating HTTP client
  api-contracts/           shared HTTP schemas
  form-schema/             typed form model, conditions, validation
  realtime-contracts/      durable and ephemeral event schemas
  workflow-schema/         workflow graph and transition engine
docs/                      architecture notes and decisions
deploy/                    Caddy edge configuration
```

## Run the complete stack

Requirements are Docker with Compose. Copy the safe local defaults and start all
services:

```bash
cp .env.example .env
docker compose up --build
```

Open `http://localhost:4173`. OpenAPI is available at
`http://localhost:4173/api/docs` through the same Caddy entry point.

The API container applies pending Prisma migrations before starting. PostgreSQL,
Redis, MinIO, API, web, and Caddy all have health checks.

## Run in development

Requirements are Node.js 22 or newer and pnpm 11.13.1.

```bash
corepack enable
pnpm install
docker compose up -d postgres redis minio
export DATABASE_URL=postgresql://flowform:flowform-local-only@localhost:5432/flowform
export REDIS_URL=redis://localhost:6379
export MINIO_ENDPOINT=localhost
export MINIO_PORT=9000
export MINIO_ACCESS_KEY=flowform
export MINIO_SECRET_KEY=flowform-local-secret
export PUBLIC_APP_URL=http://localhost:5173
pnpm db:migrate:deploy
pnpm dev
```

The PWA runs at `http://localhost:5173` and proxies REST and Socket.IO traffic to
the API at `http://localhost:3000`.

If Corepack cannot provision pnpm, use `npx --yes pnpm@11.13.1` in place of `pnpm`.

## Verification

```bash
pnpm verify
pnpm test:e2e
docker compose config --quiet
docker compose build web api
```

`pnpm verify` checks formatting, lint rules, strict TypeScript, unit and integration
tests, and production builds. CI executes the HTTP and browser journeys against a
real PostgreSQL service.

## License

This project is source-available under the PolyForm Noncommercial License 1.0.0.
Limited technical evaluation for recruitment is permitted under
[`EVALUATION-GRANT.md`](EVALUATION-GRANT.md). See [`LICENSE`](LICENSE) and
[`COMMERCIAL-LICENSE.md`](COMMERCIAL-LICENSE.md) for details.
