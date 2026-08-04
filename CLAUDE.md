# CLAUDE.md

## UI specification

See [`docs/ui-specification.md`](docs/ui-specification.md) for the dashboard's tabs, charts, and filter controls.

## Architecture

See [`docs/architecture.md`](docs/architecture.md) for how data flows from the Claude Code CLI to the dashboard.

## Docker workflow

The `dashboard` service runs in dev mode (`Dockerfile`'s `dev` stage, `tsx watch src/server.ts`) with `./src` and `./public` bind-mounted, so edits to those directories hot-reload automatically — no rebuild needed.

A rebuild is only required when `package.json`, `package-lock.json`, or the `Dockerfile` itself changes:

```
docker compose up -d --build dashboard
```

**Editing `otel-collector-config.yaml`:** it's bind-mounted into the container, so saving a
change on disk isn't enough — run `docker compose restart otel-collector` to make it take
effect.

**Tear down:**

```bash
docker compose down       # stops everything, keeps all data
docker compose down -v    # also deletes all data (ClickHouse volumes)
```
