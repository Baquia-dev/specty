// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import {
  citedPaths,
  type DoctorLine,
  doctorCard,
  hasBlock,
  type Output,
  parseGlossary,
  unfilledSections,
} from "@baquia-dev/specty-core";
import { ADAPTERS } from "../agents";
import { formatterExclusions } from "../detect/formatters";
import { gentleAiGuidance } from "../detect/gentle-ai";
import { detectProject } from "../detect/project";
import { gitHooksInstalled } from "../install/git-hooks";
import { mcpDoctor } from "../install/mcp";
import { usageDoctor } from "../install/usage";
import { execute } from "../io/exec";
import { exists, readText } from "../io/files";
import { COMMAND, type Session } from "../session";
import { readDelegation } from "../store/local";

/** `specty doctor`: checks that the configuration and every hook are in place. */
export async function doctor(session: Session): Promise<Output> {
  const { root, git } = session;
  const ok: DoctorLine[] = [{ code: "config-valid" }];
  const problems: DoctorLine[] = [];
  const check = (passed: boolean, good: DoctorLine, bad: DoctorLine) =>
    passed ? ok.push(good) : problems.push(bad);

  const agents = await readText(join(root, "AGENTS.md"));
  check(
    agents !== undefined && hasBlock(agents, "flow"),
    { code: "flow-block" },
    { code: "no-flow-block" },
  );
  check(await gitHooksInstalled(root, git), { code: "git-hooks" }, { code: "no-git-hooks" });
  const tools = await toolLines(session);
  ok.push(...tools.ok);
  problems.push(...tools.problems);
  const command = session.environment.invocation;
  check(
    await reachable(session),
    { code: "specty-reachable", command: command.command },
    { code: "specty-unreachable" },
  );
  const verify = session.config.verify.default;
  check(
    verify !== undefined,
    { code: "verify-default", command: verify ?? "" },
    { code: "no-verify-default" },
  );
  const version = process.versions.node;
  check(supportsNode(version), { code: "node", version }, { code: "old-node", version });
  const warnings = [...tools.warnings, ...(await doctorWarnings(session, agents))];
  return doctorCard({ ok, warnings, problems }, session.cards);
}

/**
 * Each agent's guard, as its module checks it (`agents/`), and Specty's MCP server once the
 * repository registered it; another tool's guidance that tells the agent to do what the guard
 * blocks; and the formatters that would rewrite Specty's files.
 */
async function toolLines(session: Session): Promise<{
  readonly ok: DoctorLine[];
  readonly problems: DoctorLine[];
  readonly warnings: DoctorLine[];
}> {
  const { root, git } = session;
  const ok: DoctorLine[] = [];
  const problems: DoctorLine[] = [];
  const tools = (await detectProject(root, "")).tools;
  for (const agent of Object.values(ADAPTERS)) {
    if (!tools.includes(agent.tool)) continue;
    const lines = await agent.doctor(root, git);
    ok.push(...lines.ok);
    problems.push(...lines.problems);
  }
  const mcp = await mcpDoctor(root, tools);
  ok.push(...mcp.ok);
  problems.push(...mcp.problems);
  for (const { file, blocks } of await gentleAiGuidance(root, session.environment.env)) {
    problems.push({ code: "gentle-ai", file, blocks });
  }
  for (const { name, path, add, file, excluded } of await formatterExclusions(root)) {
    if (excluded) ok.push({ code: "formatter-excludes", name, path });
    else problems.push({ code: "formatter-checks", name, path, add, file });
  }
  return { ok, problems, warnings: mcp.warnings };
}

/** Whether the `specty` command the agent runs can be found: its script, or the one on PATH. */
async function reachable(session: Session): Promise<boolean> {
  const command = session.environment.invocation;
  return command.script !== undefined
    ? exists(command.script)
    : (await execute("sh", ["-c", `command -v ${COMMAND}`], { cwd: session.root })).code === 0;
}

/**
 * Warnings never turn doctor red: what only the person can tell the agent and is still unwritten,
 * the paths AGENTS.md sends it to that are gone (built ones aside), the ccusage closing would not
 * find, and delegated mode, which is the person's choice rather than a fault.
 */
async function doctorWarnings(session: Session, agents: string | undefined): Promise<DoctorLine[]> {
  const { root, git } = session;
  const unfilled = agents === undefined ? [] : unfilledSections(agents);
  const cited = agents === undefined ? [] : citedPaths(agents);
  const there = await Promise.all(cited.map((path) => exists(join(root, path))));
  const missing = cited.filter((_, index) => there[index] !== true);
  const built = new Set(await git.ignored(missing));
  const gone = missing.filter((path) => !built.has(path));
  const delegation = await readDelegation(git);
  const glossary = await readText(join(root, session.config.glossary));
  const emptyGlossary = glossary !== undefined && parseGlossary(glossary).length === 0;
  return [
    ...(gone.length === 0 ? [] : [{ code: "missing-paths", paths: gone } as const]),
    ...(unfilled.length === 0 ? [] : [{ code: "unfilled-sections", sections: unfilled } as const]),
    ...(emptyGlossary ? [{ code: "empty-glossary", path: session.config.glossary } as const] : []),
    ...(await usageDoctor(root, session.environment.env)),
    ...(delegation === undefined
      ? []
      : [{ code: "delegated", since: delegation.at.slice(0, 10), by: delegation.by } as const]),
  ];
}

/** Whether Specty runs on Node `version`: from 22 on, as its `engines` say. */
export function supportsNode(version: string): boolean {
  return Number(version.split(".")[0]) >= 22;
}
