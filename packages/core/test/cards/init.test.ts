// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  AGENT_NAMES,
  agentChoices,
  agentQuestion,
  agentsMdLine,
  backupLine,
  type CardContext,
  configLine,
  dryRunCard,
  initCard,
  initRefusalCard,
  newProjectNext,
  noAgentWarning,
  noTestCommandWarning,
  productLine,
  renderText,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

describe("a refused `init`", () => {
  it("asks for a git repository, or a valid configuration", () => {
    expect(renderText(initRefusalCard({ reason: "no-git" }, "es"), "es")).toBe(
      "SPECTY · init\nEsto no es un repositorio git.\nSIGUIENTE: ejecuta `git init` y vuelve a intentarlo.",
    );
    const invalid = initRefusalCard({ reason: "invalid-config", issues: "mode: no válido" }, "en");
    expect(invalid.status).toBe("blocked");
    expect(renderText(invalid, "en")).toBe(
      "SPECTY · init\n.specty/config.yaml is invalid: mode: no válido\nNEXT: fix it and run `specty init` again.",
    );
  });
});

describe("the agent `init` installs", () => {
  it("asks a person which ones, several allowed, Claude Code first (AC1)", () => {
    expect(agentQuestion(true, "es")).toBe(
      "¿Con qué agentes trabajas en este repositorio? Los detectados ya están marcados; puedes marcar varios.",
    );
    expect(agentQuestion(true, "en")).toBe(
      "Which agents do you work with in this repository? The detected ones are already checked; you can check several.",
    );
    const choices = agentChoices([], "es");
    expect(choices[0]).toEqual({ value: "claude-code", label: "Claude Code" });
    expect(choices.map((choice) => choice.value)).toEqual(Object.keys(AGENT_NAMES));
  });

  it("labels the detected ones, and says when there are none (AC2)", () => {
    const es = agentChoices(["codex", "cursor"], "es");
    expect(es.find((choice) => choice.value === "codex")?.label).toBe("Codex (detectado)");
    expect(es.find((choice) => choice.value === "cursor")?.label).toBe("Cursor (detectado)");
    expect(es[0]?.label).toBe("Claude Code");
    const en = agentChoices(["codex"], "en");
    expect(en.find((choice) => choice.value === "codex")?.label).toBe("Codex (detected)");
    expect(agentQuestion(false, "es")).toBe(
      "No se detectó ningún agente. ¿Con cuáles trabajas en este repositorio? Puedes marcar varios.",
    );
    expect(agentQuestion(false, "en")).toBe(
      "No agent detected. Which ones do you work with in this repository? You can check several.",
    );
  });

  it("warns when nobody could say, and how to choose another (AC5)", () => {
    expect(noAgentWarning("specty", "es")).toBe(
      "No se detectó ningún agente: se instaló el guard de Claude Code. Si usas otro, ejecuta `specty init --tools <herramienta>` con alguna de estas: claude-code, cursor, codex, opencode, gemini-cli, copilot, windsurf, antigravity.",
    );
    expect(noAgentWarning("specty", "en")).toBe(
      "No agent detected: Claude Code's guard was installed. If you use another, run `specty init --tools <tool>` with any of: claude-code, cursor, codex, opencode, gemini-cli, copilot, windsurf, antigravity.",
    );
  });
});

