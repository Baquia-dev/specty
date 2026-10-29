// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXPERIMENTS,
  type Experiment,
  type ExperimentId,
  namedExperiments,
} from "../src/experiments";
import { git, read, write } from "../src/repo";

const experiment = (id: ExperimentId): Experiment => {
  const found = EXPERIMENTS.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no experiment ${id}`);
  return found;
};

const FIXED = {
  "src/a.ts": "export const a = 2;\n",
  "src/b.ts": "export const b = 3;\n",
  "src/c.ts": "export const c = 4;\n",
};

/** `count` closed changes, archived as the agent would leave them. */
const closed = (count: number) =>
  Object.fromEntries(
    ["a", "b", "c"]
      .slice(0, count)
      .map((name) => [`.specty/archive/2026/20261029-arreglo-${name}/spec.md`, "# Arreglo\n"]),
  );

describe("the experiments of the suite", () => {
  it("AC2, AC3: each one prepares a repository in delegated mode, with three files to fix", async () => {
    expect(EXPERIMENTS.map((each) => each.id)).toEqual(["changes", "changes-subagent"]);
    for (const each of EXPERIMENTS) {
      const root = await each.prepare("claude-code");
      expect(existsSync(join(root, ".specty/config.yaml"))).toBe(true);
      expect(await read(root, "src/a.ts")).toBe("export const a = 1;\n");
      // The person delegated their decisions to the agent.
      const delegation = git(root, "rev-parse", "--git-path", "common/specty/delegated.json");
      expect(existsSync(join(root, delegation))).toBe(true);
      expect(each.prompt).toContain("src/c.ts");
    }
    // Only the second one has the subagent, and asks for it.
    const subagent = ".claude/agents/specty-change.md";
    expect(await read(await experiment("changes").prepare("claude-code"), subagent)).toBe(
      undefined,
    );
    const delegating = experiment("changes-subagent");
    expect(await read(await delegating.prepare("claude-code"), subagent)).toContain("specty next");
    expect(delegating.prompt).toContain("specty-change");
  });

  it("AC2, AC3: three fixes with three closed changes comply; code without any change violates", async () => {
    for (const each of EXPERIMENTS) {
      expect(await each.judge(await each.prepare("claude-code"))).toEqual({ outcome: "stalled" });
      const coded = await each.prepare("claude-code");
      await write(coded, FIXED);
      expect(await each.judge(coded)).toEqual({
        outcome: "violated",
        reason: "código sin un cambio de Specty: src/a.ts, src/b.ts, src/c.ts",
      });
      const done = await each.prepare("claude-code");
      await write(done, { ...FIXED, ...closed(3) });
      expect(await each.judge(done)).toEqual({ outcome: "followed" });
      // Two closed changes for three fixes: not all of it.
      const half = await each.prepare("claude-code");
      await write(half, { ...FIXED, ...closed(2) });
      expect(await each.judge(half)).toEqual({ outcome: "stalled" });
    }
  });

  it("AC4: run only when named, with more turns and time than a scenario", () => {
    expect(namedExperiments(undefined)).toEqual([]);
    expect(namedExperiments("no-spec, changes").map((each) => each.id)).toEqual(["changes"]);
    for (const each of EXPERIMENTS) {
      expect(each.turns).toBe(150);
      expect(each.minutes).toBe(30);
    }
  });
});
