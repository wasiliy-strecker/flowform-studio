.PHONY: setup dev format lint typecheck test build verify docker-up docker-down

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

build:
	$(PNPM) build

verify:
	$(PNPM) verify

docker-up:
	docker compose up --build

docker-down:
	docker compose down
