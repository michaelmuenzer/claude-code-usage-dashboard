// groupPromptRows (the only function this file tested) was removed: promptListQuery
// now returns already-flat prompt rows directly, with per-invocation detail moved to
// traceSpansQuery for the trace waterfall, so there's no longer any grouping logic to
// unit test here. Left as an empty test file rather than deleted outright — delete it
// with `rm src/routes.test.ts` if you'd rather not carry it.
