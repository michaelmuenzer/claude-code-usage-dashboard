# Claude Code Usage Dashboard

A small, fully standalone dashboard for Claude Code tool/skill/plugin usage, with live
filtering by tool, by skill, and by date range, across separate Tool and Skill Analytics
tabs. Ships with its own ClickHouse instance and its own OTel Collector — no Langfuse (or
any other backend) required.

```
Claude Code CLI ──OTLP──▶ otel-collector ──clickhouse exporter──▶ clickhouse ◀── dashboard (reads)
```

The Collector's `transform/rename_tool_spans` processor renames Claude Code's generic
`claude_code.tool` spans to `claude_code.tool:{name}` / `claude_code.skill:{name}` using
attributes Claude Code already emits, so ClickHouse queries can group by name and tell
tools/skills apart. The Collector's built-in `clickhouse` exporter then writes spans
straight into its own `otel_traces` table — no Langfuse ingestion path, no shared
ClickHouse instance with any other stack.

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

`OTEL_LOG_USER_PROMPTS=1` is required for the Prompts tab (see Layout below) to
show actual prompt text — without it, Claude Code redacts prompts before they're
ever sent. Once set, **prompt text is stored in plaintext in your local
ClickHouse** — a step up in sensitivity from tool/skill names alone. This stack is
local-only and never leaves your machine, but worth knowing before you turn it on.

This applies to every Claude Code session on this machine. To scope it to one project
instead, put the same block in that project's `.claude/settings.json`. Env vars are read
at process startup, so open a new terminal / start a new `claude` session after saving.

This stack's OTel Collector and ClickHouse default to `14317`/`14318`/`18123`/`19000` (the
dashboard app itself stays on `3001`) specifically so it can run alongside a separate
Langfuse monitoring stack — which defaults to `4317`/`4318`/`8123`/`9000` — without a port
collision. If you're only running this stack, feel free to move those back to the OTel
defaults (`4317`/`4318`) in `docker-compose.yml`.

### Sending telemetry to both Langfuse and this dashboard at once

Claude Code's telemetry config (`OTEL_EXPORTER_OTLP_ENDPOINT`) is a single URI — the CLI
itself can only export to one collector at a time, it can't fan out to two. If you want
every session to land in both Langfuse and this dashboard while keeping Claude Code wired
directly to *this* stack's collector (as set up above), the fan-out has to happen inside
this stack's `otel-collector-config.yaml`, not by switching Claude Code's endpoint.

Add Langfuse as a second exporter to the `traces` pipeline, alongside the existing
`clickhouse` one:

```yaml
extensions:
  health_check:
    endpoint: 0.0.0.0:13133
  basicauth/langfuse:
    client_auth:
      username: ${env:LANGFUSE_PUBLIC_KEY}
      password: ${env:LANGFUSE_SECRET_KEY}

exporters:
  clickhouse:
    # ...unchanged...
  otlphttp/langfuse:
    endpoint: http://host.docker.internal:3000/api/public/otel
    encoding: proto
    auth:
      authenticator: basicauth/langfuse
    headers:
      x-langfuse-ingestion-version: "4"
    sending_queue:
      enabled: true
    retry_on_failure:
      enabled: true

service:
  extensions: [health_check, basicauth/langfuse]
  pipelines:
    traces:
      receivers: [otlp]
      processors: [transform/rename_tool_spans, batch]
      exporters: [clickhouse, otlphttp/langfuse]   # both, from one pipeline
```

`host.docker.internal` reaches the Langfuse monitoring stack's `langfuse-web` container via
its host-published port (`3000`) — the two stacks are separate Compose projects on separate
Docker networks, so `langfuse-web` isn't resolvable by container name from here. Add
`LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` to this stack's `.env` (same values as the
Langfuse stack's `.env`), then `docker compose restart otel-collector` to pick it up.

This does reintroduce a runtime dependency on the Langfuse stack being up — that's the
tradeoff for keeping Claude Code pointed at a single collector instead of juggling two
endpoints. It's opt-in: leave the config as-is (ClickHouse only) if you don't need it.

### 4. Open the dashboard

http://localhost:3001

## Layout

Three tabs, so tool-shaped, skill-shaped, and prompt-shaped questions don't compete
for space:

- **Tool Analytics** — Tool Calls by Type, Avg Latency per Tool, Tool Call Volume Over
  Time, and a Tool Errors list (full error message per occurrence, collapsible past 2
  lines, like prompt text). Clicking an error expands it in place with the prompt that
  triggered it and how long the call ran before failing. Filterable by a multi-select
  Tool dropdown (all tools checked by default; Select all / Clear all inside the panel).
