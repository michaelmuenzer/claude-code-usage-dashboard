import {
  toolFilterCondition,
  skillFilterCondition,
  dateRangeCondition,
  sessionTypeFilterCondition,
  sessionTypeJoinCondition,
  projectFilterCondition,
  type DateRange,
} from './filters.js';
import { parseSkillName } from './skillName.js';

export type QueryParams = Record<string, string | string[]>;

export interface SqlQuery {
  sql: string;
  params: QueryParams;
}

function rangeDurationMinutes(range: DateRange): number {
  if (typeof range === 'number') return range;
  const durationMs = new Date(range.end).getTime() - new Date(range.start).getTime();
  return durationMs > 0 ? durationMs / 60000 : 0;
}

// Five-minute buckets are readable for a sub-3-hour window; hourly buckets
// stay readable out to 3 days. Past that (including "all time") they'd be
// thousands of points, so wider ranges fall back to daily buckets.
function bucketExpression(range?: DateRange): string {
  if (range === undefined) return 'toStartOfDay(Timestamp)';
  const minutes = rangeDurationMinutes(range);
  if (minutes <= 180) return 'toStartOfFiveMinutes(Timestamp)';
  if (minutes <= 4320) return 'toStartOfHour(Timestamp)';
  return 'toStartOfDay(Timestamp)';
}

export function toolCallsByTypeQuery(
  tool?: string | string[],
  minutes?: DateRange,
  project?: string,
  sessionType?: string
): SqlQuery {
  const filter = toolFilterCondition(tool);
  const range = dateRangeCondition(minutes);
  const projectFilter = projectFilterCondition(project);
  const sessionJoin = sessionTypeJoinCondition(sessionType);
  const sql = `
    SELECT
      SpanAttributes['tool_name'] AS tool,
      count() AS calls
    FROM otel_traces
    ${sessionJoin.joinClause}
    WHERE startsWith(SpanName, 'claude_code.tool:')
      ${filter.clause}
      ${range.clause}
      ${projectFilter.clause}
      ${sessionJoin.whereClause}
    GROUP BY tool
    ORDER BY calls DESC
  `;
  return { sql, params: { ...filter.params, ...range.params, ...projectFilter.params, ...sessionJoin.params } };
}

export function skillUsageQuery(skill?: string, minutes?: DateRange, project?: string, sessionType?: string): SqlQuery {
  const filter = skillFilterCondition(skill);
  const range = dateRangeCondition(minutes);
  const projectFilter = projectFilterCondition(project);
  const sessionJoin = sessionTypeJoinCondition(sessionType);
  const sql = `
    SELECT
      SpanAttributes['skill_name'] AS skill_name,
      count() AS calls
    FROM otel_traces
    ${sessionJoin.joinClause}
    WHERE startsWith(SpanName, 'claude_code.skill:')
      ${filter.clause}
      ${range.clause}
      ${projectFilter.clause}
      ${sessionJoin.whereClause}
    GROUP BY skill_name
    ORDER BY calls DESC
  `;
  return { sql, params: { ...filter.params, ...range.params, ...projectFilter.params, ...sessionJoin.params } };
}

export interface SkillCountRow {
  skill_name: string;
  calls: number;
}

export interface PluginCountRow {
  plugin: string;
  calls: number;
}

export function aggregateByPlugin(rows: SkillCountRow[]): PluginCountRow[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const { plugin } = parseSkillName(row.skill_name);
    if (plugin === null) continue;
    totals.set(plugin, (totals.get(plugin) ?? 0) + row.calls);
  }
  return Array.from(totals.entries())
    .map(([plugin, calls]) => ({ plugin, calls }))
    .sort((a, b) => b.calls - a.calls);
}

export function toolVolumeOverTimeQuery(
  tool?: string | string[],
  minutes?: DateRange,
  project?: string,
  sessionType?: string
): SqlQuery {
  const filter = toolFilterCondition(tool);
  const range = dateRangeCondition(minutes);
  const projectFilter = projectFilterCondition(project);
  const sessionJoin = sessionTypeJoinCondition(sessionType);
  const sql = `
    SELECT
      ${bucketExpression(minutes)} AS bucket,
      count() AS calls
    FROM otel_traces
    ${sessionJoin.joinClause}
    WHERE startsWith(SpanName, 'claude_code.tool:')
      ${filter.clause}
      ${range.clause}
      ${projectFilter.clause}
      ${sessionJoin.whereClause}
    GROUP BY bucket
    ORDER BY bucket
  `;
  return { sql, params: { ...filter.params, ...range.params, ...projectFilter.params, ...sessionJoin.params } };
}

