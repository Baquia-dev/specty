// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  AGENT_NAMES,
  agentChoices,
  ENABLED_AGENTS,
  initRefusalCard,
  isAgentTool,
  noAgentWarning,
  renderText,
} from "../src";

/** Every agent Specty knows, for the tests that still try the ones this version does not offer. */
const EVERY_AGENT = Object.keys(AGENT_NAMES).filter(isAgentTool);

describe("the agents this version offers", () => {
  it("AC1: are Claude Code and Antigravity, the only answers to init's question", () => {
    expect(ENABLED_AGENTS).toEqual(["claude-code", "antigravity"]);
    const es = agentChoices(["antigravity", "cursor"], "es");
    expect(es.map((choice) => choice.value)).toEqual(["claude-code", "antigravity"]);
    expect(es.map((choice) => choice.label)).toEqual(["Claude Code", "Antigravity (detectado)"]);
    const en = agentChoices(["codex"], "en");
    expect(en.map((choice) => choice.label)).toEqual(["Claude Code", "Antigravity"]);
  });

  it("AC1: offers every agent it is given, in the order of the names", () => {
    const every = agentChoices(["cursor"], "es", EVERY_AGENT);
    expect(every.map((choice) => choice.value)).toEqual(EVERY_AGENT);
    expect(every.find((choice) => choice.value === "cursor")?.label).toBe("Cursor (detectado)");
  });

  it("AC2: names only the offered ones when nobody could be asked", () => {
    expect(noAgentWarning("specty", "es")).toBe(
      "No se detectó ningún agente: se instaló el guard de Claude Code. Si usas otro, ejecuta `specty init --tools <herramienta>` con alguna de estas: claude-code, antigravity.",
    );
    expect(noAgentWarning("specty", "en")).toBe(
      "No agent detected: Claude Code's guard was installed. If you use another, run `specty init --tools <tool>` with any of: claude-code, antigravity.",
    );
  });

  it("AC3: refuses the agents this version does not offer, in Spanish and in English", () => {
    const refusal = {
      reason: "unavailable-tools",
      tools: ["codex", "aider"],
      offered: ENABLED_AGENTS,
    } as const;
    const es = initRefusalCard(refusal, "es");
    expect(es.status).toBe("invalid");
    expect(renderText(es, "es")).toBe(
      [
        "SPECTY · init",
        "Esta versión de Specty no ofrece `codex`, `aider`: solo Claude Code y Antigravity. Los demás agentes llegarán más adelante.",
        "SIGUIENTE: usa `--tools` con alguna de estas herramientas, separadas por comas: claude-code, antigravity.",
      ].join("\n"),
    );
    expect(renderText(initRefusalCard(refusal, "en"), "en")).toBe(
      [
        "SPECTY · init",
        "This version of Specty does not offer `codex`, `aider`: only Claude Code and Antigravity. The other agents will come later.",
        "NEXT: use `--tools` with any of these tools, separated by commas: claude-code, antigravity.",
      ].join("\n"),
    );
  });
});
