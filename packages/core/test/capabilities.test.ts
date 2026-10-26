// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AGENT_CAPABILITIES,
  AGENT_NAMES,
  capabilityTable,
  isAgentTool,
  isGuardedAgent,
} from "../src";

const ARCHITECTURE = join(import.meta.dirname, "..", "..", "..", "docs", "ARCHITECTURE.md");

describe("the capability table", () => {
  it("covers every agent, and says which ones have Specty's guard", () => {
    expect(Object.keys(AGENT_CAPABILITIES).toSorted()).toEqual(Object.keys(AGENT_NAMES).toSorted());
    const guarded = Object.keys(AGENT_NAMES).filter(isAgentTool).filter(isGuardedAgent);
    expect(guarded).toEqual(["claude-code", "cursor", "codex", "opencode"]);
    expect(AGENT_CAPABILITIES["claude-code"]).toMatchObject({
      afterShell: true,
      afterCompaction: true,
      worktreeByName: true,
    });
  });

  it("renders a row per agent, in Spanish and in English", () => {
    const es = capabilityTable("es").split("\n");
    expect(es).toHaveLength(2 + Object.keys(AGENT_NAMES).length);
    expect(es).toContain("| Codex | en el repositorio | sí | — | — | `.codex` |");
    expect(es.some((row) => row.startsWith("| OpenCode | en el repositorio |"))).toBe(true);
    expect(capabilityTable("en")).toContain("| Cursor | in the repository | yes | — | — |");
  });

  it("is the table ARCHITECTURE §10 shows (AC2, AC3)", () => {
    const text = readFileSync(ARCHITECTURE, "utf8");
    const begin = "<!-- specty:capabilities:begin -->\n";
    const shown = text.slice(
      text.indexOf(begin) + begin.length,
      text.indexOf("\n<!-- specty:capabilities:end -->"),
    );
    // If this fails, paste `capabilityTable("es")` between the marks in docs/ARCHITECTURE.md.
    expect(shown).toBe(capabilityTable("es"));
  });
});
