# How it works

```
Claude Code CLI ──OTLP──▶ otel-collector ──clickhouse exporter──▶ clickhouse ◀── dashboard (reads)
```

The Collector's `transform/rename_tool_spans` processor renames Claude Code's generic
`claude_code.tool` spans to `claude_code.tool:{name}` / `claude_code.skill:{name}` using
attributes Claude Code already emits, so ClickHouse queries can group by name and tell
tools/skills apart. The Collector's built-in `clickhouse` exporter then writes spans
straight into its own `otel_traces` table — no Langfuse ingestion path, no shared
ClickHouse instance with any other stack.

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
