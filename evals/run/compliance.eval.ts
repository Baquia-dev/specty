// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { expect, it } from "vitest";
import { AGENTS, type Agent, consumptionOf, countsOf } from "../src/agents";
import { type Experiment, namedExperiments } from "../src/experiments";
import { DIST } from "../src/repo";
import { type Omitted, type Run, reportJson, reportMarkdown, summarize } from "../src/report";
import { SCENARIOS, type Scenario } from "../src/scenarios";

/**
 * The compliance suite with real agents (ARCHITECTURE §16), which only `pnpm evals` runs: each
 * installed agent, with the person's own session, through each scenario in a throwaway
 * repository, as many times as `SPECTY_EVALS_RUNS` says. The report goes to the system's
 * temporary folder, `specty-evals/`, in Markdown and JSON.
 */

const RUNS = Math.max(1, Number(process.env.SPECTY_EVALS_RUNS ?? "1") || 1);
/** One run's limit: an agent that goes over it is stopped and judged by what it left. */
const TIMEOUT_MS = 10 * 60 * 1000;
/** What an agent says when it has no session. */
const NO_SESSION =
  /not logged in|log ?in required|please (?:run|use) .*log ?in|not authenticated|unauthori[sz]ed|invalid api key|missing api key/i;

/** The ids a variable lists, or all of them without it. */
function chosen<T extends { readonly id: string }>(all: readonly T[], variable: string): T[] {
  const wanted = process.env[variable]?.split(",").map((id) => id.trim());
  return all.filter((each) => wanted === undefined || wanted.includes(each.id));
}

/** A folder with `specty`, which runs the bundle the repositories' hooks run. */
async function wrapper(): Promise<string> {
  const bin = await mkdtemp(join(tmpdir(), "specty-evals-bin-"));
  await writeFile(join(bin, "specty"), `#!/bin/sh\nexec node "${DIST}" "$@"\n`);
  await chmod(join(bin, "specty"), 0o755);
  return bin;
}

/** The agent's environment: the person's, with `specty` first on the PATH and no agent's marks. */
function agentEnv(bin: string): NodeJS.ProcessEnv {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !/^(?:CLAUDECODE|CLAUDE_CODE_|CURSOR_AGENT|GEMINI_CLI|CODEX_|OPENCODE|SPECTY_AGENT)/.test(
          key,
        ),
    ),
  );
  return { ...env, PATH: `${bin}${delimiter}${process.env.PATH ?? ""}` };
}

/**
 * One run of a scenario or an experiment by `agent`, or why the agent has to be left out. An
 * experiment brings its own turns and minutes; a run that tells its consumption keeps it.
 */
async function runOnce(
  agent: Agent,
  binary: string,
  scenario: Scenario | Experiment,
  bin: string,
): Promise<Run | Omitted> {
  const root = await scenario.prepare(agent.id);
  const turns = "turns" in scenario ? scenario.turns : undefined;
  const [command = binary, ...args] = agent.command(binary, scenario.prompt, turns);
  const result = spawnSync(command, args, {
    cwd: root,
    env: agentEnv(bin),
    encoding: "utf8",
    timeout: "minutes" in scenario ? scenario.minutes * 60 * 1000 : TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
  });
  const transcript = result.stdout ?? "";
  const counts = countsOf(agent.id, transcript);
  if (
    result.status !== 0 &&
    counts.rounds === 0 &&
    NO_SESSION.test(`${transcript}${result.stderr ?? ""}`)
  ) {
    return { agent: agent.id, reason: "sin sesión iniciada" };
  }
  const verdict = await scenario.judge(root);
  const consumption = consumptionOf(agent.id, transcript);
  return { agent: agent.id, scenario: scenario.id, verdict, ...counts, ...consumption };
}

/** Every run of one agent; without its binary, or once it shows it has no session, why not. */
async function runAgent(
  agent: Agent,
  bin: string,
): Promise<{ readonly runs: Run[]; readonly omitted?: Omitted }> {
  const binary = agent.find(process.env);
  if (binary === undefined)
    return { runs: [], omitted: { agent: agent.id, reason: "no está instalado" } };
  const runs: Run[] = [];
  const named = process.env.SPECTY_EVALS_SCENARIOS;
  for (const scenario of [
    ...chosen(SCENARIOS, "SPECTY_EVALS_SCENARIOS"),
    ...namedExperiments(named),
  ]) {
    for (let run = 0; run < RUNS; run += 1) {
      const result = await runOnce(agent, binary, scenario, bin);
      if ("reason" in result) return { runs, omitted: result };
      runs.push(result);
    }
  }
  return { runs };
}

it("runs each agent through each scenario and writes the report", async () => {
  const bin = await wrapper();
  const runs: Run[] = [];
  const omitted: Omitted[] = [];
  for (const agent of chosen(AGENTS, "SPECTY_EVALS_AGENTS")) {
    const result = await runAgent(agent, bin);
    runs.push(...result.runs);
    if (result.omitted !== undefined) omitted.push(result.omitted);
  }
  const summary = summarize(runs, omitted);
  const date = new Date().toISOString().slice(0, 10);
  const folder = join(tmpdir(), "specty-evals");
  await mkdir(folder, { recursive: true });
  const base = join(folder, new Date().toISOString().replaceAll(":", "-"));
  await writeFile(`${base}.md`, reportMarkdown(summary, date));
  await writeFile(`${base}.json`, reportJson(summary, date));
  process.stdout.write(`specty evals: ${base}.md\n`);
  expect(runs.length + omitted.length).toBeGreaterThan(0);
});