export function skillVolumeOverTimeQuery(
  skill?: string,
  minutes?: DateRange,
  project?: string,
  sessionType?: string
): SqlQuery {
  const filter = skillFilterCondition(skill);
  const range = dateRangeCondition(minutes);
  const projectFilter = projectFilterCondition(project);
  const sessionJoin = sessionTypeJoinCondition(sessionType);
  const sql = `
    SELECT
      ${bucketExpression(minutes)} AS bucket,
      count() AS calls
    FROM otel_traces
    ${sessionJoin.joinClause}
    WHERE startsWith(SpanName, 'claude_code.skill:')
      ${filter.clause}
      ${range.clause}
      ${projectFilter.clause}
      ${sessionJoin.whereClause}
    GROUP BY bucket
    ORDER BY bucket
  `;
  return { sql, params: { ...filter.params, ...range.params, ...projectFilter.params, ...sessionJoin.params } };
}

export function toolLatencyQuery(
  tool?: string | string[],
  minutes?: DateRange,
  project?: string,
  sessionType?: string
): SqlQuery {
  const filter = toolFilterCondition(tool);
  const range = dateRangeCondition(minutes);
  const projectFilter = projectFilterCondition(project);
  const sessionJoin = sessionTypeJoinCondition(sessionType);
  const sql = `
    SELECT
      SpanAttributes['tool_name'] AS tool,
      avg(Duration) / 1e6 AS avg_latency_ms
    FROM otel_traces
    ${sessionJoin.joinClause}
    WHERE startsWith(SpanName, 'claude_code.tool:')
      ${filter.clause}
      ${range.clause}
      ${projectFilter.clause}
      ${sessionJoin.whereClause}
    GROUP BY tool
    ORDER BY avg_latency_ms DESC
  `;
  return { sql, params: { ...filter.params, ...range.params, ...projectFilter.params, ...sessionJoin.params } };
}

export function skillLatencyQuery(
  skill?: string,
  minutes?: DateRange,
  project?: string,
  sessionType?: string
): SqlQuery {
  const filter = skillFilterCondition(skill);
  const range = dateRangeCondition(minutes);
  const projectFilter = projectFilterCondition(project);
  const sessionJoin = sessionTypeJoinCondition(sessionType);
  const sql = `
    SELECT
      SpanAttributes['skill_name'] AS skill_name,
      avg(Duration) / 1e6 AS avg_latency_ms
    FROM otel_traces
    ${sessionJoin.joinClause}
    WHERE startsWith(SpanName, 'claude_code.skill:')
      ${filter.clause}
      ${range.clause}
      ${projectFilter.clause}
      ${sessionJoin.whereClause}
    GROUP BY skill_name
    ORDER BY avg_latency_ms DESC
  `;
  return { sql, params: { ...filter.params, ...range.params, ...projectFilter.params, ...sessionJoin.params } };
}

export function distinctToolsQuery(minutes?: DateRange, project?: string): SqlQuery {
  const range = dateRangeCondition(minutes);
  const projectFilter = projectFilterCondition(project);
  const sql = `
    SELECT DISTINCT
      SpanAttributes['tool_name'] AS tool
    FROM otel_traces
    WHERE startsWith(SpanName, 'claude_code.tool:')
      ${range.clause}
      ${projectFilter.clause}
    ORDER BY tool
  `;
  return { sql, params: { ...range.params, ...projectFilter.params } };
}

export function distinctSkillsQuery(minutes?: DateRange, project?: string): SqlQuery {
  const range = dateRangeCondition(minutes);
  const projectFilter = projectFilterCondition(project);
  const sql = `
    SELECT DISTINCT
      SpanAttributes['skill_name'] AS skill_name
    FROM otel_traces
    WHERE startsWith(SpanName, 'claude_code.skill:')
      ${range.clause}
      ${projectFilter.clause}
    ORDER BY skill_name
  `;
  return { sql, params: { ...range.params, ...projectFilter.params } };
}

