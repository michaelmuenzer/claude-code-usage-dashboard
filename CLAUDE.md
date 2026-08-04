# CLAUDE.md

## Docker workflow

The `dashboard` service runs in dev mode (`Dockerfile`'s `dev` stage, `tsx watch src/server.ts`) with `./src` and `./public` bind-mounted, so edits to those directories hot-reload automatically — no rebuild needed.

A rebuild is only required when `package.json`, `package-lock.json`, or the `Dockerfile` itself changes:

```
docker compose up -d --build dashboard
```
