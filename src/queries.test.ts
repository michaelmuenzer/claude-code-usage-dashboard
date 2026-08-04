import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toolCallsByTypeQuery, skillUsageQuery, aggregateByPlugin, toolVolumeOverTimeQuery, skillVolumeOverTimeQuery, toolLatencyQuery, skillLatencyQuery, distinctToolsQuery, distinctSkillsQuery, distinctProjectsQuery, toolCallsBySkillQuery, promptListQuery, toolErrorCountsQuery, toolErrorListQuery, skillErrorCountsQuery, skillErrorListQuery, topTokenConsumingPromptsQuery, highestLatencyInvocationsQuery, traceSpansQuery } from './queries.js';

test('toolCallsByTypeQuery scopes to tool prefix, no filter', () => {
  const { sql, params } = toolCallsByTypeQuery();
  assert.ok(sql.includes("startsWith(SpanName, 'claude_code.tool:')"));
  assert.ok(sql.includes('FROM otel_traces'));
  assert.deepStrictEqual(params, {});
});

test('toolCallsByTypeQuery adds the tool filter when given', () => {
  const { sql, params } = toolCallsByTypeQuery('Bash');
  assert.ok(sql.includes('{toolName:String}'));
  assert.deepStrictEqual(params, { toolName: 'Bash' });
});

test('toolCallsByTypeQuery adds the date range filter when given', () => {
  const { sql, params } = toolCallsByTypeQuery(undefined, 7);
  assert.ok(sql.includes('{minutes:UInt32}'));
  assert.deepStrictEqual(params, { minutes: '7' });
});

test('toolCallsByTypeQuery adds the project filter when given', () => {
  const { sql, params } = toolCallsByTypeQuery(undefined, undefined, 'my-repo');
  assert.ok(sql.includes("ResourceAttributes['project.name']"));
  assert.deepStrictEqual(params, { project: 'my-repo' });
});

test('toolCallsByTypeQuery joins the per-trace interaction count when a session type is given', () => {
  const { sql, params } = toolCallsByTypeQuery(undefined, undefined, undefined, 'interactive');
  assert.ok(sql.includes('LEFT JOIN'));
  assert.ok(sql.includes("SpanName = 'claude_code.interaction'"));
  assert.ok(sql.includes("if(session_join.interaction_count > 1, 'interactive', 'one-shot') = {sessionType:String}"));
  assert.deepStrictEqual(params, { sessionType: 'interactive' });
});

test('toolCallsByTypeQuery omits the session join entirely when no session type is given', () => {
  const { sql } = toolCallsByTypeQuery();
  assert.ok(!sql.includes('session_join'));
});

test('skillUsageQuery scopes to skill prefix, no filter', () => {
  const { sql, params } = skillUsageQuery();
  assert.ok(sql.includes("startsWith(SpanName, 'claude_code.skill:')"));
  assert.deepStrictEqual(params, {});
});

test('skillUsageQuery adds the skill filter when given', () => {
  const { sql, params } = skillUsageQuery('superpowers:brainstorming');
  assert.ok(sql.includes('{skillName:String}'));
  assert.deepStrictEqual(params, { skillName: 'superpowers:brainstorming' });
});

test('skillUsageQuery adds the date range filter when given', () => {
  const { sql, params } = skillUsageQuery(undefined, 30);
  assert.ok(sql.includes('{minutes:UInt32}'));
  assert.deepStrictEqual(params, { minutes: '30' });
});

test('skillUsageQuery adds the project filter when given', () => {
  const { sql, params } = skillUsageQuery(undefined, undefined, 'my-repo');
  assert.ok(sql.includes("ResourceAttributes['project.name']"));
  assert.deepStrictEqual(params, { project: 'my-repo' });
});

test('skillUsageQuery adds the session type filter when given', () => {
  const { sql, params } = skillUsageQuery(undefined, undefined, undefined, 'one-shot');
  assert.ok(sql.includes('session_join'));
  assert.deepStrictEqual(params, { sessionType: 'one-shot' });
});

