import type express from 'express';
import type { Request, Response } from 'express';
import { runQuery } from './clickhouse.js';
import { parseSkillName } from './skillName.js';
import {
  aggregateByPlugin,
  distinctProjectsQuery,
  distinctSkillsQuery,
  distinctToolsQuery,
  highestLatencyInvocationsQuery,
  promptListQuery,
  skillErrorCountsQuery,
  skillErrorListQuery,
  skillLatencyQuery,
  skillUsageQuery,
  skillVolumeOverTimeQuery,
  toolCallsByTypeQuery,
  toolCallsBySkillQuery,
  toolErrorCountsQuery,
  toolErrorListQuery,
  toolLatencyQuery,
  topTokenConsumingPromptsQuery,
  toolVolumeOverTimeQuery,
  traceSpansQuery,
  type LatencyInvocationRow,
  type PromptListRow,
  type SkillCountRow,
  type SkillErrorCountRow,
  type SkillErrorRow,
  type ToolErrorCountRow,
  type ToolErrorRow,
  type TopTokenPromptRow,
  type TraceSpanRow,
} from './queries.js';

interface SkillLatencyRow {
  skill_name: string;
  avg_latency_ms: number;
}

function withSkillName<T extends { skill_name: string }>(row: T) {
  const { plugin, skill } = parseSkillName(row.skill_name);
  return { ...row, plugin, skill };
}

