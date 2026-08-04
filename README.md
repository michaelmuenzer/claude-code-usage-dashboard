# Claude Code Usage Dashboard

A small, fully standalone dashboard for Claude Code tool/skill/plugin usage, with live
filtering by tool, by skill, and by date range, across separate Tool and Skill Analytics
tabs. Ships with its own ClickHouse instance and its own OTel Collector — no Langfuse (or
any other backend) required.

## Setup

### 1. Create your `.env`

```bash
cp .env.example .env
```

Fill in `CLICKHOUSE_PASSWORD` (`openssl rand -base64 24`). Everything else has a sane
local default.

### 2. Start the stack

```bash
docker compose up -d --build
```

First boot pulls the images and builds the dashboard image — give it a minute. Check
progress with `docker compose ps`.

### 3. Point Claude Code at this stack

Add this to `~/.claude/settings.json` (merge it in — don't overwrite the file; back up
your existing settings first with `cp ~/.claude/settings.json ~/.claude/settings.json.bak`):

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
    "CLAUDE_CODE_ENHANCED_TELEMETRY_BETA": "1",
    "OTEL_TRACES_EXPORTER": "otlp",
    "OTEL_EXPORTER_OTLP_ENDPOINT": "http://localhost:14318",
    "OTEL_EXPORTER_OTLP_PROTOCOL": "http/protobuf",
    "OTEL_LOG_USER_PROMPTS": "1"
  }
}
```

`OTEL_LOG_USER_PROMPTS=1` is required for the Prompts tab to show actual prompt text —
without it, Claude Code redacts prompts before they're ever sent. Once set, **prompt text
is stored in plaintext in your local ClickHouse** — a step up in sensitivity from
tool/skill names alone. This stack is local-only and never leaves your machine, but worth
knowing before you turn it on.

This applies to every Claude Code session on this machine. To scope it to one project
instead, put the same block in that project's `.claude/settings.json`. Env vars are read
at process startup, so open a new terminal / start a new `claude` session after saving.

This stack's OTel Collector and ClickHouse default to `14317`/`14318`/`18123`/`19000` (the
dashboard app itself stays on `3001`) specifically so it can run alongside a separate
Langfuse monitoring stack — which defaults to `4317`/`4318`/`8123`/`9000` — without a port
collision. If you're only running this stack, feel free to move those back to the OTel
defaults (`4317`/`4318`) in `docker-compose.yml`.

Want every session to also land in a separate Langfuse stack at the same time? See
[`docs/langfuse-dual-export.md`](docs/langfuse-dual-export.md).

### 4. Open the dashboard

http://localhost:3001

## Filtering by project

By default every session lands under "All projects" — Claude Code's OTel export carries no
built-in attribute for which directory/repo a session ran in. To split usage out by
project, add a resource attribute in that project's own `.claude/settings.json` (not the
global one):

```json
{
  "env": {
    "OTEL_RESOURCE_ATTRIBUTES": "project.name=my-repo"
  }
}
```

Sessions started in that directory will then carry `project.name=my-repo` on every span,
and "my-repo" appears as an option in the Project dropdown. Sessions with no such attribute
set keep showing up under "All projects" (they're never hidden, just not attributable to a
specific one).

#### Tagging every project automatically by folder name

To tag every session everywhere by its current folder name — no per-project
`.claude/settings.json` needed — wrap the `claude` binary in a shell function instead. In
`~/.zshrc` (or `~/.bashrc`):

```bash
claude() {
  local project_name="${PWD:t}"       # bash: project_name="$(basename "$PWD")"
  project_name="${project_name// /-}"
  OTEL_RESOURCE_ATTRIBUTES="project.name=${project_name}" command claude "$@"
}
```

`command claude` bypasses the function to call the real binary, so args still pass through.

- Only fires when *you* type `claude` in a terminal — a GUI wrapper, editor extension, or
  task runner that launches the binary directly won't trigger it. Launching via
  [cmux](https://cmux.com) instead? See [`docs/cmux-wrapper.md`](docs/cmux-wrapper.md) for
  the equivalent wrapper-script approach.
- A project-level `OTEL_RESOURCE_ATTRIBUTES` still takes precedence over this shell
  default, so you can hand-pick names for specific repos and let everything else fall back
  to its folder name.

Whichever tagging method you use, **existing open Claude Code sessions won't pick it up.**
`OTEL_*` env vars are read once when the `claude` process starts, so restart (or open a new)
session after saving to see it reflected on the dashboard.

## Filtering by session type

Claude Code doesn't send a session-type flag of its own — each trace is classified as
**interactive** or **one-shot** by counting how many `claude_code.interaction` spans (i.e.
user prompts) it contains:

- **Interactive** — more than one prompt in the same trace: an ongoing back-and-forth
  session, e.g. `claude` run in a terminal and used for several turns, or a resumed
  session.
- **One-shot** — exactly one prompt in the trace: an isolated `claude -p "..."` call that
  starts, answers, and exits without further interaction.

This is computed per-trace at query time — `if(session_join.interaction_count > 1,
'interactive', 'one-shot')`, joined in via `sessionTypeJoinCondition` in `src/filters.ts` —
rather than stored as a column, so every chart's aggregation reflects the full trace no
matter which span type it's counting.

## Local development (without Docker)

```bash
npm install
npm run dev
```

Requires `CLICKHOUSE_URL`, `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD`, and `CLICKHOUSE_DB` set
in the environment (copy the values from your `.env`; `CLICKHOUSE_URL` should be
`http://localhost:8123` when running outside Docker, since `clickhouse` as a hostname only
resolves inside the Compose network).

## Maintenance

**Editing `otel-collector-config.yaml`:** it's bind-mounted into the container, so saving a
change on disk isn't enough — run `docker compose restart otel-collector` to make it take
effect.

**Editing `src/` or `public/`:** the `dashboard` container hot-reloads — those directories
are bind-mounted and the container runs `tsx watch`, so saving a change on disk is picked up
automatically, no restart needed. Editing `package.json`, `package-lock.json`, or the
`Dockerfile` itself does need a rebuild: `docker compose up -d --build dashboard`.

**Tear down:**

```bash
docker compose down       # stops everything, keeps all data
docker compose down -v    # also deletes all data (ClickHouse volumes)
```

## License

[MIT](LICENSE)