test('aggregateByPlugin sums calls per plugin and drops skills with no plugin', () => {
  const rows = [
    { skill_name: 'superpowers:brainstorming', calls: 3 },
    { skill_name: 'superpowers:writing-plans', calls: 2 },
    { skill_name: 'claude-api', calls: 5 },
  ];
  assert.deepStrictEqual(aggregateByPlugin(rows), [{ plugin: 'superpowers', calls: 5 }]);
});

test('aggregateByPlugin sorts by calls descending', () => {
  const rows = [
    { skill_name: 'pluginA:x', calls: 1 },
    { skill_name: 'pluginB:y', calls: 9 },
  ];
  assert.deepStrictEqual(aggregateByPlugin(rows), [
    { plugin: 'pluginB', calls: 9 },
    { plugin: 'pluginA', calls: 1 },
  ]);
});

test('toolVolumeOverTimeQuery buckets daily by default and scopes to tool spans', () => {
  const { sql, params } = toolVolumeOverTimeQuery();
  assert.ok(sql.includes('toStartOfDay(Timestamp)'));
  assert.ok(sql.includes("startsWith(SpanName, 'claude_code.tool:')"));
  assert.deepStrictEqual(params, {});
});

test('toolVolumeOverTimeQuery adds the tool filter when given', () => {
  const { sql, params } = toolVolumeOverTimeQuery('Bash');
  assert.ok(sql.includes('{toolName:String}'));
  assert.deepStrictEqual(params, { toolName: 'Bash' });
});

test('toolVolumeOverTimeQuery buckets by five minutes for a very short window', () => {
  const { sql, params } = toolVolumeOverTimeQuery(undefined, 60);
  assert.ok(sql.includes('toStartOfFiveMinutes(Timestamp)'));
  assert.ok(sql.includes('{minutes:UInt32}'));
  assert.deepStrictEqual(params, { minutes: '60' });
});

test('toolVolumeOverTimeQuery buckets hourly just past the five-minute threshold', () => {
  const { sql } = toolVolumeOverTimeQuery(undefined, 181);
  assert.ok(sql.includes('toStartOfHour(Timestamp)'));
});

test('toolVolumeOverTimeQuery buckets hourly for a short date range', () => {
  const { sql, params } = toolVolumeOverTimeQuery(undefined, 1440);
  assert.ok(sql.includes('toStartOfHour(Timestamp)'));
  assert.deepStrictEqual(params, { minutes: '1440' });
});

test('toolVolumeOverTimeQuery buckets daily for a longer date range', () => {
  const { sql } = toolVolumeOverTimeQuery(undefined, 43200);
  assert.ok(sql.includes('toStartOfDay(Timestamp)'));
  assert.ok(!sql.includes('toStartOfHour(Timestamp)'));
  assert.ok(!sql.includes('toStartOfFiveMinutes(Timestamp)'));
});

test('toolVolumeOverTimeQuery buckets daily with no date range (all time)', () => {
  const { sql } = toolVolumeOverTimeQuery();
  assert.ok(sql.includes('toStartOfDay(Timestamp)'));
});

test('toolVolumeOverTimeQuery buckets by five minutes for a short absolute range', () => {
  const { sql, params } = toolVolumeOverTimeQuery(undefined, {
    start: '2026-01-01T00:00:00.000Z',
    end: '2026-01-01T02:00:00.000Z',
  });
  assert.ok(sql.includes('toStartOfFiveMinutes(Timestamp)'));
  assert.deepStrictEqual(params, { rangeStart: '2026-01-01 00:00:00', rangeEnd: '2026-01-01 02:00:00' });
});

test('toolVolumeOverTimeQuery buckets daily for a long absolute range', () => {
  const { sql } = toolVolumeOverTimeQuery(undefined, {
    start: '2026-01-01T00:00:00.000Z',
    end: '2026-06-01T00:00:00.000Z',
  });
  assert.ok(sql.includes('toStartOfDay(Timestamp)'));
});

test('skillVolumeOverTimeQuery buckets by day and scopes to skill spans', () => {
  const { sql, params } = skillVolumeOverTimeQuery();
  assert.ok(sql.includes("startsWith(SpanName, 'claude_code.skill:')"));
  assert.deepStrictEqual(params, {});
});