describe("what `init` did", () => {
  it("says what it did with each file", () => {
    expect(configLine(true, [], "es")).toBe(".specty/config.yaml creado.");
    expect(configLine(false, ["verify.default", "verify.full"], "es")).toBe(
      ".specty/config.yaml: añadido verify.default y verify.full; lo demás no se tocó.",
    );
    expect(configLine(false, [], "en")).toBe(
      ".specty/config.yaml already existed; left untouched.",
    );
    expect(agentsMdLine(true, "en")).toBe("AGENTS.md created with Specty's blocks.");
    expect(agentsMdLine(false, "es")).toBe("AGENTS.md: bloques de Specty actualizados.");
    expect(productLine(true, "es")).toBe("Proyecto nuevo: PRODUCT.md creado con tus respuestas.");
    expect(productLine(false, "en")).toBe(
      "New project: PRODUCT.md created with the questions to answer.",
    );
    expect(noTestCommandWarning("es")).toBe(
      "No se detectó un comando de tests: define verify.default en .specty/config.yaml.",
    );
    expect(backupLine("/repo/.git/specty/backups/x", "en")).toBe(
      "Copy of what was there before: /repo/.git/specty/backups/x.",
    );
  });

  it("sums it up, with what it detected, and sends the person to complete AGENTS.md", () => {
    const card = initCard(
      {
        done: [".specty/config.yaml creado."],
        detected: ["TypeScript (pnpm)", "Tests: pnpm test"],
        warnings: ["Codex solo ejecuta el guard cuando confías en él."],
        unfilled: ["Mapa", "Convenciones"],
      },
      ES,
    );
    expect(card.status).toBe("ok");
    expect(renderText(card, "es")).toBe(
      [
        "SPECTY · init",
        "CONFIGURADO:",
        "  .specty/config.yaml creado.",
        "DETECTADO:",
        "  TypeScript (pnpm)",
        "  Tests: pnpm test",
        "AVISOS:",
        "  Codex solo ejecuta el guard cuando confías en él.",
        "SIGUIENTE: completa las secciones «Mapa» y «Convenciones» de AGENTS.md con lo que no se deduce del código, revisa .specty/config.yaml y ejecuta `specty doctor`.",
      ].join("\n"),
    );
  });

  it("names only the sections of AGENTS.md still empty, as written (AC1, AC2)", () => {
    const next = (unfilled: readonly string[], ctx: CardContext) =>
      initCard({ done: [], detected: [], warnings: [], unfilled }, ctx).next;
    expect(next(["Convenciones"], ES)).toBe(
      "completa la sección «Convenciones» de AGENTS.md con lo que no se deduce del código, revisa .specty/config.yaml y ejecuta `specty doctor`.",
    );
    expect(next(["Map", "Conventions"], EN)).toBe(
      'complete the "Map" and "Conventions" sections of AGENTS.md with what cannot be inferred from the code, review .specty/config.yaml and run `specty doctor`.',
    );
    expect(next([], ES)).toBe("revisa .specty/config.yaml y ejecuta `specty doctor`.");
    expect(next([], EN)).toBe("review .specty/config.yaml and run `specty doctor`.");
  });

  it("in a new project, sends the agent to the first change", () => {
    expect(
      initCard({ done: [], detected: [], warnings: [], unfilled: [], product: "interviewed" }, EN)
        .next,
    ).toBe("ask your agent for the first change: the project's skeleton, from PRODUCT.md.");
    expect(newProjectNext(false, ES)).toBe(
      'es un proyecto nuevo: hazle al usuario las preguntas de PRODUCT.md, complétalo con sus respuestas y crea el primer cambio, el esqueleto del proyecto, con `specty new "Esqueleto del proyecto" --request "<petición literal del usuario>"`.',
    );
  });
});

describe("the dry run of `init`", () => {
  it("lists what it would create or change, and writes nothing", () => {
    const card = dryRunCard(
      [
        { path: ".specty/config.yaml", created: true },
        { path: "AGENTS.md", created: false },
      ],
      [],
      ES,
    );
    expect(renderText(card, "es")).toBe(
      [
        "SPECTY · init",
        "SIMULACIÓN, NO SE HA ESCRITO NADA:",
        "  crear .specty/config.yaml",
        "  cambiar AGENTS.md",
        "SIGUIENTE: ejecuta `specty init` sin `--dry-run` para aplicarlo.",
      ].join("\n"),
    );
  });

  it("says when there is nothing to change", () => {
    const text = renderText(dryRunCard([], ["A warning."], EN), "en");
    expect(text).toContain(
      "DRY RUN, NOTHING WAS WRITTEN:\n  Nothing to change.\nWARNINGS:\n  A warning.",
    );
    expect(text).toContain("NEXT: run `specty init` without `--dry-run` to apply it.");
  });
});