- **Skill Analytics** — Skill Usage by Name, Plugin Usage (grouped by the plugin segment
  of a skill's name, e.g. `superpowers` from `superpowers:brainstorming`), Skill Usage
  Latency, Skill Call Volume Over Time, Tool Calls by Skill, a Skill → Tool Call Flow
  diagram (a dependency-free SVG ribbon/Sankey view of the same data), Errors by Skill,
  and a Skill Errors list (same click-to-expand debug detail as Tool Errors). Tool Calls
  by Skill / the flow diagram / Errors by Skill are all a same-trace co-occurrence
  breakdown (which tools were called in the same trace as a given skill invocation), not
  true per-invocation nesting — Claude Code's spans confirm no direct parent/child link
  exists between skill and tool spans, and skill span durations are near-instantaneous
  markers (~10ms), not containers, so this is the best available signal; see
  `docs/brainstorms/2026-08-01-custom-dashboard-tool-brainstorm.md` for the original
  reasoning. A tool call with no skill invocation anywhere in its trace never shows up in
  any of these three (see the footer note on the page). All of them (including Tool
  Calls by Skill and the flow diagram) are filterable by a Skill dropdown.
- **Prompts** — Top Token-Consuming Prompts (summed across each prompt's own LLM calls —
  input/output/cache tokens) and a prompt picker below a **Prompt Trace Waterfall**.
  Picking a prompt fetches every span in its trace and renders a real nested timeline:
  unlike the skill/tool co-occurrence above, `claude_code.llm_request` and
  `claude_code.tool:*`/`claude_code.skill:*` spans genuinely are children of their
  `claude_code.interaction` span (confirmed via `ParentSpanId`), so depth in the
  waterfall reflects the actual span tree, not a heuristic. The prompt picker itself is
  additionally filterable by Tool and Skill (from that tab's own dropdowns) — those
  select whole prompts that had a direct child span for that tool or skill.

**Project**, **Session type**, and **Date range** controls sit above the tab nav itself,
since all three scope every tab at once — including which tools/skills/projects show up
in each tab's own dropdowns, so stale options from outside the selected window, project,
or session type don't linger. Date range offers fixed windows (Last 15 minutes / hour /
6 hours / 24 hours / 7 days / 30 days / 90 days / All time) or **Custom range**, which
reveals a start/end pair of minute-granularity datetime pickers for an arbitrary window.
Volume-over-time charts bucket every 5 minutes for windows of 3 hours or less, hourly out
to 3 days, and daily beyond that (including "all time" and long custom ranges), to avoid
an unreadable wall of points at either extreme.

### Filtering by project

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

Adding a `.claude/settings.json` per project works but has to be done once per repo.
`OTEL_RESOURCE_ATTRIBUTES` can't hold a dynamic value in that JSON file, so if you'd rather
every session everywhere be tagged with its current folder name — with no per-project setup —
wrap the `claude` binary in a shell function instead. In `~/.zshrc` (or `~/.bashrc`):

```bash
claude() {
  local project_name="${PWD:t}"       # bash: project_name="$(basename "$PWD")"
  project_name="${project_name// /-}"
  OTEL_RESOURCE_ATTRIBUTES="project.name=${project_name}" command claude "$@"
}
```

`command claude` bypasses the function to call the real binary, so args still pass through
untouched. This sets the resource attribute for every invocation, computed from whatever
directory you're in at the time — no `.claude/settings.json` edits needed. A project-level
`OTEL_RESOURCE_ATTRIBUTES` (the approach above) still takes precedence over this shell
default wherever both are present, so you can keep hand-picked names for specific repos and
let everything else fall back to its folder name.

This shell function only fires when *you* type `claude` in a terminal — anything that
launches the `claude` binary directly (a GUI wrapper, an editor extension, a task runner)
bypasses your shell entirely and won't pick it up.

<details>
<summary>Optional: making this work when Claude Code is launched by <a href="https://cmux.com">cmux</a> instead of your shell</summary>

cmux launches the `claude` binary directly, so the shell function above never runs for
cmux-managed sessions. cmux exposes exactly one relevant hook for this: `automation.claudeBinaryPath`
in `~/.config/cmux/cmux.json` — a path to the binary it should run instead of resolving
`claude` from `PATH`. Point it at a small wrapper script that does the same thing the shell
function does, then `exec`s the real binary:

```bash
#!/usr/bin/env bash
# e.g. ~/.local/bin/claude-cmux-wrapper
project_name="$(basename "$PWD")"
project_name="${project_name// /-}"
export OTEL_RESOURCE_ATTRIBUTES="project.name=${project_name}"
exec /opt/homebrew/bin/claude "$@"
```

```jsonc
// ~/.config/cmux/cmux.json
"automation": {
  "claudeBinaryPath": "/Users/you/.local/bin/claude-cmux-wrapper"
},
```

Back up `cmux.json` before editing it (cmux's own convention), then run `cmux reload-config`
to apply without restarting the app. Don't point `claudeBinaryPath` at
`/opt/homebrew/bin/claude` itself and wrap *that* — it's a Homebrew-managed symlink and
`brew upgrade` will silently overwrite anything placed there; routing through cmux's own
config keeps the wrapper independent of that churn.

This is optional and unmaintained on any particular machine by default — it's a bit more
moving parts than the shell function (a script file plus an app-specific config edit) for
the same result, so reach for it only if you actually run Claude Code through cmux.

</details>

Whichever of the above you use, **existing open Claude Code sessions won't pick it up.**
`OTEL_*` env vars are read once when the `claude` process starts, so editing
`~/.claude/settings.json`, a project's `.claude/settings.json`, or your shell config only
takes effect for sessions started *after* the change — restart (or open a new) session to
see it reflected on the dashboard.

Switching tabs or changing a filter only re-fetches that tab's charts, not the other
tabs'.

### Filtering by session type

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
