// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { read } from "../src/repo";
import { SCENARIOS, type Scenario, type ScenarioId } from "../src/scenarios";

const scenario = (id: ScenarioId): Scenario => {
  const found = SCENARIOS.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no scenario ${id}`);
  return found;
};

describe("a repository the suite prepares for Antigravity", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("AC4: init installs the guard in the repository and leaves the person's Antigravity CLI settings alone", async () => {
    // A person who uses Antigravity's CLI: its folder exists, without settings yet.
    const home = await mkdtemp(join(tmpdir(), "specty-evals-home-"));
    const settings = join(home, ".gemini", "antigravity-cli");
    await mkdir(settings, { recursive: true });
    vi.stubEnv("HOME", home);
    vi.stubEnv("SPECTY_ANTIGRAVITY_CLI_DIR", "");
    const root = await scenario("no-spec").prepare("antigravity");
    expect(await read(root, ".agents/hooks.json")).toContain("guard --tool antigravity");
    expect(existsSync(join(settings, "settings.json"))).toBe(false);
  });
});
