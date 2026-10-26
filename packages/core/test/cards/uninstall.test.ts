// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  claudePointerStaysLine,
  globalGuardStaysLine,
  historyStaysLine,
  nothingRemovedCard,
  nothingToRemoveCard,
  removalChoices,
  removalLine,
  removalNoteTitle,
  removalPlanCard,
  removalQuestion,
  removedCard,
  renderText,
  unwatchedChangeWarning,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

describe("what `uninstall` would remove", () => {
  it("names each file, deleted whole or with Specty's part taken out", () => {
    expect(removalLine(".cursor/hooks.json", true, "es")).toBe("borrar .cursor/hooks.json");
    expect(removalLine("AGENTS.md", false, "en")).toBe("remove Specty's part of AGENTS.md");
  });

  it("says when there is nothing, or lists it in a dry run", () => {
    expect(renderText(nothingToRemoveCard(ES), "es")).toBe(
      "SPECTY · uninstall\nNo hay nada de Specty que quitar en este repositorio.\nSIGUIENTE: nada que hacer.",
    );
    expect(renderText(removalPlanCard(["remove Specty's part of AGENTS.md"], EN), "en")).toBe(
      [
        "SPECTY · uninstall",
        "WOULD REMOVE:",
        "  remove Specty's part of AGENTS.md",
        "NEXT: to remove it, run `specty uninstall` in your terminal.",
      ].join("\n"),
    );
  });

  it("asks before removing, with keeping everything as the default answer", () => {
    expect(removalNoteTitle("es")).toBe("Quitar Specty");
    expect(removalQuestion("en")).toBe("Remove Specty from this repository?");
    expect(removalChoices("es")).toEqual([
      { value: "no", label: "No, lo dejo como está" },
      { value: "yes", label: "Sí, quítalo" },
    ]);
    expect(unwatchedChangeWarning("20261020-saludo", "es")).toBe(
      "Esta carpeta tiene un cambio en curso (20261020-saludo): sin Specty, nadie vigila sus tareas.",
    );
    expect(renderText(nothingRemovedCard(EN), "en")).toBe(
      "SPECTY · uninstall\nNothing was removed.\nNEXT: nothing to do.",
    );
  });
});

describe("what `uninstall` removed", () => {
  it("lists it, with what stays on purpose", () => {
    const stays = [
      historyStaysLine("es"),
      globalGuardStaysLine("Codex", "~/.codex/hooks.json", "es"),
      claudePointerStaysLine("es"),
    ];
    expect(renderText(removedCard(["borrar .cursor/hooks.json"], stays, ES), "es")).toBe(
      [
        "SPECTY · uninstall",
        "QUITADO:",
        "  borrar .cursor/hooks.json",
        "SE QUEDA:",
        "  `.specty/`: el historial de specs y auditoría; bórrala si no lo quieres.",
        "  Codex: el guard sigue en ~/.codex/hooks.json, que sirve a todos tus repositorios y fuera de los que usan Specty no hace nada; quítalo de ahí si ya no usas Specty.",
        "  CLAUDE.md sigue importando AGENTS.md.",
        "SIGUIENTE: revisa los cambios con `git status` y haz commit cuando quieras: ya no hay hooks que lo vigilen.",
      ].join("\n"),
    );
    expect(globalGuardStaysLine("OpenCode", "p.js", "en")).toMatch(
      /^OpenCode: the guard stays in p\.js/,
    );
    expect(claudePointerStaysLine("en")).toBe("CLAUDE.md still imports AGENTS.md.");
  });
});
