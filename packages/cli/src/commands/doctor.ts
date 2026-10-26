// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import {
  citedPaths,
  type DoctorLine,
  doctorCard,
  hasBlock,
  type Output,
  unfilledSections,
} from "@baquia-dev/specty-core";
import { ADAPTERS } from "../agents";
import { formatterExclusions } from "../detect/formatters";
import { gentleAiGuidance } from "../detect/gentle-ai";
import { detectProject } from "../detect/project";
import { gitHooksInstalled } from "../install/git-hooks";
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
  const tools = (await detectProject(root, "")).tools;
  // Each agent's guard, as its module checks it (`agents/`).
  for (const agent of Object.values(ADAPTERS)) {
    if (!tools.includes(agent.tool)) continue;
    const lines = await agent.doctor(root);
    ok.push(...lines.ok);
    problems.push(...lines.problems);
  }
  // Another tool's guidance that tells the agent to do what the guard blocks.
  for (const { file, blocks } of await gentleAiGuidance(root, session.environment.env)) {
    problems.push({ code: "gentle-ai", file, blocks });
  }
  for (const { name, path, add, file, excluded } of await formatterExclusions(root)) {
    check(
      excluded,
      { code: "formatter-excludes", name, path },
      { code: "formatter-checks", name, path, add, file },
    );
  }
  const command = session.environment.invocation;
  const reachable =
    command.script !== undefined
      ? await exists(command.script)
      : (await execute("sh", ["-c", `command -v ${COMMAND}`], { cwd: root })).code === 0;
  check(
    reachable,
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
  // Warnings never turn doctor red: what only the person can tell the agent and is still
  // unwritten, the paths AGENTS.md sends it to that are gone (built ones aside), and delegated
  // mode, which is the person's choice rather than a fault.
  const unfilled = agents === undefined ? [] : unfilledSections(agents);
  const cited = agents === undefined ? [] : citedPaths(agents);
  const there = await Promise.all(cited.map((path) => exists(join(root, path))));
  const missing = cited.filter((_, index) => there[index] !== true);
  const built = new Set(await git.ignored(missing));
  const gone = missing.filter((path) => !built.has(path));
  const delegation = await readDelegation(git);
  const warnings: DoctorLine[] = [
    ...(gone.length === 0 ? [] : [{ code: "missing-paths", paths: gone } as const]),
    ...(unfilled.length === 0 ? [] : [{ code: "unfilled-sections", sections: unfilled } as const]),
    ...(delegation === undefined
      ? []
      : [{ code: "delegated", since: delegation.at.slice(0, 10), by: delegation.by } as const]),
  ];
  return doctorCard({ ok, warnings, problems }, session.cards);
}

/** Whether Specty runs on Node `version`: from 22 on, as its `engines` say. */
export function supportsNode(version: string): boolean {
  return Number(version.split(".")[0]) >= 22;
}
