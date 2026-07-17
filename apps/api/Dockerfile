FROM node:22-bookworm-slim AS build

WORKDIR /workspace
RUN npm install --global pnpm@11.13.1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json eslint.config.mjs .prettierrc.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/form-schema/package.json packages/form-schema/package.json
COPY packages/workflow-schema/package.json packages/workflow-schema/package.json
COPY packages/realtime-contracts/package.json packages/realtime-contracts/package.json
COPY packages/api-client/package.json packages/api-client/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @flowform/api... build

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /workspace
COPY --from=build /workspace /workspace
USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
