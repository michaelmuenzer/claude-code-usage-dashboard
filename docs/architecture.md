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
