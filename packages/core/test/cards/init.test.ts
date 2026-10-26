// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  agentsMdLine,
  backupLine,
  type CardContext,
  configLine,
  dryRunCard,
  initCard,
  initRefusalCard,
  newProjectNext,
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

  it("in a new project, sends the agent to the first change", () => {
    expect(
      initCard({ done: [], detected: [], warnings: [], product: "interviewed" }, EN).next,
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