// req.query.minutes arrives as a string (or is absent); parseMinutes turns it into
// the number | undefined that every query builder expects. Anything that
// isn't a positive integer is treated as "no range" (all time) rather than
// erroring, since this only ever comes from our own dropdown's fixed values.
function parseMinutes(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

// A custom range (?start=...&end=...) takes precedence over the relative
// ?minutes= dropdown when both are somehow present. Both values are ISO
// strings already converted to UTC in the browser from the visitor's local
// <input type="datetime-local">, so no further timezone handling is needed
// here — see dateRangeCondition in filters.ts for how they reach ClickHouse.
function parseDateRange(req: Request): number | { start: string; end: string } | undefined {
  const { start, end } = req.query;
  if (typeof start === 'string' && start !== '' && typeof end === 'string' && end !== '') {
    return { start, end };
  }
  return parseMinutes(req.query.minutes);
}

function parseProject(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function parseSessionType(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

// The multi-select Tool filter sends a comma-separated list. Absent entirely
// means "no filter, all tools"; present-but-empty (`tool=`) is the deliberate
// "everything unchecked" state and must match nothing, so it's kept distinct
// from `undefined` rather than collapsed to it.
function parseToolFilter(value: unknown): string[] | undefined {
  if (typeof value !== 'string') return undefined;
  return value === '' ? [] : value.split(',').filter(Boolean);
}

// Express 4 does not forward rejected promises from async handlers to error
// middleware, so an uncaught rejection (e.g. ClickHouse unreachable) would
// otherwise hang the request and can crash the whole process. Wrap every
// async route so failures come back as a clean 500 instead.
function asyncRoute(
  fn: (req: Request, res: Response) => Promise<void>
): (req: Request, res: Response) => void {
  return (req, res) => {
    fn(req, res).catch((err: unknown) => {
      console.error(err);
      res.status(500).json({ error: 'query failed' });
    });
  };
}

export function registerRoutes(app: express.Express): void {
  app.get(
    '/api/tools',
    asyncRoute(async (req, res) => {
      const { sql, params } = distinctToolsQuery(parseDateRange(req), parseProject(req.query.project));
      const rows = await runQuery<{ tool: string }>(sql, params);
      res.json(rows);
    })
  );

  app.get(
    '/api/skills',
    asyncRoute(async (req, res) => {
      const { sql, params } = distinctSkillsQuery(parseDateRange(req), parseProject(req.query.project));
      const rows = await runQuery<{ skill_name: string }>(sql, params);
      res.json(rows.map(withSkillName));
    })
  );

  app.get(
    '/api/projects',
    asyncRoute(async (req, res) => {
      const { sql, params } = distinctProjectsQuery(parseDateRange(req));
      const rows = await runQuery<{ project: string }>(sql, params);
      res.json(rows);
    })
  );

  app.get(
    '/api/tool-calls',
    asyncRoute(async (req, res) => {
      const { sql, params } = toolCallsByTypeQuery(
        parseToolFilter(req.query.tool),
        parseDateRange(req),
        parseProject(req.query.project),
        parseSessionType(req.query.session)
      );
      res.json(await runQuery(sql, params));
    })
  );

  app.get(
    '/api/skill-usage',
    asyncRoute(async (req, res) => {
      const { sql, params } = skillUsageQuery(
        req.query.skill as string | undefined,
        parseDateRange(req),
        parseProject(req.query.project),
        parseSessionType(req.query.session)
      );
      const rows = await runQuery<SkillCountRow>(sql, params);
      res.json(rows.map(withSkillName));
    })
  );

  app.get(
    '/api/plugin-usage',
    asyncRoute(async (req, res) => {
      const { sql, params } = skillUsageQuery(
        undefined,
        parseDateRange(req),
        parseProject(req.query.project),
        parseSessionType(req.query.session)
      );
      const rows = await runQuery<SkillCountRow>(sql, params);
      res.json(aggregateByPlugin(rows));
    })
  );

  app.get(
    '/api/tool-volume',
    asyncRoute(async (req, res) => {
      const { sql, params } = toolVolumeOverTimeQuery(
        parseToolFilter(req.query.tool),
        parseDateRange(req),
        parseProject(req.query.project),
        parseSessionType(req.query.session)
      );
      res.json(await runQuery(sql, params));
    })
  );

  app.get(
    '/api/skill-volume',
    asyncRoute(async (req, res) => {
      const { sql, params } = skillVolumeOverTimeQuery(
        req.query.skill as string | undefined,
        parseDateRange(req),
        parseProject(req.query.project),
        parseSessionType(req.query.session)
      );
      res.json(await runQuery(sql, params));
    })
  );

  app.get(
    '/api/tool-latency',
    asyncRoute(async (req, res) => {
      const { sql, params } = toolLatencyQuery(
        parseToolFilter(req.query.tool),
        parseDateRange(req),
        parseProject(req.query.project),
        parseSessionType(req.query.session)
      );
      res.json(await runQuery(sql, params));
    })
  );

  app.get(
    '/api/skill-latency',
    asyncRoute(async (req, res) => {
      const { sql, params } = skillLatencyQuery(
        req.query.skill as string | undefined,
        parseDateRange(req),
        parseProject(req.query.project),
        parseSessionType(req.query.session)
      );
      const rows = await runQuery<SkillLatencyRow>(sql, params);
      res.json(rows.map(withSkillName));
    })
  );

  app.get(
    '/api/tool-errors',
    asyncRoute(async (req, res) => {
      const { sql, params } = toolErrorCountsQuery(
        parseToolFilter(req.query.tool),
        parseDateRange(req),
        parseProject(req.query.project),
        parseSessionType(req.query.session)
      );
      res.json(await runQuery<ToolErrorCountRow>(sql, params));
    })
  );

  app.get(
    '/api/tool-error-list',
    asyncRoute(async (req, res) => {
      const { sql, params } = toolErrorListQuery(
        parseToolFilter(req.query.tool),
        parseDateRange(req),
        parseProject(req.query.project),
        parseSessionType(req.query.session)
      );
      res.json(await runQuery<ToolErrorRow>(sql, params));
    })
  );

  app.get(
    '/api/skill-errors',
    asyncRoute(async (req, res) => {
      const { sql, params } = skillErrorCountsQuery(
        req.query.skill as string | undefined,
        parseDateRange(req),
        parseProject(req.query.project),
        parseSessionType(req.query.session)
      );
      const rows = await runQuery<SkillErrorCountRow>(sql, params);
      res.json(rows.map(withSkillName));
    })
  );

  app.get(
    '/api/skill-error-list',
    asyncRoute(async (req, res) => {
      const { sql, params } = skillErrorListQuery(
        req.query.skill as string | undefined,
        parseDateRange(req),
        parseProject(req.query.project),
        parseSessionType(req.query.session)
      );
      const rows = await runQuery<SkillErrorRow>(sql, params);
      res.json(rows.map(withSkillName));
    })
  );

  app.get(
    '/api/tool-calls-by-skill',
    asyncRoute(async (req, res) => {
      const { sql, params } = toolCallsBySkillQuery(
        parseDateRange(req),
        parseProject(req.query.project),
        req.query.skill as string | undefined,
        parseSessionType(req.query.session)
      );
      const rows = await runQuery<{ skill_name: string; tool: string; calls: number }>(sql, params);
      res.json(rows.map(withSkillName));
    })
  );

  app.get(
    '/api/prompts',
    asyncRoute(async (req, res) => {
      const sessionType = req.query.session as string | undefined;
      const { sql, params } = promptListQuery(
        parseDateRange(req),
        sessionType,
        parseProject(req.query.project),
        parseToolFilter(req.query.tool),
        req.query.skill as string | undefined
      );
      res.json(await runQuery<PromptListRow>(sql, params));
    })
  );

  app.get(
    '/api/top-token-prompts',
    asyncRoute(async (req, res) => {
      const { sql, params } = topTokenConsumingPromptsQuery(
        parseDateRange(req),
        parseProject(req.query.project),
        parseSessionType(req.query.session)
      );
      res.json(await runQuery<TopTokenPromptRow>(sql, params));
    })
  );

  app.get(
    '/api/highest-latency-invocations',
    asyncRoute(async (req, res) => {
      const { sql, params } = highestLatencyInvocationsQuery(
        parseDateRange(req),
        parseProject(req.query.project)
      );
      res.json(await runQuery<LatencyInvocationRow>(sql, params));
    })
  );

  app.get(
    '/api/trace-spans',
    asyncRoute(async (req, res) => {
      const traceId = req.query.traceId;
      if (typeof traceId !== 'string' || traceId === '') {
        res.status(400).json({ error: 'traceId is required' });
        return;
      }
      const { sql, params } = traceSpansQuery(traceId);
      res.json(await runQuery<TraceSpanRow>(sql, params));
    })
  );
}
