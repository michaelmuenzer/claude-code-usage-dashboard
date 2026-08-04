# Tagging projects automatically when launched via cmux

This is a variant of the [shell-function project-tagging approach](../README.md#tagging-every-project-automatically-by-folder-name)
for people who launch Claude Code through [cmux](https://cmux.com) instead of a shell.

cmux launches the `claude` binary directly, so the shell function never runs for
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
