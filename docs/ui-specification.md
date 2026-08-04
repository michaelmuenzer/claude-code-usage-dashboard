# UI Specification

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
  markers (~10ms), not containers, so this is the best available signal. A tool call with
  no skill invocation anywhere in its trace never shows up in any of these three (see the
  footer note on the page). All of them (including Tool Calls by Skill and the flow
  diagram) are filterable by a Skill dropdown.
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

Switching tabs or changing a filter only re-fetches that tab's charts, not the other
tabs'.