export function distinctProjectsQuery(minutes?: DateRange): SqlQuery {
  const range = dateRangeCondition(minutes);
  const sql = `
    SELECT DISTINCT
      ResourceAttributes['project.name'] AS project
    FROM otel_traces
    WHERE ResourceAttributes['project.name'] != ''
      ${range.clause}
    ORDER BY project
  `;
  return { sql, params: { ...range.params } };
}

export function toolCallsBySkillQuery(
  minutes?: DateRange,
  project?: string,
  skill?: string,
  sessionType?: string
): SqlQuery {
  const range = dateRangeCondition(minutes);
  const projectFilter = projectFilterCondition(project);
  const filter = skillFilterCondition(skill);
  const sessionJoin = sessionTypeJoinCondition(sessionType, 's.TraceId');
  const sql = `
    SELECT
      s.skill_name AS skill_name,
      t.tool AS tool,
      count() AS calls
    FROM
    (
      SELECT
        TraceId,
        SpanAttributes['skill_name'] AS skill_name
      FROM otel_traces
      WHERE startsWith(SpanName, 'claude_code.skill:')
        ${range.clause}
        ${projectFilter.clause}
        ${filter.clause}
    ) AS s
    INNER JOIN
    (
      SELECT
        TraceId,
        SpanAttributes['tool_name'] AS tool
      FROM otel_traces
      WHERE startsWith(SpanName, 'claude_code.tool:')
        ${range.clause}
        ${projectFilter.clause}
    ) AS t
    ON s.TraceId = t.TraceId
    ${sessionJoin.joinClause}
    WHERE 1 = 1
      ${sessionJoin.whereClause}
    GROUP BY skill_name, tool
    ORDER BY skill_name, calls DESC
  `;
  return {
    sql,
    params: { ...range.params, ...projectFilter.params, ...filter.params, ...sessionJoin.params },
  };
}

// Claude Code's error/success attributes live on a separate
// `claude_code.tool.execution` child span, not on the `claude_code.tool:*`
// span itself — recovered here via a ParentSpanId join back to the parent
// tool span, which is where tool_name actually lives.
function toolExecutionErrorsSubquery(minutes?: DateRange, project?: string, sessionType?: string): SqlQuery {
  const range = dateRangeCondition(minutes, 'e.Timestamp');
  const projectFilter = projectFilterCondition(project, "t.ResourceAttributes['project.name']");
  const sessionJoin = sessionTypeJoinCondition(sessionType, 't.TraceId');
  const sql = `
    SELECT
      t.TraceId AS TraceId,
      t.ParentSpanId AS PromptSpanId,
      t.SpanAttributes['tool_name'] AS tool,
      e.SpanAttributes['error'] AS error,
      e.Timestamp AS timestamp,
      e.Duration / 1e6 AS duration_ms
    FROM otel_traces e
    INNER JOIN otel_traces t
      ON e.ParentSpanId = t.SpanId AND e.TraceId = t.TraceId
    ${sessionJoin.joinClause}
    WHERE e.SpanName = 'claude_code.tool.execution'
      AND e.SpanAttributes['success'] = 'false'
      AND startsWith(t.SpanName, 'claude_code.tool:')
      ${range.clause}
      ${projectFilter.clause}
      ${sessionJoin.whereClause}
  `;
  return { sql, params: { ...range.params, ...projectFilter.params, ...sessionJoin.params } };
}

export interface ToolErrorCountRow {
  tool: string;
  errors: number;
}

export interface ToolErrorRow {
  tool: string;
  error: string;
  timestamp: string;
  duration_ms: number;
  prompt: string | null;
}

export function toolErrorCountsQuery(
  tool?: string | string[],
  minutes?: DateRange,
  project?: string,
  sessionType?: string
): SqlQuery {
  const base = toolExecutionErrorsSubquery(minutes, project, sessionType);
  const filter = toolFilterCondition(tool, 'tool');
  const sql = `
    SELECT tool, count() AS errors
    FROM (${base.sql}) AS errors
    WHERE 1=1
      ${filter.clause}
    GROUP BY tool
    ORDER BY errors DESC
  `;
  return { sql, params: { ...base.params, ...filter.params } };
}

