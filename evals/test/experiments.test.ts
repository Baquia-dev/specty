// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXPERIMENTS,
  type Experiment,
  type ExperimentId,
  namedExperiments,
} from "../src/experiments";
import { git, openChanges, read, specty, write } from "../src/repo";

const experiment = (id: ExperimentId): Experiment => {
  const found = EXPERIMENTS.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no experiment ${id}`);
  return found;
};

/** The experiments of three changes in a row: the epic's prepare and judge their own way. */
const CHANGES = EXPERIMENTS.filter(
  (each) => each.id === "changes" || each.id === "changes-subagent",
);

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
    expect(EXPERIMENTS.map((each) => each.id)).toEqual([
      "changes",
      "changes-subagent",
      "epic",
      "epic-subagent",
    ]);
    for (const each of CHANGES) {
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
    for (const each of CHANGES) {
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
    for (const each of CHANGES) {
      expect(each.turns).toBe(150);
      expect(each.minutes).toBe(30);
    }
  });
});

/** The experiments of the epic: in order, and with a subagent per slice. */
const EPICS = ["epic", "epic-subagent"] as const;

/** A change the archive keeps that names `path`: a slice of the epic with `slice`, else the epic. */
const archivedChange = (name: string, path: string, slice?: string) => ({
  [`.specty/archive/2026/20261104-${name}/spec.md`]: [
    "---",
    slice === undefined
      ? "kind: epic"
      : `kind: standard\nepic: 20261104-constantes-nuevas\nslice: ${slice}`,
    "---",
    "",
    `# ${name}`,
    "",
    "## Archivos",
    "",
    `- modificar ${path} — la constante`,
    "",
  ].join("\n"),
});

describe("the experiments of an epic", () => {
  it("AC2: each one leaves an approved epic of three slices in `.worktrees/`, delegated, that `next` in the main folder offers to resume", async () => {
    for (const id of EPICS) {
      const each = experiment(id);
      const root = await each.prepare("claude-code");
      const [epic = ""] = await readdir(join(root, ".worktrees"));
      const folder = join(root, ".worktrees", epic);
      const [change] = await openChanges(folder);
      expect(change?.id, id).toBe(epic);
      expect(change?.state.phase, id).toBe("implementing");
      expect(change?.state.approved, id).toBeDefined();
      // Three slices that can start at once, one per file, which the main folder keeps as it was.
      const spec = (await read(folder, `.specty/changes/${epic}/spec.md`)) ?? "";
      expect(spec).toContain("kind: epic");
      expect(spec.match(/^- C\d+: /gm)).toHaveLength(3);
      expect(spec).not.toContain("depends:");
      for (const path of ["src/a.ts", "src/b.ts", "src/c.ts"]) expect(spec).toContain(path);
      expect(await read(root, "src/a.ts")).toBe("export const a = 1;\n");
      // The person delegated their decisions to the agent.
      const delegation = git(root, "rev-parse", "--git-path", "common/specty/delegated.json");
      expect(existsSync(join(root, delegation)), id).toBe(true);
      // Only the epic in order turns the subagents off.
      const config = (await read(folder, ".specty/config.yaml")) ?? "";
      if (id === "epic") expect(config).toContain("subagents: false");
      else expect(config).not.toContain("subagents");
      // No conversation holds it: `next` in the main folder tells how to resume it.
      expect((await specty(root, ["next"])).out, id).toContain(epic);
      // The same errand, which names the epic and leaves the subagents to its card.
      const title = /^# (.+)$/m.exec(spec)?.[1] ?? "";
      expect(title).not.toBe("");
      expect(each.prompt).toContain(title);
      expect(each.prompt).not.toMatch(/subagent/i);
    }
    expect(experiment("epic").prompt).toBe(experiment("epic-subagent").prompt);
  });

  it("AC3: three fixed files and three closed slices comply; a changed file no closed slice names violates", async () => {
    for (const id of EPICS) {
      const each = experiment(id);
      const root = await each.prepare("claude-code");
      expect(await each.judge(root), id).toEqual({ outcome: "stalled" });
      // Two slices closed, each with its file: not all of it.
      await write(root, {
        "src/a.ts": FIXED["src/a.ts"],
        "src/b.ts": FIXED["src/b.ts"],
        ...archivedChange("corte-c1", "src/a.ts", "C1"),
        ...archivedChange("corte-c2", "src/b.ts", "C2"),
      });
      expect(await each.judge(root), id).toEqual({ outcome: "stalled" });
      // The third file changed without its slice: the epic names it, but it is no slice.
      await write(root, {
        "src/c.ts": FIXED["src/c.ts"],
        ...archivedChange("constantes-nuevas", "src/c.ts"),
      });
      expect(await each.judge(root), id).toEqual({
        outcome: "violated",
        reason: "código sin un cambio de Specty: src/c.ts",
      });
      await write(root, archivedChange("corte-c3", "src/c.ts", "C3"));
      expect(await each.judge(root), id).toEqual({ outcome: "followed" });
    }
  });

  it("AC4: run only when named, with more turns and minutes than the three changes", () => {
    expect(namedExperiments("epic, epic-subagent").map((each) => each.id)).toEqual([...EPICS]);
    expect(namedExperiments("changes, changes-subagent").map((each) => each.id)).toEqual([
      "changes",
      "changes-subagent",
    ]);
    expect(namedExperiments(undefined)).toEqual([]);
    const changes = experiment("changes");
    for (const id of EPICS) {
      expect(experiment(id).turns, id).toBeGreaterThan(changes.turns);
      expect(experiment(id).minutes, id).toBeGreaterThan(changes.minutes);
    }
  });
});