test('toolVolumeOverTimeQuery adds the project filter when given', () => {
  const { sql, params } = toolVolumeOverTimeQuery(undefined, undefined, 'my-repo');
  assert.ok(sql.includes("ResourceAttributes['project.name']"));
  assert.deepStrictEqual(params, { project: 'my-repo' });
});

test('toolLatencyQuery computes avg duration in milliseconds per tool', () => {
  const { sql, params } = toolLatencyQuery();
  assert.ok(sql.includes('avg(Duration) / 1e6'));
  assert.deepStrictEqual(params, {});
});

test('toolLatencyQuery adds the tool filter when given', () => {
  const { sql, params } = toolLatencyQuery('Bash');
  assert.ok(sql.includes('{toolName:String}'));
  assert.deepStrictEqual(params, { toolName: 'Bash' });
});

test('toolLatencyQuery adds the date range filter when given', () => {
  const { sql, params } = toolLatencyQuery(undefined, 90);
  assert.ok(sql.includes('{minutes:UInt32}'));
  assert.deepStrictEqual(params, { minutes: '90' });
});

test('toolLatencyQuery adds the project filter when given', () => {
  const { sql, params } = toolLatencyQuery(undefined, undefined, 'my-repo');
  assert.ok(sql.includes("ResourceAttributes['project.name']"));
  assert.deepStrictEqual(params, { project: 'my-repo' });
});

test('skillLatencyQuery computes avg duration in milliseconds per skill', () => {
  const { sql, params } = skillLatencyQuery();
  assert.ok(sql.includes('avg(Duration) / 1e6'));
  assert.ok(sql.includes("startsWith(SpanName, 'claude_code.skill:')"));
  assert.deepStrictEqual(params, {});
});

test('skillLatencyQuery adds the date range filter when given', () => {
  const { sql, params } = skillLatencyQuery(undefined, 90);
  assert.ok(sql.includes('{minutes:UInt32}'));
  assert.deepStrictEqual(params, { minutes: '90' });
});

test('distinctToolsQuery lists distinct tool names for the dropdown', () => {
  const { sql, params } = distinctToolsQuery();
  assert.ok(sql.includes('DISTINCT'));
  assert.ok(sql.includes("startsWith(SpanName, 'claude_code.tool:')"));
  assert.deepStrictEqual(params, {});
});

test('distinctToolsQuery adds the date range filter when given', () => {
  const { sql, params } = distinctToolsQuery(7);
  assert.ok(sql.includes('{minutes:UInt32}'));
  assert.deepStrictEqual(params, { minutes: '7' });
});

test('distinctToolsQuery adds the project filter when given', () => {
  const { sql, params } = distinctToolsQuery(undefined, 'my-repo');
  assert.ok(sql.includes("ResourceAttributes['project.name']"));
  assert.deepStrictEqual(params, { project: 'my-repo' });
});

test('distinctSkillsQuery lists distinct skill names for the dropdown', () => {
  const { sql, params } = distinctSkillsQuery();
  assert.ok(sql.includes('DISTINCT'));
  assert.ok(sql.includes("startsWith(SpanName, 'claude_code.skill:')"));
  assert.deepStrictEqual(params, {});
});

test('distinctSkillsQuery adds the project filter when given', () => {
  const { sql, params } = distinctSkillsQuery(undefined, 'my-repo');
  assert.ok(sql.includes("ResourceAttributes['project.name']"));
  assert.deepStrictEqual(params, { project: 'my-repo' });
});

test('distinctProjectsQuery lists distinct non-empty project names for the dropdown', () => {
  const { sql, params } = distinctProjectsQuery();
  assert.ok(sql.includes('DISTINCT'));
  assert.ok(sql.includes("ResourceAttributes['project.name']"));
  assert.ok(sql.includes("ResourceAttributes['project.name'] != ''"));
  assert.deepStrictEqual(params, {});
});

test('distinctProjectsQuery adds the date range filter when given', () => {
  const { sql, params } = distinctProjectsQuery(7);
  assert.ok(sql.includes('{minutes:UInt32}'));
  assert.deepStrictEqual(params, { minutes: '7' });
});

