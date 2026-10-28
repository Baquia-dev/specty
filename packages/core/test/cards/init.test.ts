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
  developLine,
  dryRunCard,
  flowChoices,
  flowLine,
  flowQuestion,
  initCard,
  initRefusalCard,
  newProjectNext,
  noAgentWarning,
  noFlowWarning,
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

  it("names the valid git flows when --git-flow is not one (AC5)", () => {
    const flow = initRefusalCard({ reason: "unknown-flow", flow: "svn" }, "es");
    expect(flow.status).toBe("invalid");
    expect(renderText(flow, "es")).toBe(
      "SPECTY · init\nFlujo de git desconocido: svn.\nSIGUIENTE: usa `--git-flow specty|github|trunk|gitflow`.",
    );
    expect(renderText(initRefusalCard({ reason: "unknown-flow", flow: "svn" }, "en"), "en")).toBe(
      "SPECTY · init\nUnknown git flow: svn.\nNEXT: use `--git-flow specty|github|trunk|gitflow`.",
    );
  });
});

describe("the git flow `init` asks for", () => {
  it("offers the four flows by their branches, Specty's first when none was detected (AC1, AC2)", () => {
    expect(flowQuestion(undefined, "es")).toBe(
      "¿Qué flujo de git sigue este repositorio? Specty nombrará así las ramas de los cambios.",
    );
    const none = flowChoices(undefined, "es");
    expect(none.map((choice) => choice.value)).toEqual(["specty", "github", "gitflow", "trunk"]);
    expect(none.map((choice) => choice.label)).toEqual([
      "Specty: specty/<id>",
      "GitHub Flow: <tipo>/<slug>, como feat/<slug>",
      "Git Flow: feature/<slug> y bugfix/<slug>",
      "Trunk: <tipo>/<slug>, como feat/<slug>",
    ]);
  });

  it("puts the detected one first, and says so (AC2)", () => {
    expect(flowQuestion("gitflow", "en")).toBe(
      "Which git flow does this repository follow? The detected one comes first; Specty will name the changes' branches by it.",
    );
    const detected = flowChoices("gitflow", "en");
    expect(detected.map((choice) => choice.value)).toEqual([
      "gitflow",
      "specty",
      "github",
      "trunk",
    ]);
    expect(detected[0]?.label).toBe("Git Flow: feature/<slug> and bugfix/<slug> (detected)");
    expect(flowChoices("github", "es")[0]?.label).toBe(
      "GitHub Flow: <tipo>/<slug>, como feat/<slug> (detectado)",
    );
  });
});

describe("the git flow `init` writes", () => {
  it("says how the changes' branches will be named (AC1)", () => {
    expect(flowLine("gitflow", "es")).toBe(
      ".specty/config.yaml: git.flow es gitflow; las ramas de los cambios serán feature/<slug> y bugfix/<slug>.",
    );
    expect(flowLine("github", "es")).toBe(
      ".specty/config.yaml: git.flow es github; las ramas de los cambios serán <tipo>/<slug>, como feat/<slug>.",
    );
    expect(flowLine("trunk", "en")).toBe(
      ".specty/config.yaml: git.flow is trunk; the changes' branches will be <type>/<slug>, such as feat/<slug>.",
    );
    expect(flowLine("specty", "en")).toBe(
      ".specty/config.yaml: git.flow is specty; the changes' branches will be specty/<id>.",
    );
  });

  it("says where develop came from (AC4)", () => {
    expect(developLine("origin/develop", "es")).toBe(
      "Rama develop creada desde origin/develop: ahí empiezan y terminan los cambios.",
    );
    expect(developLine("main", "en")).toBe(
      "Branch develop created from main: changes start from it and go to it.",
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

  it("in a new project without a git flow, warns and asks for one first (AC6)", () => {
    expect(noFlowWarning("specty", "es")).toBe(
      "Proyecto nuevo sin flujo de git: las ramas de los cambios serán specty/<id> hasta que lo elijas con `specty init --git-flow <specty|github|trunk|gitflow>`.",
    );
    expect(newProjectNext(false, ES, true)).toBe(
      'es un proyecto nuevo: pregúntale al usuario qué flujo de git seguirá (specty, github, trunk o gitflow) y ejecuta `specty init --git-flow <flujo>`; luego hazle las preguntas de PRODUCT.md, complétalo con sus respuestas y crea el primer cambio, el esqueleto del proyecto, con `specty new "Esqueleto del proyecto" --request "<petición literal del usuario>"`.',
    );
    const interviewed = { done: [], detected: [], warnings: [], unfilled: [] } as const;
    expect(initCard({ ...interviewed, product: "interviewed", chooseFlow: true }, EN).next).toBe(
      "choose the git flow with `specty init --git-flow <specty|github|trunk|gitflow>` and ask your agent for the first change: the project's skeleton, from PRODUCT.md.",
    );
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
