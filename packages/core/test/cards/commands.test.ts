// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  auditRefusalCard,
  type CardContext,
  delegationChoices,
  delegationNoteTitle,
  delegationQuestion,
  exportedCard,
  exportRefusalCard,
  invalidPortCard,
  renderText,
  uiOpenedCard,
  uiStoppedCard,
  whyRefusalCard,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

describe("the cards of `specty ui`", () => {
  it("refuse a port that is not one", () => {
    const card = invalidPortCard("abc", ES);
    expect(card.status).toBe("invalid");
    expect(renderText(card, "es")).toBe(
      "SPECTY · ui\nPuerto no válido: abc.\nSIGUIENTE: usa `--port` con un número de 1 a 65535.",
    );
  });

  it("give the link, and say whether the person decides from it", () => {
    expect(renderText(uiOpenedCard("http://localhost:4173/?t=x", true, ES), "es")).toBe(
      [
        "SPECTY · ui",
        "Los cambios de todas las worktrees, en http://localhost:4173/?t=x",
        "Desde la UI puedes aprobar, decidir el alcance, aceptar y cerrar.",
        "SIGUIENTE: abre el enlace en tu navegador; Ctrl+C cierra el servidor.",
      ].join("\n"),
    );
    expect(uiOpenedCard("http://localhost:4173", false, EN).blocks[0]?.lines[1]).toBe(
      "Read only: the agent started it. To decide from the UI, start it yourself with `specty ui`.",
    );
    expect(renderText(uiStoppedCard(EN), "en")).toBe(
      "SPECTY · ui\nServer stopped.\nNEXT: open it again with `specty ui`.",
    );
  });
});

describe("the cards of `specty export`", () => {
  it("refuse without a known format or a change, and say how to ask", () => {
    const none = exportRefusalCard({ reason: "no-format" }, ES);
    expect(none.status).toBe("invalid");
    expect(renderText(none, "es")).toBe(
      "SPECTY · export\nFalta el formato.\nSIGUIENTE: elige uno: `specty export --to openspec`, `--to speckit` o `--to kiro`.",
    );
    expect(
      exportRefusalCard({ reason: "unknown-format", format: "jira" }, EN).blocks[0]?.lines,
    ).toEqual(["I do not know the format jira."]);
    expect(exportRefusalCard({ reason: "no-active", format: "kiro" }, ES).blocks[0]?.lines).toEqual(
      ["No hay un cambio activo en esta carpeta."],
    );
    const missing = exportRefusalCard({ reason: "no-change", id: "x", format: "kiro" }, EN);
    expect(renderText(missing, "en")).toBe(
      "SPECTY · export\nThere is no change x.\nNEXT: name it with `specty export <id> --to kiro`.",
    );
  });

  it("list what they wrote, and where", () => {
    expect(
      renderText(exportedCard("Kiro", ".specty/exports/kiro", ["a.md", "b.md"], ES), "es"),
    ).toBe(
      [
        "SPECTY · export",
        "EN Kiro, EN .specty/exports/kiro:",
        "  a.md",
        "  b.md",
        "SIGUIENTE: revísalos y cópialos donde los espere la herramienta; con `--out .` se escriben en la raíz del repositorio.",
      ].join("\n"),
    );
    expect(exportedCard("Spec Kit", ".", [], EN).next).toMatch(/^check them and copy them/);
  });
});

describe("a refused `why`", () => {
  it("names a file without history, or a line it does not have", () => {
    const none = whyRefusalCard({ reason: "no-history", file: "src/a.ts" }, ES);
    expect(none.status).toBe("invalid");
    expect(renderText(none, "es")).toBe(
      "SPECTY · why\nsrc/a.ts no tiene historia en git.\nSIGUIENTE: revisa la ruta, relativa a la raíz del repositorio, y la línea.",
    );
    expect(
      whyRefusalCard({ reason: "no-line", file: "src/a.ts", line: "90" }, EN).blocks[0]?.lines,
    ).toEqual(["src/a.ts has no line 90."]);
  });
});

describe("a refused `audit`", () => {
  it("needs an active change or one named", () => {
    const none = auditRefusalCard({ reason: "no-active" }, ES);
    expect(none.status).toBe("invalid");
    expect(renderText(none, "es")).toBe(
      "SPECTY · audit\nNo hay un cambio activo en esta carpeta.\nSIGUIENTE: di cuál con `specty audit <id>`; `specty status` lista los abiertos.",
    );
    const missing = auditRefusalCard({ reason: "no-change", id: "x" }, EN);
    expect(missing.blocks[0]?.lines).toEqual(["There is no change x."]);
    expect(missing.next).toBe(
      "name it with `specty audit <id>`; `specty status` lists the open ones.",
    );
  });
});

describe("turning delegated mode on", () => {
  it("asks, with keeping the decisions as the default answer", () => {
    expect(delegationNoteTitle("es")).toBe("Modo delegado");
    expect(delegationQuestion("en")).toBe("Turn delegated mode on?");
    expect(delegationChoices("es")).toEqual([
      { value: "no", label: "No, sigo decidiendo yo" },
      { value: "yes", label: "Sí, que decida mi agente" },
    ]);
  });
});
