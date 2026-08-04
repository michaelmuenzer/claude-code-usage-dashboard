# Sending telemetry to both Langfuse and this dashboard at once

Claude Code's telemetry config (`OTEL_EXPORTER_OTLP_ENDPOINT`) is a single URI — the CLI
itself can only export to one collector at a time, it can't fan out to two. If you want
every session to land in both Langfuse and this dashboard while keeping Claude Code wired
directly to *this* stack's collector (as set up in the main README), the fan-out has to
happen inside this stack's `otel-collector-config.yaml`, not by switching Claude Code's
endpoint.

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