test('toolCallsBySkillQuery joins skill and tool spans on TraceId', () => {
  const { sql, params } = toolCallsBySkillQuery();
  assert.ok(sql.includes('INNER JOIN'));
  assert.ok(sql.includes('ON s.TraceId = t.TraceId'));
  assert.deepStrictEqual(params, {});
});

test('toolCallsBySkillQuery adds the date range filter to both subqueries', () => {
  const { sql, params } = toolCallsBySkillQuery(7);
  const occurrences = sql.split('{minutes:UInt32}').length - 1;
  assert.equal(occurrences, 2);
  assert.deepStrictEqual(params, { minutes: '7' });
});

test('toolCallsBySkillQuery adds the project filter to both subqueries', () => {
  const { sql, params } = toolCallsBySkillQuery(undefined, 'my-repo');
  const occurrences = sql.split('{project:String}').length - 1;
  assert.equal(occurrences, 2);
  assert.deepStrictEqual(params, { project: 'my-repo' });
});

test('toolCallsBySkillQuery adds the skill filter to the skill subquery only', () => {
  const { sql, params } = toolCallsBySkillQuery(undefined, undefined, 'my-skill');
  const occurrences = sql.split('{skillName:String}').length - 1;
  assert.equal(occurrences, 1);
  assert.deepStrictEqual(params, { skillName: 'my-skill' });
});

test('toolCallsBySkillQuery adds the session type filter, qualified to the skill subquery TraceId', () => {
  const { sql, params } = toolCallsBySkillQuery(undefined, undefined, undefined, 'interactive');
  assert.ok(sql.includes('ON session_join.TraceId = s.TraceId'));
  assert.deepStrictEqual(params, { sessionType: 'interactive' });
});

test('toolErrorCountsQuery joins tool.execution error spans back to their parent tool span', () => {
  const { sql, params } = toolErrorCountsQuery();
  assert.ok(sql.includes("e.SpanName = 'claude_code.tool.execution'"));
  assert.ok(sql.includes("e.SpanAttributes['success'] = 'false'"));
  assert.ok(sql.includes('ON e.ParentSpanId = t.SpanId AND e.TraceId = t.TraceId'));
  assert.ok(sql.includes("startsWith(t.SpanName, 'claude_code.tool:')"));
  assert.deepStrictEqual(params, {});
});

test('toolErrorCountsQuery adds the tool filter when given', () => {
  const { sql, params } = toolErrorCountsQuery('Bash');
  assert.ok(sql.includes('{toolName:String}'));
  assert.deepStrictEqual(params, { toolName: 'Bash' });
});

test('toolErrorCountsQuery adds the date range and project filters when given', () => {
  const { sql, params } = toolErrorCountsQuery(undefined, 7, 'my-repo');
  assert.ok(sql.includes('{minutes:UInt32}'));
  assert.ok(sql.includes("t.ResourceAttributes['project.name']"));
  assert.deepStrictEqual(params, { minutes: '7', project: 'my-repo' });
});

test('toolErrorCountsQuery adds the session type filter, qualified to the tool span TraceId', () => {
  const { sql, params } = toolErrorCountsQuery(undefined, undefined, undefined, 'one-shot');
  assert.ok(sql.includes('ON session_join.TraceId = t.TraceId'));
  assert.deepStrictEqual(params, { sessionType: 'one-shot' });
});

test('toolErrorListQuery returns the raw error message per occurrence, newest first', () => {
  const { sql, params } = toolErrorListQuery();
  assert.ok(sql.includes("e.SpanAttributes['error'] AS error"));
  assert.ok(sql.includes('ORDER BY timestamp DESC'));
  assert.deepStrictEqual(params, {});
});

test('skillErrorCountsQuery attributes tool.execution errors to skills via same-trace co-occurrence', () => {
  const { sql, params } = skillErrorCountsQuery();
  assert.ok(sql.includes("startsWith(SpanName, 'claude_code.skill:')"));
  assert.ok(sql.includes('ON s.TraceId = errors.TraceId'));
  assert.deepStrictEqual(params, {});
});

