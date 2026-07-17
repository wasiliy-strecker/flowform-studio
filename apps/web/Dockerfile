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
RUN pnpm --filter @flowform/web... build

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html
EXPOSE 80
