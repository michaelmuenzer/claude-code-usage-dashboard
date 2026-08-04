import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toolFilterCondition,
  skillFilterCondition,
  dateRangeCondition,
  sessionTypeFilterCondition,
  sessionTypeJoinCondition,
  projectFilterCondition,
} from './filters.js';

test('toolFilterCondition with no tool returns empty clause', () => {
  const result = toolFilterCondition(undefined);
  assert.equal(result.clause, '');
  assert.deepStrictEqual(result.params, {});
});

test('toolFilterCondition with a tool returns a scoped clause', () => {
  const result = toolFilterCondition('Bash');
  assert.ok(result.clause.includes("SpanAttributes['tool_name']"));
  assert.ok(result.clause.includes('{toolName:String}'));
  assert.deepStrictEqual(result.params, { toolName: 'Bash' });
});

test('toolFilterCondition with a single-element array behaves like a single string', () => {
  const result = toolFilterCondition(['Bash']);
  assert.ok(result.clause.includes('{toolName:String}'));
  assert.deepStrictEqual(result.params, { toolName: 'Bash' });
});

test('toolFilterCondition with multiple tools returns an IN clause', () => {
  const result = toolFilterCondition(['Bash', 'Read']);
  assert.ok(result.clause.includes('IN {toolNames:Array(String)}'));
  assert.deepStrictEqual(result.params, { toolNames: ['Bash', 'Read'] });
});

test('toolFilterCondition with an explicit empty array matches nothing', () => {
  const result = toolFilterCondition([]);
  assert.equal(result.clause, 'AND 1 = 0');
  assert.deepStrictEqual(result.params, {});
});

test('skillFilterCondition with a skill returns a scoped clause', () => {
  const result = skillFilterCondition('superpowers:brainstorming');
  assert.ok(result.clause.includes("SpanAttributes['skill_name']"));
  assert.ok(result.clause.includes('{skillName:String}'));
  assert.deepStrictEqual(result.params, { skillName: 'superpowers:brainstorming' });
});

test('dateRangeCondition with no minutes returns empty clause', () => {
  const result = dateRangeCondition(undefined);
  assert.equal(result.clause, '');
  assert.deepStrictEqual(result.params, {});
});

test('dateRangeCondition with minutes returns a scoped clause on Timestamp', () => {
  const result = dateRangeCondition(7);
  assert.ok(result.clause.includes('Timestamp >='));
  assert.ok(result.clause.includes('{minutes:UInt32}'));
  assert.ok(result.clause.includes('INTERVAL'));
  assert.deepStrictEqual(result.params, { minutes: '7' });
});

test('dateRangeCondition accepts a column prefix to avoid ambiguity in joined queries', () => {
  const result = dateRangeCondition(7, 'i.Timestamp');
  assert.ok(result.clause.includes('AND i.Timestamp >='));
});

test('dateRangeCondition with an absolute start/end returns a scoped clause on Timestamp', () => {
  const result = dateRangeCondition({ start: '2026-01-01T00:00:00.000Z', end: '2026-01-02T00:00:00.000Z' });
  assert.ok(result.clause.includes('Timestamp >= {rangeStart:DateTime}'));
  assert.ok(result.clause.includes('Timestamp <= {rangeEnd:DateTime}'));
  assert.deepStrictEqual(result.params, { rangeStart: '2026-01-01 00:00:00', rangeEnd: '2026-01-02 00:00:00' });
});

test('dateRangeCondition with an absolute start/end accepts a column prefix', () => {
  const result = dateRangeCondition({ start: '2026-01-01T00:00:00.000Z', end: '2026-01-02T00:00:00.000Z' }, 'i.Timestamp');
  assert.ok(result.clause.includes('AND i.Timestamp >= {rangeStart:DateTime}'));
  assert.ok(result.clause.includes('AND i.Timestamp <= {rangeEnd:DateTime}'));
});

test('sessionTypeFilterCondition with no session type returns empty clause', () => {
  const result = sessionTypeFilterCondition(undefined);
  assert.equal(result.clause, '');
  assert.deepStrictEqual(result.params, {});
});

test('sessionTypeFilterCondition with a session type returns a scoped clause', () => {
  const result = sessionTypeFilterCondition('interactive');
  assert.ok(result.clause.includes('session_type'));
  assert.ok(result.clause.includes('{sessionType:String}'));
  assert.deepStrictEqual(result.params, { sessionType: 'interactive' });
});

test('sessionTypeJoinCondition with no session type returns empty join and where clauses', () => {
  const result = sessionTypeJoinCondition(undefined);
  assert.equal(result.joinClause, '');
  assert.equal(result.whereClause, '');
  assert.deepStrictEqual(result.params, {});
});

test('sessionTypeJoinCondition with an invalid session type returns empty clauses', () => {
  const result = sessionTypeJoinCondition('bogus');
  assert.equal(result.joinClause, '');
  assert.equal(result.whereClause, '');
  assert.deepStrictEqual(result.params, {});
});

test('sessionTypeJoinCondition with a session type joins the per-trace interaction count', () => {
  const result = sessionTypeJoinCondition('interactive');
  assert.ok(result.joinClause.includes('LEFT JOIN'));
  assert.ok(result.joinClause.includes("SpanName = 'claude_code.interaction'"));
  assert.ok(result.joinClause.includes('ON session_join.TraceId = TraceId'));
  assert.ok(result.whereClause.includes("if(session_join.interaction_count > 1, 'interactive', 'one-shot')"));
  assert.deepStrictEqual(result.params, { sessionType: 'interactive' });
});

test('sessionTypeJoinCondition accepts a TraceId column override to avoid ambiguity in joined queries', () => {
  const result = sessionTypeJoinCondition('one-shot', 's.TraceId');
  assert.ok(result.joinClause.includes('ON session_join.TraceId = s.TraceId'));
});

test('projectFilterCondition with no project returns empty clause', () => {
  const result = projectFilterCondition(undefined);
  assert.equal(result.clause, '');
  assert.deepStrictEqual(result.params, {});
});

test('projectFilterCondition with a project returns a scoped clause', () => {
  const result = projectFilterCondition('my-repo');
  assert.ok(result.clause.includes("ResourceAttributes['project.name']"));
  assert.ok(result.clause.includes('{project:String}'));
  assert.deepStrictEqual(result.params, { project: 'my-repo' });
});

test('projectFilterCondition accepts a column override to avoid ambiguity in joined queries', () => {
  const result = projectFilterCondition('my-repo', "i.ResourceAttributes['project.name']");
  assert.ok(result.clause.includes("AND i.ResourceAttributes['project.name'] ="));
});
