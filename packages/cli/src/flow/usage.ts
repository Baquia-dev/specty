// SPDX-License-Identifier: Apache-2.0
// What a change consumed (formats.md §4, `change.usage`). ccusage reads the agents' logs: Specty
// asks it for the sessions the change's audit names and keeps the calls made since its creation.
// Specty installs nothing: it runs the ccusage of the change's `node_modules/.bin`, or the PATH's.
import { join } from "node:path";
import {
  type ChangeUsage,
  changeUsage,
  freshSessionLine,
  type ModelCost,
  modelPrices,
  type Output,
  section,
  type TokenPrices,
  type UsageEntry,
  usageLine,
} from "@baquia-dev/specty-core";
import { sessionContext } from "../agents/run";
import { execute } from "../io/exec";
import { exists, isRecord, parseJson } from "../io/files";
import type { Session } from "../session";
import { appendAudit, type StoredChange } from "../store/changes";
import { auditEntry } from "./active";
import { type Audit, readAudit } from "./carried";

/** ccusage's source for each agent whose audit lines name their session. */
const SOURCES: ReadonlyMap<unknown, string> = new Map([["claude-code", "claude"]]);
/** The logs are local: a minute is plenty for each report. */
const TIMEOUT_MS = 60_000;
/**
 * Beyond this context, a fresh session pays off: every step of the next change would read the
 * earlier ones again. Measured in this repository, half of the cost (ARCHITECTURE §13).
 */
const FRESH_SESSION = 150_000;

type Tokens = Omit<UsageEntry, "timestamp" | "model">;
/** A session of ccusage's report: its id, its project and what each model cost in it. */
interface SessionCost {
  readonly id: string;
  readonly project: string;
  readonly models: readonly ModelCost[];
}

/**
 * Measures the change's consumption and records it in its audit, before it is archived, and
 * looks at the context the agent's session carries: the closing's lines, the consumption when
 * ccusage answers for a session the audit names, and the advice of a fresh session when it is big.
 */
export async function measureUsage(
  session: Session,
  change: StoredChange,
): Promise<readonly string[]> {
  const audit = await readAudit(change.files);
  const usage = await usageOf(session, audit);
  if (usage !== undefined) {
    const entry = await auditEntry(session, "specty", "change.usage", { ...usage });
    await appendAudit(change.files, entry);
  }
  const context = await agentContext(session, audit);
  return [
    ...(usage === undefined ? [] : [usageLine(usage, session.lang)]),
    ...(context !== undefined && context > FRESH_SESSION
      ? [freshSessionLine(context, session.lang)]
      : []),
  ];
}

/** The context of the last Claude Code session the audit names: the one the next change gets. */
async function agentContext(session: Session, audit: Audit): Promise<number | undefined> {
  const last = audit.findLast(
    (line) => line.tool === "claude-code" && typeof line.session === "string",
  );
  return typeof last?.session === "string"
    ? sessionContext(last.session, session.environment.env)
    : undefined;
}

/** The closing card, with the consumption's line after what it says. */
export function withUsage(card: Output, lines: readonly string[]): Output {
  if (lines.length === 0) return card;
  return { ...card, blocks: [...card.blocks, ...section(undefined, lines)] };
}

async function usageOf(session: Session, audit: Audit): Promise<ChangeUsage | undefined> {
  const since = audit.find((line) => line.event === "change.created")?.ts;
  const sessions = namedSessions(audit);
  if (typeof since !== "string" || sessions.size === 0) return undefined;
  const rows: SessionCost[] = [];
  for (const source of new Set(sessions.values())) {
    const sessionReport = await report(session, [source, "session", "--json", "--offline"]);
    if (sessionReport === undefined) return undefined;
    rows.push(...sessionCosts(sessionReport));
  }
  const entries: UsageEntry[] = [];
  for (const [id, source] of sessions) {
    const calls = await report(session, [source, "session", "--id", id, "--json", "--offline"]);
    if (calls === undefined) return undefined;
    entries.push(...usageEntries(calls));
  }
  return changeUsage(entries, since, pricesFor(rows, sessions));
}

/**
 * Each model's prices: from the sessions of the change's own projects, when they have enough of
 * them, and from every session otherwise. Other projects may run otherwise (an evaluation without
 * an interface writes its cache at another price, which the report does not tell apart).
 */
function pricesFor(
  rows: readonly SessionCost[],
  named: ReadonlyMap<string, string>,
): ReadonlyMap<string, TokenPrices> {
  const projects = new Set(rows.flatMap((row) => (named.has(row.id) ? [row.project] : [])));
  const own = rows.filter((row) => projects.has(row.project));
  const costs = (of: readonly SessionCost[]) => of.flatMap((row) => row.models);
  return new Map([...modelPrices(costs(rows)), ...modelPrices(costs(own))]);
}

/** The sessions the audit's lines name, each with its agent's ccusage source. */
function namedSessions(audit: Audit): ReadonlyMap<string, string> {
  const sessions = new Map<string, string>();
  for (const line of audit) {
    const source = SOURCES.get(line.tool);
    if (source !== undefined && typeof line.session === "string")
      sessions.set(line.session, source);
  }
  return sessions;
}

/** ccusage's JSON for `args`; undefined when it is not there, fails or answers something else. */
async function report(session: Session, args: readonly string[]): Promise<unknown> {
  const local = join(session.root, "node_modules", ".bin", "ccusage");
  const result = await execute((await exists(local)) ? local : "ccusage", args, {
    cwd: session.root,
    env: session.environment.env,
    timeoutMs: TIMEOUT_MS,
    whole: true,
  });
  return result.code === 0 ? parseJson(result.stdout) : undefined;
}

/** Every session of ccusage's session report, with its `modelBreakdowns`. */
function sessionCosts(report: unknown): SessionCost[] {
  const sessions = isRecord(report) && Array.isArray(report.sessions) ? report.sessions : [];
  return sessions.flatMap((row) =>
    isRecord(row) && Array.isArray(row.modelBreakdowns)
      ? [
          {
            id: typeof row.sessionId === "string" ? row.sessionId : "",
            project: typeof row.projectPath === "string" ? row.projectPath : "",
            models: row.modelBreakdowns.flatMap(modelCost),
          },
        ]
      : [],
  );
}

function modelCost(value: unknown): ModelCost[] {
  if (!isRecord(value) || typeof value.modelName !== "string" || !isCount(value.cost)) return [];
  const tokens = tokensOf(value);
  return tokens === undefined ? [] : [{ modelName: value.modelName, ...tokens, cost: value.cost }];
}

/** The calls of ccusage's report of one session. */
function usageEntries(report: unknown): UsageEntry[] {
  const entries = isRecord(report) && Array.isArray(report.entries) ? report.entries : [];
  return entries.flatMap((value) => {
    if (!isRecord(value) || typeof value.timestamp !== "string" || typeof value.model !== "string")
      return [];
    const tokens = tokensOf(value);
    return tokens === undefined
      ? []
      : [{ timestamp: value.timestamp, model: value.model, ...tokens }];
  });
}

function tokensOf(value: Readonly<Record<string, unknown>>): Tokens | undefined {
  const { inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens } = value;
  return isCount(inputTokens) &&
    isCount(outputTokens) &&
    isCount(cacheCreationTokens) &&
    isCount(cacheReadTokens)
    ? { inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens }
    : undefined;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
