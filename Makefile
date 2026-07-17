.PHONY: setup dev format lint typecheck test e2e build verify db-migrate docker-up docker-down

PNPM := npx --yes pnpm@11.13.1

setup:
	$(PNPM) install

dev:
	$(PNPM) dev

format:
	$(PNPM) format

lint:
	$(PNPM) lint

typecheck:
	$(PNPM) typecheck

test:
	$(PNPM) test

e2e:
	$(PNPM) test:e2e

db-migrate:
	$(PNPM) db:migrate:deploy

build:
	$(PNPM) build

verify:
	$(PNPM) verify

docker-up:
	docker compose up --build

docker-down:
	docker compose down
