-- CreateTable
CREATE TABLE "PublishedFormVersion" (
    "sandboxId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "draftRevision" INTEGER NOT NULL,
    "form" JSONB NOT NULL,
    "workflow" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublishedFormVersion_pkey" PRIMARY KEY ("sandboxId", "version")
);

-- Preserve the latest snapshot from the v0.2 aggregate representation.
INSERT INTO "PublishedFormVersion" (
    "sandboxId",
    "version",
    "draftRevision",
    "form",
    "workflow",
    "publishedAt"
)
SELECT
    "id",
    ("publishedVersion"->>'version')::INTEGER,
    ("publishedVersion"->>'draftRevision')::INTEGER,
    "publishedVersion"->'form',
    "publishedVersion"->'workflow',
    (("publishedVersion"->>'publishedAt')::TIMESTAMPTZ AT TIME ZONE 'UTC')
FROM "DemoSandbox"
WHERE "publishedVersion" IS NOT NULL;

-- v0.2 executed an existing submission against the latest snapshot after a
-- republish. Historical snapshots cannot be reconstructed, so retain that
-- behavior by aligning the legacy reference with the preserved snapshot.
UPDATE "DemoSandbox"
SET "submission" = jsonb_set(
    "submission",
    '{formVersion}',
    to_jsonb(("publishedVersion"->>'version')::INTEGER),
    false
)
WHERE "submission" IS NOT NULL
  AND "publishedVersion" IS NOT NULL
  AND ("submission"->>'formVersion')::INTEGER <> ("publishedVersion"->>'version')::INTEGER;

-- Remove the mutable aggregate snapshot after the backfill.
ALTER TABLE "DemoSandbox" DROP COLUMN "publishedVersion";

-- Clarify that the outbox timestamp records a server-side relay, not browser delivery.
ALTER TABLE "OutboxEvent" RENAME COLUMN "publishedAt" TO "relayedAt";
ALTER TABLE "OutboxEvent" RENAME COLUMN "attempts" TO "relayAttempts";
ALTER INDEX "OutboxEvent_publishedAt_createdAt_idx" RENAME TO "OutboxEvent_relayedAt_createdAt_idx";

-- CreateIndex
CREATE INDEX "PublishedFormVersion_sandboxId_publishedAt_idx" ON "PublishedFormVersion"("sandboxId", "publishedAt");

-- AddForeignKey
ALTER TABLE "PublishedFormVersion" ADD CONSTRAINT "PublishedFormVersion_sandboxId_fkey" FOREIGN KEY ("sandboxId") REFERENCES "DemoSandbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;
