// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EXPERIMENTS } from "../src/experiments";
import { antigravityCliFolder, DIST, read } from "../src/repo";
import { SCENARIOS, type Scenario, type ScenarioId } from "../src/scenarios";

const scenario = (id: ScenarioId): Scenario => {
  const found = SCENARIOS.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no scenario ${id}`);
  return found;
};

/** Whether `folder` is `parent` or inside it. */
const inside = (folder: string, parent: string): boolean => {
  const path = relative(parent, folder);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
};

/** The rules the installation gives the repository `root`, in its order (D5). */
const installationRules = (root: string): string[] => {
  const node = dirname(dirname(process.execPath));
  const bundle = dirname(DIST);
  return [
    "command(specty)",
    `read_file(${node})`,
    ...(inside(bundle, node) ? [] : [`read_file(${bundle})`]),
    `write_file(${join(root, ".git")})`,
  ];
};

/** The rules in the suite's Antigravity CLI settings for `root`. */
const rulesOf = async (root: string): Promise<unknown> => {
  const text = await read(antigravityCliFolder(root), "settings.json");
  return text === undefined ? undefined : JSON.parse(text).permissions?.allow;
};

describe("a repository the suite prepares for Antigravity", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("AC1: creates the suite's own Antigravity CLI folder before init, which writes the installation's rules there and leaves the person's settings alone", async () => {
    // A person who uses Antigravity's CLI: its folder exists, without settings yet.
    const home = await mkdtemp(join(tmpdir(), "specty-evals-home-"));
    const settings = join(home, ".gemini", "antigravity-cli");
    await mkdir(settings, { recursive: true });
    vi.stubEnv("HOME", home);
    vi.stubEnv("SPECTY_ANTIGRAVITY_CLI_DIR", "");
    const root = await scenario("no-spec").prepare("antigravity");
    expect(await read(root, ".agents/hooks.json")).toContain("guard --tool antigravity");
    // The suite's folder, outside the repository and the person's.
    const folder = antigravityCliFolder(root);
    expect(isAbsolute(folder)).toBe(true);
    expect(inside(folder, root)).toBe(false);
    expect(inside(folder, home)).toBe(false);
    expect(await rulesOf(root)).toEqual(installationRules(root));
    expect(existsSync(join(settings, "settings.json"))).toBe(false);
    // Each repository has its own: its rules open only its own git.
    const other = await scenario("no-spec").prepare("antigravity");
    expect(antigravityCliFolder(other)).not.toBe(folder);
    expect(await rulesOf(other)).toEqual(installationRules(other));
  });

  it("AC1: an experiment prepared for Antigravity gets the installation's rules too", async () => {
    const wait = EXPERIMENTS.find((experiment) => experiment.id === "wait");
    if (wait === undefined) throw new Error("no experiment wait");
    const root = await wait.prepare("antigravity");
    expect(await rulesOf(root)).toEqual(installationRules(root));
  });

  it("AC1: a repository prepared for another agent has no Antigravity CLI folder", async () => {
    const root = await scenario("no-spec").prepare("claude-code");
    expect(existsSync(antigravityCliFolder(root))).toBe(false);
  });
});
