-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "DemoSandbox" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "activeRole" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "aggregateVersion" INTEGER NOT NULL DEFAULT 1,
    "form" JSONB NOT NULL,
    "workflow" JSONB NOT NULL,
    "publishedVersion" JSONB,
    "submission" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemoSandbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SandboxAuditEvent" (
    "id" UUID NOT NULL,
    "sandboxId" UUID NOT NULL,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SandboxAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" UUID NOT NULL,
    "sandboxId" UUID NOT NULL,
    "objectKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "storage" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" UUID NOT NULL,
    "sandboxId" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DemoSandbox_tokenHash_key" ON "DemoSandbox"("tokenHash");

-- CreateIndex
CREATE INDEX "DemoSandbox_expiresAt_idx" ON "DemoSandbox"("expiresAt");

-- CreateIndex
CREATE INDEX "SandboxAuditEvent_sandboxId_occurredAt_idx" ON "SandboxAuditEvent"("sandboxId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_objectKey_key" ON "Attachment"("objectKey");

-- CreateIndex
CREATE INDEX "Attachment_sandboxId_createdAt_idx" ON "Attachment"("sandboxId", "createdAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_publishedAt_createdAt_idx" ON "OutboxEvent"("publishedAt", "createdAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_sandboxId_createdAt_idx" ON "OutboxEvent"("sandboxId", "createdAt");

-- AddForeignKey
ALTER TABLE "SandboxAuditEvent" ADD CONSTRAINT "SandboxAuditEvent_sandboxId_fkey" FOREIGN KEY ("sandboxId") REFERENCES "DemoSandbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_sandboxId_fkey" FOREIGN KEY ("sandboxId") REFERENCES "DemoSandbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_sandboxId_fkey" FOREIGN KEY ("sandboxId") REFERENCES "DemoSandbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;
