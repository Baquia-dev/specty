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
  type Support,
} from "../src";

const ARCHITECTURE = join(import.meta.dirname, "..", "..", "..", "docs", "ARCHITECTURE.md");

/** Each capability of an agent, without the files it is detected by. */
function supports(tool: keyof typeof AGENT_CAPABILITIES): Support[] {
  const { markers: _, ...capabilities } = AGENT_CAPABILITIES[tool];
  return Object.values(capabilities);
}

describe("the capability table", () => {
  it("covers every agent, and guards those whose guard says yes (AC4)", () => {
    expect(Object.keys(AGENT_CAPABILITIES).toSorted()).toEqual(Object.keys(AGENT_NAMES).toSorted());
    const guarded = Object.keys(AGENT_NAMES).filter(isAgentTool).filter(isGuardedAgent);
    expect(guarded).toEqual(["claude-code", "cursor", "codex", "opencode", "antigravity"]);
    const yes = Object.keys(AGENT_NAMES)
      .filter(isAgentTool)
      .filter((tool) => AGENT_CAPABILITIES[tool].guard.state === "yes");
    expect(yes).toEqual(guarded);
    expect(supports("claude-code").every((support) => support.state === "yes")).toBe(true);
  });

  it("says why each capability is not possible, and how each indirect one works (AC2)", () => {
    for (const tool of Object.keys(AGENT_NAMES).filter(isAgentTool)) {
      for (const support of supports(tool)) {
        const text = support.state === "impossible" ? support.why : undefined;
        const how = support.state === "indirect" ? support.how : undefined;
        for (const said of [text, how]) {
          if (said === undefined) continue;
          expect(said.es, tool).not.toBe("");
          expect(said.en, tool).not.toBe("");
        }
      }
    }
  });

  it("renders a state per capability and agent, in Spanish and in English (AC1)", () => {
    const es = capabilityTable("es");
    const rows = es.split("\n").filter((line) => line.startsWith("| "));
    expect(rows).toHaveLength(2 + Object.keys(AGENT_NAMES).length);
    expect(rows[0]).toBe(
      "| Herramienta | Guard | Aviso tras cada comando | Tarjeta tras compactar | Worktree por nombre | Fin de turno | Exclusión | Permisos | Prueba de extremo a extremo | Se detecta por |",
    );
    expect(es).toContain(
      "| Claude Code | sí | sí | sí | sí | sí | sí | sí | sí | `.claude`, `CLAUDE.md` |",
    );
    expect(es).toContain(
      "| Codex | sí | sí | sí | no posible | sí | no posible | sí | pendiente | `.codex` |",
    );
    expect(es).toContain(
      "| OpenCode | sí | sí | sí | no posible | sí | sí | sí | sí | `.opencode`, `opencode.json`, `opencode.jsonc` |",
    );
    expect(es).toContain("| GitHub Copilot | — | — | — | — | — | — | — | — |");
    expect(es).toContain(
      "| Antigravity | sí | indirecto | indirecto | no posible | sí | sí | sí | no posible |",
    );
    expect(capabilityTable("en")).toContain(
      "| Cursor | yes | yes | indirect | not possible | yes | yes | yes | not possible |",
    );
  });

  it("lists below the table how each indirect capability works and why each one is not possible, one line per text (AC2)", () => {
    const es = capabilityTable("es");
    expect(es).toContain("**Indirecto:**");
    expect(es).toContain(
      "- Tarjeta tras compactar (Cursor): `preCompact` solo observa, así que la tarjeta llega con el resultado del siguiente comando de shell.",
    );
    expect(es).toContain(
      "- Aviso tras cada comando (Antigravity): su `PostToolUse` no responde al modelo, así que el aviso llega en su siguiente llamada al modelo (`PreInvocation`).",
    );
    expect(es).toContain(
      "- Tarjeta tras compactar (Antigravity): no avisa cuando compacta, así que la tarjeta llega al empezar cada turno, con su primera llamada al modelo (`PreInvocation`).",
    );
    expect(es.indexOf("**Indirecto:**")).toBeLessThan(es.indexOf("**No posible:**"));
    expect(es).toContain("- Exclusión (Codex): lee los archivos por la shell");
    expect(es).toMatch(
      /- Worktree por nombre \(Cursor, Codex, OpenCode, Gemini CLI, Windsurf, Antigravity\): /,
    );
    expect(capabilityTable("en")).toContain("**Indirect:**");
    expect(capabilityTable("en")).toContain("**Not possible:**");
  });

  it("is the table ARCHITECTURE §10 shows (AC3)", () => {
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