// Joins each error back to the claude_code.interaction span it happened
// under (the tool span's direct parent) so the frontend can show which
// prompt triggered it.
export function toolErrorListQuery(
  tool?: string | string[],
  minutes?: DateRange,
  project?: string,
  sessionType?: string
): SqlQuery {
  const base = toolExecutionErrorsSubquery(minutes, project, sessionType);
  const filter = toolFilterCondition(tool, 'tool');
  const sql = `
    SELECT
      tool,
      error,
      timestamp,
      errors.duration_ms AS duration_ms,
      nullIf(i.SpanAttributes['user_prompt'], '') AS prompt
    FROM (${base.sql}) AS errors
    LEFT JOIN otel_traces i
      ON i.SpanId = errors.PromptSpanId AND i.TraceId = errors.TraceId AND i.SpanName = 'claude_code.interaction'
    WHERE 1=1
      ${filter.clause}
    ORDER BY timestamp DESC
    LIMIT 200
  `;
  return { sql, params: { ...base.params, ...filter.params } };
}

export interface SkillErrorCountRow {
  skill_name: string;
  errors: number;
}

export interface SkillErrorRow {
  skill_name: string;
  tool: string;
  error: string;
  timestamp: string;
  duration_ms: number;
  prompt: string | null;
}

// Skill spans carry no error info of their own and aren't true parents of
// tool spans (confirmed empty when checked against real data), so skill
// attribution reuses the same same-trace co-occurrence heuristic as
// toolCallsBySkillQuery, with the same caveat: an error is attributed to
// every skill invoked anywhere in that trace, not necessarily the one that
// triggered it.
export function skillErrorCountsQuery(
  skill?: string,
  minutes?: DateRange,
  project?: string,
  sessionType?: string
): SqlQuery {
  const base = toolExecutionErrorsSubquery(minutes, project, sessionType);
  const skillRange = dateRangeCondition(minutes);
  const skillProjectFilter = projectFilterCondition(project);
  const filter = skillFilterCondition(skill, 's.skill_name');
  const sql = `
    SELECT s.skill_name AS skill_name, count() AS errors
    FROM (
      SELECT TraceId, SpanAttributes['skill_name'] AS skill_name
      FROM otel_traces
      WHERE startsWith(SpanName, 'claude_code.skill:')
        ${skillRange.clause}
        ${skillProjectFilter.clause}
    ) AS s
    INNER JOIN (${base.sql}) AS errors
    ON s.TraceId = errors.TraceId
    WHERE 1=1
      ${filter.clause}
    GROUP BY skill_name
    ORDER BY errors DESC
  `;
  return {
    sql,
    params: { ...base.params, ...skillRange.params, ...skillProjectFilter.params, ...filter.params },
  };
}

// Joins each error back to the claude_code.interaction span it happened
// under (same as toolErrorListQuery) so the frontend can show which prompt
// triggered it.
export function skillErrorListQuery(
  skill?: string,
  minutes?: DateRange,
  project?: string,
  sessionType?: string
): SqlQuery {
  const base = toolExecutionErrorsSubquery(minutes, project, sessionType);
  const skillRange = dateRangeCondition(minutes);
  const skillProjectFilter = projectFilterCondition(project);
  const filter = skillFilterCondition(skill, 's.skill_name');
  const sql = `
    SELECT
      s.skill_name AS skill_name,
      errors.tool AS tool,
      errors.error AS error,
      errors.timestamp AS timestamp,
      errors.duration_ms AS duration_ms,
      nullIf(i.SpanAttributes['user_prompt'], '') AS prompt
    FROM (
      SELECT TraceId, SpanAttributes['skill_name'] AS skill_name
      FROM otel_traces
      WHERE startsWith(SpanName, 'claude_code.skill:')
        ${skillRange.clause}
        ${skillProjectFilter.clause}
    ) AS s
    INNER JOIN (${base.sql}) AS errors
    ON s.TraceId = errors.TraceId
    LEFT JOIN otel_traces i
      ON i.SpanId = errors.PromptSpanId AND i.TraceId = errors.TraceId AND i.SpanName = 'claude_code.interaction'
    WHERE 1=1
      ${filter.clause}
    ORDER BY errors.timestamp DESC
    LIMIT 200
  `;
  return {
    sql,
    params: { ...base.params, ...skillRange.params, ...skillProjectFilter.params, ...filter.params },
  };
}

