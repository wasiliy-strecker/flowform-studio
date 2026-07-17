# FlowForm Studio PRO

FlowForm Studio is a visual builder for forms, approval workflows, submissions,
and contextual team conversations. It is designed as a production-shaped React
and TypeScript portfolio project with a self-contained demo experience.

## Current vertical slice

The first release demonstrates one complete flow:

1. Build a multi-step expense request form
2. Configure a conditional two-stage approval workflow
3. Publish and submit the form
4. Request clarification in a contextual conversation
5. Resubmit and approve as reviewer and management
6. Inspect the immutable audit timeline

The public demo creates an isolated 24-hour sandbox. A role switcher allows one
reviewer to experience every role without creating accounts.

## How the application runs

FlowForm Studio is browser-first. During development it opens as a normal web
application. The production build is also a Progressive Web App and can be
installed from a supporting browser on Windows, macOS, Linux, Android, and iOS.
It does not require or currently ship a separate Windows `.exe` or macOS app.

The installed PWA uses the same React and TypeScript code as the browser
version. Static application assets are available offline, while collaboration,
publishing, uploads, and API operations require the backend.

## Architecture

```text
React + TypeScript PWA
├── visual form builder and dynamic form runtime
├── typed React Flow workflow editor
├── TanStack Query server state
└── Zustand command history

NestJS + TypeScript
├── versioned REST and OpenAPI
├── Socket.IO collaboration events
├── workflow engine and audit outbox
└── sandbox cleanup worker

PostgreSQL + Redis + MinIO
```

The checked-in Prisma model, containers, and service boundaries provide the
production persistence foundation. The current recruiter slice deliberately
keeps each protected sandbox in API memory and expires it after 24 hours. This
makes the demo disposable and prevents recruiter test data from becoming
permanent. Durable multi-tenant persistence is the next production milestone.

## Local development

Requirements are Node.js 22 or newer and Corepack.

```bash
corepack enable
pnpm install
pnpm dev
```

If the installed Corepack version cannot provision pnpm, the equivalent
bootstrap command is `npx --yes pnpm@11.13.1 install`. The remaining commands
can then be prefixed with `npx --yes pnpm@11.13.1` in the same way.

The web app uses `http://localhost:5173` and the API uses
`http://localhost:3000/api/v1`.

For the complete service topology, copy `.env.example` to `.env` and run:

```bash
docker compose up --build
```

## Verification

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## License

This project is source-available under the PolyForm Noncommercial License
1.0.0.

Personal and other noncommercial use is permitted. Commercial use is not
licensed at this time.

Limited technical evaluation for recruitment purposes is permitted under
[`EVALUATION-GRANT.md`](EVALUATION-GRANT.md).

This project is source-available, not open source. See [`LICENSE`](LICENSE) and
[`COMMERCIAL-LICENSE.md`](COMMERCIAL-LICENSE.md) for details.