test('skillErrorCountsQuery adds the skill filter when given', () => {
  const { sql, params } = skillErrorCountsQuery('superpowers:brainstorming');
  assert.ok(sql.includes('{skillName:String}'));
  assert.deepStrictEqual(params, { skillName: 'superpowers:brainstorming' });
});

test('skillErrorListQuery returns tool, error, and timestamp per skill-attributed error', () => {
  const { sql, params } = skillErrorListQuery();
  assert.ok(sql.includes('errors.tool AS tool'));
  assert.ok(sql.includes('errors.error AS error'));
  assert.ok(sql.includes('ORDER BY errors.timestamp DESC'));
  assert.deepStrictEqual(params, {});
});

test('promptListQuery scopes to interaction spans and computes session_type via a joined interaction-count aggregation', () => {
  const { sql, params } = promptListQuery();
  assert.ok(sql.includes("i.SpanName = 'claude_code.interaction'"));
  assert.ok(sql.includes("SpanName = 'claude_code.interaction'"));
  assert.ok(sql.includes('session_type'));
  assert.deepStrictEqual(params, {});
});

test('promptListQuery adds the date range filter when given', () => {
  const { sql, params } = promptListQuery(7);
  assert.ok(sql.includes('{minutes:UInt32}'));
  assert.deepStrictEqual(params, { minutes: '7' });
});

test('promptListQuery qualifies the date range filter to avoid an ambiguous Timestamp column', () => {
  const { sql } = promptListQuery(7);
  assert.ok(sql.includes('AND i.Timestamp >= now()'));
});

test('promptListQuery adds the session type filter when given', () => {
  const { sql, params } = promptListQuery(undefined, 'one-shot');
  assert.ok(sql.includes('{sessionType:String}'));
  assert.deepStrictEqual(params, { sessionType: 'one-shot' });
});

test('promptListQuery adds the project filter, qualified to the interaction span table', () => {
  const { sql, params } = promptListQuery(undefined, undefined, 'my-repo');
  assert.ok(sql.includes("AND i.ResourceAttributes['project.name'] = {project:String}"));
  assert.deepStrictEqual(params, { project: 'my-repo' });
});

test('promptListQuery restricts to prompts with a direct child tool span matching the given tool', () => {
  const { sql, params } = promptListQuery(undefined, undefined, undefined, 'Bash');
  assert.ok(sql.includes('EXISTS'));
  assert.ok(sql.includes('t.ParentSpanId = i.SpanId'));
  assert.ok(sql.includes("t.SpanAttributes['tool_name'] = {invocationName:String}"));
  assert.deepStrictEqual(params, { invocationName: 'Bash' });
});

test('promptListQuery restricts to prompts with a direct child skill span matching the given skill', () => {
  const { sql, params } = promptListQuery(undefined, undefined, undefined, undefined, 'superpowers:brainstorming');
  assert.ok(sql.includes("t.SpanAttributes['skill_name'] = {invocationName:String}"));
  assert.deepStrictEqual(params, { invocationName: 'superpowers:brainstorming' });
});

test('promptListQuery orders newest prompt first', () => {
  const { sql } = promptListQuery();
  assert.ok(sql.includes('ORDER BY timestamp DESC'));
});

test('topTokenConsumingPromptsQuery sums all four token attributes from child llm_request spans', () => {
  const { sql, params } = topTokenConsumingPromptsQuery();
  assert.ok(sql.includes("l.ParentSpanId = i.SpanId"));
  assert.ok(sql.includes("l.SpanName = 'claude_code.llm_request'"));
  assert.ok(sql.includes("input_tokens"));
  assert.ok(sql.includes("output_tokens"));
  assert.ok(sql.includes("cache_creation_tokens"));
  assert.ok(sql.includes("cache_read_tokens"));
  assert.ok(sql.includes('ORDER BY total_tokens DESC'));
  assert.deepStrictEqual(params, {});
});

test('topTokenConsumingPromptsQuery caps the ranked pool at 25 rows for the 5-per-page UI', () => {
  const { sql } = topTokenConsumingPromptsQuery();
  assert.ok(sql.includes('LIMIT 25'));
});