export interface TopTokenPromptRow {
  prompt_span_id: string;
  prompt: string;
  timestamp: string;
  total_tokens: number;
}

// claude_code.llm_request spans are true children of the claude_code.interaction
// span they belong to (confirmed via ParentSpanId against real data), except for
// a minority tagged llm_request.context='tool' — LLM calls made from inside a
// tool execution (e.g. a subagent's own calls) — which this rollup does not
// walk back to their owning prompt, so those tokens aren't counted here.
export function topTokenConsumingPromptsQuery(minutes?: DateRange, project?: string, sessionType?: string): SqlQuery {
  const range = dateRangeCondition(minutes, 'i.Timestamp');
  const projectFilter = projectFilterCondition(project, "i.ResourceAttributes['project.name']");
  const sessionJoin = sessionTypeJoinCondition(sessionType, 'i.TraceId');
  const sql = `
    SELECT
      i.SpanId AS prompt_span_id,
      i.SpanAttributes['user_prompt'] AS prompt,
      i.Timestamp AS timestamp,
      sum(
        toInt64OrZero(l.SpanAttributes['input_tokens']) +
        toInt64OrZero(l.SpanAttributes['output_tokens']) +
        toInt64OrZero(l.SpanAttributes['cache_creation_tokens']) +
        toInt64OrZero(l.SpanAttributes['cache_read_tokens'])
      ) AS total_tokens
    FROM otel_traces i
    INNER JOIN otel_traces l
      ON l.ParentSpanId = i.SpanId AND l.TraceId = i.TraceId
    ${sessionJoin.joinClause}
    WHERE i.SpanName = 'claude_code.interaction'
      AND l.SpanName = 'claude_code.llm_request'
      ${range.clause}
      ${projectFilter.clause}
      ${sessionJoin.whereClause}
    GROUP BY i.SpanId, prompt, timestamp
    ORDER BY total_tokens DESC
    LIMIT 25
  `;
  return { sql, params: { ...range.params, ...projectFilter.params, ...sessionJoin.params } };
}

export interface LatencyInvocationRow {
  name: string;
  kind: 'tool' | 'skill';
  duration_ms: number;
  timestamp: string;
}

export function highestLatencyInvocationsQuery(minutes?: DateRange, project?: string): SqlQuery {
  const range = dateRangeCondition(minutes);
  const projectFilter = projectFilterCondition(project);
  const sql = `
    SELECT
      if(startsWith(SpanName, 'claude_code.skill:'), SpanAttributes['skill_name'], SpanAttributes['tool_name']) AS name,
      if(startsWith(SpanName, 'claude_code.skill:'), 'skill', 'tool') AS kind,
      Duration / 1e6 AS duration_ms,
      Timestamp AS timestamp
    FROM otel_traces
    WHERE (startsWith(SpanName, 'claude_code.tool:') OR startsWith(SpanName, 'claude_code.skill:'))
      ${range.clause}
      ${projectFilter.clause}
    ORDER BY duration_ms DESC
    LIMIT 10
  `;
  return { sql, params: { ...range.params, ...projectFilter.params } };
}

export interface PromptListRow {
  trace_id: string;
  prompt_span_id: string;
  prompt: string;
  timestamp: string;
  session_type: 'interactive' | 'one-shot';
}

