// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXPERIMENTS, type Experiment, type ExperimentId } from "../src/experiments";
import { read, specty } from "../src/repo";

const experiment = (id: ExperimentId): Experiment => {
  const found = EXPERIMENTS.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no experiment ${id}`);
  return found;
};

describe("the experiments of three changes, as the card hands them out", () => {
  it("AC1: neither brings a subagent of its own, each change gets a folder of its own, and only `changes` turns the subagents off, with the same errand", async () => {
    for (const id of ["changes", "changes-subagent"] as const) {
      const root = await experiment(id).prepare("claude-code");
      expect(await readdir(join(root, ".claude", "agents")).catch(() => []), id).toEqual([]);
      const config = (await read(root, ".specty/config.yaml")) ?? "";
      expect(config, id).toMatch(/^git:\n {2}setup: false$/m);
      expect(config, id).not.toContain("worktrees: false");
      if (id === "changes") expect(config).toMatch(/^subagents: false$/m);
      else expect(config).not.toContain("subagents");
    }
    const { prompt } = experiment("changes");
    expect(experiment("changes-subagent").prompt).toBe(prompt);
    for (const path of ["src/a.ts", "src/b.ts", "src/c.ts"]) expect(prompt).toContain(path);
    expect(prompt).not.toMatch(/subagent/i);
    expect(prompt).not.toContain("uno tras otro");
  });

  it("AC2: two subagents create their changes at once, each in a folder of its own", async () => {
    const root = await experiment("changes-subagent").prepare("claude-code");
    for (const title of ["La constante a vale dos", "Nuevo valor de b"]) {
      const { code, out } = await specty(root, ["new", title, "--kind", "quick", "--subagent"]);
      expect(code, out).toBe(0);
    }
    const folders = await readdir(join(root, ".worktrees"));
    expect(folders).toHaveLength(2);
    for (const id of folders) {
      const spec = join(root, ".worktrees", id, ".specty", "changes", id, "spec.md");
      expect(existsSync(spec), id).toBe(true);
    }
  });
});