test('topTokenConsumingPromptsQuery adds the date range and project filters when given', () => {
  const { sql, params } = topTokenConsumingPromptsQuery(7, 'my-repo');
  assert.ok(sql.includes('{minutes:UInt32}'));
  assert.ok(sql.includes("i.ResourceAttributes['project.name']"));
  assert.deepStrictEqual(params, { minutes: '7', project: 'my-repo' });
});

test('topTokenConsumingPromptsQuery adds the session type filter, qualified to the interaction TraceId', () => {
  const { sql, params } = topTokenConsumingPromptsQuery(undefined, undefined, 'interactive');
  assert.ok(sql.includes('ON session_join.TraceId = i.TraceId'));
  assert.deepStrictEqual(params, { sessionType: 'interactive' });
});

test('highestLatencyInvocationsQuery ranks tool and skill spans together by duration', () => {
  const { sql, params } = highestLatencyInvocationsQuery();
  assert.ok(sql.includes("startsWith(SpanName, 'claude_code.tool:')"));
  assert.ok(sql.includes("startsWith(SpanName, 'claude_code.skill:')"));
  assert.ok(sql.includes("'skill', 'tool'"));
  assert.ok(sql.includes('ORDER BY duration_ms DESC'));
  assert.deepStrictEqual(params, {});
});

test('highestLatencyInvocationsQuery adds the date range and project filters when given', () => {
  const { sql, params } = highestLatencyInvocationsQuery(7, 'my-repo');
  assert.ok(sql.includes('{minutes:UInt32}'));
  assert.deepStrictEqual(params, { minutes: '7', project: 'my-repo' });
});

test('traceSpansQuery scopes to a single trace and exposes tool/skill name generically', () => {
  const { sql, params } = traceSpansQuery('abc123');
  assert.ok(sql.includes('WHERE TraceId = {traceId:String}'));
  assert.ok(sql.includes('ParentSpanId AS parent_span_id'));
  assert.ok(sql.includes('ORDER BY Timestamp'));
  assert.deepStrictEqual(params, { traceId: 'abc123' });
});

test('traceSpansQuery prefers skill_name over tool_name for skill spans', () => {
  // Claude Code models a skill invocation as a "Skill"-named tool call under
  // the hood, so a claude_code.skill:* span has BOTH tool_name='Skill' and
  // skill_name='the real name' set — picking whichever attribute is merely
  // non-empty would surface the useless generic "Skill" label instead.
  const { sql } = traceSpansQuery('abc123');
  assert.ok(sql.includes("startsWith(SpanName, 'claude_code.skill:')"));
  const skillBranchIndex = sql.indexOf("startsWith(SpanName, 'claude_code.skill:')");
  const nextFewLines = sql.slice(skillBranchIndex, skillBranchIndex + 120);
  assert.ok(nextFewLines.includes("SpanAttributes['skill_name']"));
});

test('traceSpansQuery surfaces gen_ai.request.model as name for llm_request spans', () => {
  const { sql } = traceSpansQuery('abc123');
  assert.ok(sql.includes("SpanName = 'claude_code.llm_request'"));
  const llmBranchIndex = sql.indexOf("SpanName = 'claude_code.llm_request'");
  const nextFewLines = sql.slice(llmBranchIndex, llmBranchIndex + 120);
  assert.ok(nextFewLines.includes("SpanAttributes['gen_ai.request.model']"));
});

test('traceSpansQuery excludes blocked_on_user spans that were not resolved by an actual user prompt', () => {
  // Claude Code emits claude_code.tool.blocked_on_user for every permission
  // gate check, including near-instant auto-approvals (source='config') and
  // other non-interactive resolutions (source='unknown') — only a source
  // starting with 'user_' means a human was actually shown a prompt.
  const { sql } = traceSpansQuery('abc123');
  assert.ok(sql.includes("SpanName = 'claude_code.tool.blocked_on_user'"));
  assert.ok(sql.includes("NOT startsWith(SpanAttributes['source'], 'user_')"));
});