// claude_code.tool:*/claude_code.skill:* spans are true children of the
// claude_code.interaction span they belong to (ParentSpanId = i.SpanId,
// confirmed against real data) — so unlike the old span-nesting logic this
// replaced, tool/skill attribution here is an exact parent-child check, not
// a heuristic. Per-invocation detail (which tools/skills a prompt triggered,
// at what depth) is fetched separately per prompt via traceSpansQuery, for
// the trace waterfall — this query only lists prompts themselves.
export function promptListQuery(
  minutes?: DateRange,
  sessionType?: string,
  project?: string,
  tool?: string | string[],
  skill?: string
): SqlQuery {
  const range = dateRangeCondition(minutes, 'i.Timestamp');
  const sessionFilter = sessionTypeFilterCondition(sessionType);
  const projectFilter = projectFilterCondition(project, "i.ResourceAttributes['project.name']");

  let invocationFilterClause = '';
  let invocationFilterParams: QueryParams = {};
  if (tool !== undefined && tool !== '') {
    const tools = Array.isArray(tool) ? tool : [tool];
    if (tools.length === 0) {
      // Multi-select Tool filter with everything explicitly unchecked — match nothing.
      invocationFilterClause = 'AND 1 = 0';
    } else if (tools.length === 1) {
      invocationFilterClause = `
        AND EXISTS (
          SELECT 1 FROM otel_traces t
          WHERE t.ParentSpanId = i.SpanId AND t.TraceId = i.TraceId
            AND t.SpanAttributes['tool_name'] = {invocationName:String}
        )
      `;
      invocationFilterParams = { invocationName: tools[0] };
    } else {
      invocationFilterClause = `
        AND EXISTS (
          SELECT 1 FROM otel_traces t
          WHERE t.ParentSpanId = i.SpanId AND t.TraceId = i.TraceId
            AND t.SpanAttributes['tool_name'] IN {invocationNames:Array(String)}
        )
      `;
      invocationFilterParams = { invocationNames: tools };
    }
  } else if (skill) {
    invocationFilterClause = `
      AND EXISTS (
        SELECT 1 FROM otel_traces t
        WHERE t.ParentSpanId = i.SpanId AND t.TraceId = i.TraceId
          AND t.SpanAttributes['skill_name'] = {invocationName:String}
      )
    `;
    invocationFilterParams = { invocationName: skill };
  }

  const sql = `
    SELECT
      i.TraceId AS trace_id,
      i.SpanId AS prompt_span_id,
      i.SpanAttributes['user_prompt'] AS prompt,
      i.Timestamp AS timestamp,
      if(s.interaction_count > 1, 'interactive', 'one-shot') AS session_type
    FROM otel_traces i
    LEFT JOIN (
      SELECT TraceId, count() AS interaction_count
      FROM otel_traces
      WHERE SpanName = 'claude_code.interaction'
      GROUP BY TraceId
    ) s
    ON s.TraceId = i.TraceId
    WHERE i.SpanName = 'claude_code.interaction'
      ${range.clause}
      ${projectFilter.clause}
      ${sessionFilter.clause}
      ${invocationFilterClause}
    ORDER BY timestamp DESC
    LIMIT 200
  `;
  return {
    sql,
    params: {
      ...range.params,
      ...sessionFilter.params,
      ...projectFilter.params,
      ...invocationFilterParams,
    },
  };
}

export interface TraceSpanRow {
  span_id: string;
  parent_span_id: string;
  span_name: string;
  timestamp: string;
  duration_ms: number;
  name: string | null;
}

// Every span in a trace, for client-side waterfall rendering. Depth and
// which spans belong to which prompt (a trace can hold several interaction
// spans in a multi-turn session) are computed in the browser by walking
// ParentSpanId from the selected prompt's SpanId — simpler and more robust
// than hardcoding a fixed number of SQL join levels for an arbitrarily deep
// span tree (interaction -> tool/skill -> execution -> nested llm_request, etc).
export function traceSpansQuery(traceId: string): SqlQuery {
  const sql = `
    SELECT
      SpanId AS span_id,
      ParentSpanId AS parent_span_id,
      SpanName AS span_name,
      Timestamp AS timestamp,
      Duration / 1e6 AS duration_ms,
      if(
        startsWith(SpanName, 'claude_code.skill:'),
        nullIf(SpanAttributes['skill_name'], ''),
        if(
          SpanName = 'claude_code.llm_request',
          nullIf(SpanAttributes['gen_ai.request.model'], ''),
          nullIf(SpanAttributes['tool_name'], '')
        )
      ) AS name
    FROM otel_traces
    WHERE TraceId = {traceId:String}
      -- Claude Code emits this span for every permission-gate check, not just
      -- ones that actually paused for a human — auto-approvals (source=
      -- 'config') and other non-interactive resolutions (source='unknown')
      -- resolve in a few ms and would otherwise clutter the waterfall as
      -- false "blocked on user" rows. Only source starting with 'user_'
      -- (e.g. 'user_temporary', 'user_permanent') means a prompt was shown.
      AND NOT (
        SpanName = 'claude_code.tool.blocked_on_user'
        AND NOT startsWith(SpanAttributes['source'], 'user_')
      )
    ORDER BY Timestamp
  `;
  return { sql, params: { traceId } };
}
