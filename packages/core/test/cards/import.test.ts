// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  type ImportedChange,
  importedLead,
  importedSections,
  importListCard,
  importRefusalCard,
  importRequest,
  renderText,
  specTemplate,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

const CHANGE: ImportedChange = {
  title: "Add two-factor authentication",
  why: "Accounts are taken over.",
  whatChanges: "- Add an OTP challenge.",
  outOfScope: "- SMS",
  other: [{ heading: "Impact", body: "- Affected code: `src/auth/`" }],
  design: "TOTP with a 30 s window.",
  scenarios: [
    { given: "a user with two-factor on", when: "they log in", outcome: "an OTP is asked" },
    { when: "the code is wrong", outcome: "the login fails" },
  ],
  loose: ["auth: Recovery codes — The system SHALL offer ten codes."],
  removed: ["auth: Remember me"],
  pending: ["Ask for the code", "Send it by email"],
  done: ["Add the OTP column"],
};

describe("the sections of an imported change", () => {
  it("AC2: put each part of the OpenSpec change where it belongs, in the spec's language", () => {
    const sections = importedSections(CHANGE, "es");
    expect(sections.goal).toBe("Accounts are taken over.\n\n- Add an OTP challenge.");
    expect(sections.outOfScope).toBe("- SMS");
    expect(sections.criteria).toBe(
      [
        "- AC1: DADO a user with two-factor on CUANDO they log in ENTONCES an OTP is asked",
        "- AC2: CUANDO the code is wrong ENTONCES the login fails",
      ].join("\n"),
    );
    expect(sections.tasks).toBe("- [ ] T1: Ask for the code\n- [ ] T2: Send it by email");
    expect(sections.design).toBe(
      [
        "TOTP with a 30 s window.",
        "**Impact**\n\n- Affected code: `src/auth/`",
        "**Sin criterio todavía** (requisitos o escenarios de OpenSpec sin WHEN y THEN):\n\n- auth: Recovery codes — The system SHALL offer ten codes.",
        "**Requisitos que el cambio quita:**\n\n- auth: Remember me",
        "**Hecho antes de importar:**\n\n- Add the OTP column",
      ].join("\n\n"),
    );
    expect(importedSections(CHANGE, "en").criteria).toBe(
      [
        "- AC1: GIVEN a user with two-factor on WHEN they log in THEN an OTP is asked",
        "- AC2: WHEN the code is wrong THEN the login fails",
      ].join("\n"),
    );
  });

  it("AC2: leave out what the change does not have, so its hint stays in the template", () => {
    const bare: ImportedChange = {
      other: [{ heading: "", body: "Notes." }],
      scenarios: [],
      loose: [],
      removed: [],
      pending: [],
      done: [],
    };
    expect(importedSections(bare, "en")).toEqual({ design: "Notes." });
    const spec = specTemplate({
      kind: "standard",
      lang: "es",
      title: "Importado",
      prefilled: importedSections(bare, "es"),
    });
    expect(spec).toContain("## Diseño\n\nNotes.\n\n## Archivos\n\n<!--");
    expect(spec).toContain("## Objetivo\n\n<!--");
    expect(spec).toContain("## Supuestos\n\n<!--");
  });
});

describe("the cards of `specty import`", () => {
  it("AC1: name where the change came from, as the request and as the lead of the new card", () => {
    expect(importRequest("openspec/changes/add-2fa", "es")).toBe(
      "Importado de OpenSpec: openspec/changes/add-2fa",
    );
    expect(importRequest("openspec/changes/add-2fa", "en")).toBe(
      "Imported from OpenSpec: openspec/changes/add-2fa",
    );
    expect(importedLead("openspec/changes/add-2fa", ES)).toEqual([
      "Importado de OpenSpec: openspec/changes/add-2fa. Completa los supuestos, los archivos y los `files` de cada tarea, y revisa el diseño.",
    ]);
  });

  it("AC3: say what is missing", () => {
    const missing = importRefusalCard({ reason: "missing", folder: "openspec/changes/x" }, ES);
    expect(missing.status).toBe("blocked");
    expect(renderText(missing, "es")).toBe(
      [
        "SPECTY",
        "No existe la carpeta openspec/changes/x.",
        "SIGUIENTE: ejecuta `specty import` para ver los cambios que se pueden importar.",
      ].join("\n"),
    );
    expect(
      importRefusalCard({ reason: "no-proposal", folder: "notes" }, EN).blocks[0]?.lines,
    ).toEqual(["notes is not an OpenSpec change: it has no proposal.md."]);
  });

  it("AC4: list the changes to import, or say there are none", () => {
    const listed = importListCard(["openspec/changes/add-2fa", "openspec/changes/b"], ES);
    expect(renderText(listed, "es")).toBe(
      [
        "SPECTY",
        "CAMBIOS DE OPENSPEC:",
        "  openspec/changes/add-2fa",
        "  openspec/changes/b",
        "SIGUIENTE: importa uno con `specty import <carpeta>`.",
      ].join("\n"),
    );
    const none = importListCard([], EN);
    expect(none.blocks[0]?.lines).toEqual([
      "There is no OpenSpec change to import in openspec/changes/.",
    ]);
    expect(none.next).toBe('create the change with `specty new "<title>"`.');
  });
});
