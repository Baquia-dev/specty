// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { agentsToRun } from "../src/agents";
import { disposableRepo, installSpecty, read } from "../src/repo";

const ids = (variable: string | undefined) => agentsToRun(variable).map((agent) => agent.id);

describe("the agents the compliance suite measures", () => {
  it("AC3: are the ones this version enables when SPECTY_EVALS_AGENTS says nothing", () => {
    expect(ids(undefined)).toEqual(["claude-code", "antigravity"]);
  });

  it("AC3: are the ones SPECTY_EVALS_AGENTS names, a disabled one too, in the suite's order", () => {
    expect(ids("codex, claude-code")).toEqual(["claude-code", "codex"]);
    expect(ids("opencode")).toEqual(["opencode"]);
  });

  it("AC3: installs Specty for a disabled agent the variable names", async () => {
    const root = await disposableRepo({ "src/app.ts": "export const a = 1;\n" });
    await installSpecty(root, "codex");
    expect(await read(root, ".codex/hooks.json")).toContain("guard --tool codex");
  });
});
