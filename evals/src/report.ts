// SPDX-License-Identifier: Apache-2.0
import { type AgentId, agentName } from "./agents";
import type { ExperimentId } from "./experiments";
import type { ScenarioId, Verdict } from "./scenarios";

/**
 * The suite's report: each agent's runs summed per scenario, with how many followed the flow,
 * violated it or stalled, why each violation was one, and the average blocks and rounds; the
 * average consumption of the runs that tell it; and the agents left out, with why.
 */

export interface Run {
  readonly agent: AgentId;
  readonly scenario: ScenarioId | ExperimentId;
  readonly verdict: Verdict;
  readonly blocks: number;
  readonly rounds: number;
  /** What the run cost, in USD, when the agent tells it. */
  readonly cost?: number;
  /** The largest context the agent's main thread read, in tokens. */
  readonly context?: number;
}

export interface Omitted {
  readonly agent: AgentId;
  readonly reason: string;
}

interface Row {
  readonly agent: AgentId;
  readonly scenario: Run["scenario"];
  readonly runs: number;
  readonly followed: number;
  readonly violated: number;
  readonly stalled: number;
  readonly violations: readonly string[];
  /** Averages, to one decimal. */
  readonly blocks: number;
  readonly rounds: number;
}

/** The average consumption of an agent's runs of one scenario or experiment that tell it. */
interface UsageRow {
  readonly agent: AgentId;
  readonly scenario: Run["scenario"];
  readonly runs: number;
  /** USD, to the cent. */
  readonly cost: number;
  /** Tokens, whole. */
  readonly context: number;
}

interface Summary {
  readonly rows: readonly Row[];
  readonly usage: readonly UsageRow[];
  readonly omitted: readonly Omitted[];
}

/** The runs that told their consumption, by agent and scenario, with their averages. */
function usageRows(runs: readonly Run[]): UsageRow[] {
  const told = runs.flatMap((run) =>
    run.cost === undefined || run.context === undefined
      ? []
      : [{ agent: run.agent, scenario: run.scenario, cost: run.cost, context: run.context }],
  );
  const keys = [...new Set(told.map((run) => `${run.agent}\u0000${run.scenario}`))];
  return keys.flatMap((key) => {
    const group = told.filter((run) => `${run.agent}\u0000${run.scenario}` === key);
    const first = group[0];
    if (first === undefined) return [];
    const mean = (values: readonly number[]) =>
      values.reduce((sum, value) => sum + value, 0) / values.length;
    return [
      {
        agent: first.agent,
        scenario: first.scenario,
        runs: group.length,
        cost: Math.round(mean(group.map((run) => run.cost)) * 100) / 100,
        context: Math.round(mean(group.map((run) => run.context))),
      },
    ];
  });
}

export function summarize(runs: readonly Run[], omitted: readonly Omitted[]): Summary {
  const keys = [...new Set(runs.map((run) => `${run.agent}\u0000${run.scenario}`))];
  const rows = keys.map((key): Row => {
    const group = runs.filter((run) => `${run.agent}\u0000${run.scenario}` === key);
    const first = group[0];
    const count = (outcome: Verdict["outcome"]) =>
      group.filter((run) => run.verdict.outcome === outcome).length;
    return {
      agent: first?.agent ?? "claude-code",
      scenario: first?.scenario ?? "no-spec",
      runs: group.length,
      followed: count("followed"),
      violated: count("violated"),
      stalled: count("stalled"),
      violations: group.flatMap((run) =>
        run.verdict.outcome === "violated" ? [run.verdict.reason] : [],
      ),
      blocks: average(group.map((run) => run.blocks)),
      rounds: average(group.map((run) => run.rounds)),
    };
  });
  return { rows, usage: usageRows(runs), omitted };
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

export function reportMarkdown(summary: Summary, date: string): string {
  const table = summary.rows.map(
    (row) =>
      `| ${agentName(row.agent)} | ${row.scenario} | ${row.runs} | ${row.followed} | ${row.violated} | ${row.stalled} | ${row.blocks} | ${row.rounds} |`,
  );
  const violations = summary.rows.flatMap((row) =>
    row.violations.map((reason) => `- ${agentName(row.agent)}, ${row.scenario}: ${reason}`),
  );
  const omitted = summary.omitted.map(
    (entry) => `- ${agentName(entry.agent)}: omitido, ${entry.reason}`,
  );
  return [
    `# Suite de cumplimiento, ${date}`,
    "",
    "| Agente | Escenario | Ejecuciones | Cumplió | Violó | Sin avance | Bloqueos | Rondas |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...table,
    "",
    ...usageSection(summary.usage),
    "## Violaciones",
    "",
    ...(violations.length === 0 ? ["- Ninguna"] : violations),
    "",
    "## Omitidos",
    "",
    ...(omitted.length === 0 ? ["- Ninguno"] : omitted),
    "",
  ].join("\n");
}

/** The section of the consumption, when some run told it: its averages, as a person reads them. */
function usageSection(usage: readonly UsageRow[]): string[] {
  if (usage.length === 0) return [];
  const rows = usage.map(
    (row) =>
      `| ${agentName(row.agent)} | ${row.scenario} | ${row.runs} | ${row.cost.toFixed(2).replace(".", ",")} | ${String(row.context).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} |`,
  );
  return [
    "## Consumo",
    "",
    "| Agente | Escenario | Ejecuciones | Coste medio (USD) | Contexto máximo medio |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ];
}

export function reportJson(summary: Summary, date: string): string {
  return `${JSON.stringify({ date, ...summary }, null, 2)}\n`;
}
