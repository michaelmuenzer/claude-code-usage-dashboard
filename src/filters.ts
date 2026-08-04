export interface SqlCondition {
  clause: string;
  params: Record<string, string | string[]>;
}

// Accepts either a single tool name (legacy call sites) or a list from the
// multi-select Tool filter. `undefined` means "no filter, all tools"; an
// empty array is a deliberate "nothing selected" and matches no rows —
// distinct from omitting the filter entirely.
export function toolFilterCondition(
  tool?: string | string[],
  column = "SpanAttributes['tool_name']"
): SqlCondition {
  if (tool === undefined) return { clause: '', params: {} };
  const tools = Array.isArray(tool) ? tool : [tool];
  if (tools.length === 0) return { clause: 'AND 1 = 0', params: {} };
  if (tools.length === 1) {
    return { clause: `AND ${column} = {toolName:String}`, params: { toolName: tools[0] } };
  }
  return { clause: `AND ${column} IN {toolNames:Array(String)}`, params: { toolNames: tools } };
}

export function skillFilterCondition(skill?: string, column = "SpanAttributes['skill_name']"): SqlCondition {
  if (!skill) return { clause: '', params: {} };
  return {
    clause: `AND ${column} = {skillName:String}`,
    params: { skillName: skill },
  };
}

// A relative window ("last N minutes") or an absolute one (explicit start/end,
// as ISO strings straight from a <input type="datetime-local"> converted to
// UTC in the browser). Every existing call site passes a plain number, so
// this is purely additive.
export type DateRange = number | { start: string; end: string };

// ClickHouse's DateTime param binding wants 'YYYY-MM-DD HH:MM:SS' in the
// server's timezone (this stack assumes UTC throughout, same as the `now()`
// used by the relative branch below) — not raw ISO8601, which it won't parse
// as a DateTime literal.
function toClickHouseDateTime(iso: string): string {
  return new Date(iso).toISOString().slice(0, 19).replace('T', ' ');
}

export function dateRangeCondition(range?: DateRange, column = 'Timestamp'): SqlCondition {
  if (range === undefined) return { clause: '', params: {} };
  if (typeof range === 'number') {
    return {
      clause: `AND ${column} >= now() - INTERVAL {minutes:UInt32} MINUTE`,
      params: { minutes: String(range) },
    };
  }
  return {
    clause: `AND ${column} >= {rangeStart:DateTime} AND ${column} <= {rangeEnd:DateTime}`,
    params: {
      rangeStart: toClickHouseDateTime(range.start),
      rangeEnd: toClickHouseDateTime(range.end),
    },
  };
}

export function projectFilterCondition(project?: string, column = "ResourceAttributes['project.name']"): SqlCondition {
  if (!project) return { clause: '', params: {} };
  return {
    clause: `AND ${column} = {project:String}`,
    params: { project },
  };
}

export function sessionTypeFilterCondition(sessionType?: string): SqlCondition {
  if (sessionType !== 'interactive' && sessionType !== 'one-shot') return { clause: '', params: {} };
  return {
    clause: 'AND session_type = {sessionType:String}',
    params: { sessionType },
  };
}

export interface SessionTypeJoin {
  joinClause: string;
  whereClause: string;
  params: Record<string, string>;
}

// Tool/skill spans carry no session-level info of their own — "interactive"
// vs "one-shot" is a property of the whole trace (more than one
// claude_code.interaction span in it), so filtering by it requires joining
// out to a per-trace interaction count rather than matching a column that's
// already on the row, unlike the other filters in this file. `traceIdColumn`
// lets callers qualify it (e.g. `s.TraceId`) when the query already has
// other aliased tables and an unqualified `TraceId` would be ambiguous.
export function sessionTypeJoinCondition(sessionType?: string, traceIdColumn = 'TraceId'): SessionTypeJoin {
  if (sessionType !== 'interactive' && sessionType !== 'one-shot') {
    return { joinClause: '', whereClause: '', params: {} };
  }
  return {
    joinClause: `
      LEFT JOIN (
        SELECT TraceId, count() AS interaction_count
        FROM otel_traces
        WHERE SpanName = 'claude_code.interaction'
        GROUP BY TraceId
      ) AS session_join
      ON session_join.TraceId = ${traceIdColumn}
    `,
    whereClause: `AND if(session_join.interaction_count > 1, 'interactive', 'one-shot') = {sessionType:String}`,
    params: { sessionType },
  };
}
