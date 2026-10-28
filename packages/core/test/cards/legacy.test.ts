// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  configTemplate,
  legacyDoneLines,
  legacyMoveBody,
  legacyPlanCard,
  legacyRefusalCard,
  legacyRemovalBody,
  legacyStepQuestion,
  legacyStepTitle,
  renderText,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

describe("the configuration a migration writes", () => {
  it("AC1: keeps the legacy's governed and free paths", () => {
    const config = configTemplate({
      lang: "es",
      verify: { default: "npm test", full: "npm run lint && npm test" },
      generated: [],
      governed: ["src/**"],
      ignored: ["**/*.md", "docs/**"],
    });
    expect(config).toContain('governed: ["src/**"]');
    expect(config).toContain('ignored: ["**/*.md","docs/**"]');
    expect(config).toContain('  default: "npm test"\n  full: "npm run lint && npm test"');
  });
});

describe("the steps of the migration", () => {
  it("AC1: name each step, ask before it and show what it changes", () => {
    expect(legacyStepTitle("move", "es")).toBe(
      "Migración del legacy: mover a .specty/legacy/ y traducir la configuración",
    );
    expect(legacyStepTitle("hooks", "en")).toBe("Legacy migration: its git hooks");
    expect(legacyStepTitle("agents", "es")).toBe("Migración del legacy: sus bloques de AGENTS.md");
    expect(legacyStepQuestion("move", "es")).toBe(
      "¿Mover la instalación del legacy y escribir la configuración nueva?",
    );
    expect(legacyStepQuestion("hooks", "es")).toBe("¿Quitar los hooks de git del legacy?");
    expect(legacyStepQuestion("agents", "en")).toBe("Remove the legacy's blocks from AGENTS.md?");
    expect(legacyMoveBody([".specty/config.yaml", ".specty/rules"], "version: 1\n", "es")).toBe(
      "Se mueven a .specty/legacy/:\n  .specty/config.yaml\n  .specty/rules\n\nNueva .specty/config.yaml:\nversion: 1\n",
    );
    expect(
      legacyRemovalBody([{ path: ".husky/pre-commit", lines: ["# >>> specty-hook >>>", "x"] }]),
    ).toBe(".husky/pre-commit:\n- # >>> specty-hook >>>\n- x");
  });

  it("AC1: say what was migrated and which legacy changes can be imported", () => {
    expect(
      legacyDoneLines(
        { hooks: [".husky/pre-commit"], agents: true, changes: [".specty/legacy/changes/a"] },
        "es",
      ),
    ).toEqual([
      "Instalación del legacy movida a .specty/legacy/; su configuración, traducida: idioma, rutas gobernadas y libres, y verificación.",
      "Hooks de git del legacy quitados: .husky/pre-commit.",
      "Bloques del legacy quitados de AGENTS.md.",
      "Cambios del legacy que se pueden traer con `specty import <carpeta>`: .specty/legacy/changes/a.",
    ]);
    expect(legacyDoneLines({ hooks: [], agents: false, changes: [] }, "en")).toEqual([
      "Legacy installation moved to .specty/legacy/; its configuration translated: language, governed and free paths, and verification.",
    ]);
  });
});

describe("a migration that does not happen", () => {
  it("AC2: is the person's, in their terminal", () => {
    const card = legacyRefusalCard("not-interactive", ES);
    expect(card.status).toBe("blocked");
    expect(renderText(card, "es")).toBe(
      [
        "SPECTY",
        "Este repositorio tiene una instalación del legacy (@barcidev/specty).",
        "SIGUIENTE: migrarla lo decide la persona en su terminal: pídele que ejecute `specty init`; para ver qué cambiaría, `specty init --dry-run`.",
      ].join("\n"),
    );
  });

  it("AC2: in a dry run, lists what it would move and remove", () => {
    const card = legacyPlanCard(
      {
        moved: [".specty/config.yaml", ".specty/rules"],
        hooks: [".husky/pre-commit"],
        agents: true,
      },
      ES,
    );
    expect(renderText(card, "es")).toBe(
      [
        "SPECTY",
        "MIGRACIÓN DEL LEGACY (sin aplicar):",
        "  mover a .specty/legacy/: .specty/config.yaml, .specty/rules",
        "  quitar los hooks de git del legacy: .husky/pre-commit",
        "  quitar los bloques del legacy de AGENTS.md",
        "SIGUIENTE: ejecuta `specty init` en tu terminal para migrarla.",
      ].join("\n"),
    );
    expect(
      legacyPlanCard({ moved: [".specty/config.yaml"], hooks: [], agents: false }, EN).next,
    ).toBe("run `specty init` in your terminal to migrate it.");
  });

  it("AC3: declined, changes nothing", () => {
    const card = legacyRefusalCard("declined", EN);
    expect(card.blocks[0]?.lines).toEqual(["Legacy migration cancelled: nothing changed."]);
    expect(card.next).toBe("to migrate it, run `specty init` again.");
  });
});
