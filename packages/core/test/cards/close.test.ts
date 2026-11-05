// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  alreadyClosedLine,
  type CardContext,
  cancelCommitSubject,
  cancelledCard,
  cancelledFolderStaysLine,
  cancelledLine,
  cancelQuestion,
  cancelReasonQuestion,
  closeCommitSubject,
  closedLine,
  confirmCloseQuestion,
  landQuestion,
  resolvedIntegrationNote,
  section,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

describe("closing a change", () => {
  it("shows what the agent did to incorporate the main branch", () => {
    expect(
      resolvedIntegrationNote({ target: "main", commit: "a1b2c3d", conflicts: ["src/a.ts"] }, "es"),
    ).toEqual({
      title: "Incorporación resuelta por el agente",
      text: "main entró con el merge a1b2c3d.\nConflictos resueltos: src/a.ts.",
    });
    expect(
      resolvedIntegrationNote({ target: "main", commit: "a1b2c3d", conflicts: [] }, "en").text,
    ).toBe("main came in with merge a1b2c3d.\nIt fixed what failed the verification.");
  });

  it("asks to confirm, and says what it archived", () => {
    expect(confirmCloseQuestion("es")).toBe("¿Confirmar el cierre?");
    expect(closedLine("a1b2c3d", "en")).toBe("Change closed and archived (commit a1b2c3d).");
    expect(closeCommitSubject("Saludo", "es")).toBe("docs(spec): cerrar Saludo");
    expect(closeCommitSubject("Greeting", "en")).toBe("docs(spec): close Greeting");
  });

  it("retries the incorporation of a change already closed", () => {
    expect(landQuestion("specty/x", "main", "es")).toBe("¿Incorporar specty/x a main?");
    expect(landQuestion("specty/x", "main", "en")).toBe("Merge specty/x into main?");
    expect(alreadyClosedLine("es")).toBe("El cambio ya estaba cerrado y archivado.");
  });
});

describe("cancelling a change", () => {
  it("asks why and to confirm, and says what it archived", () => {
    expect(cancelReasonQuestion("es")).toBe("¿Por qué lo cancelas?");
    expect(cancelQuestion("20261020-saludo", "en")).toBe("Cancel 20261020-saludo?");
    expect(cancelledLine("a1b2c3d", "es")).toBe("Cambio cancelado y archivado (commit a1b2c3d).");
    expect(cancelCommitSubject("20261020-saludo", "es")).toBe(
      "docs(spec): cancelar 20261020-saludo",
    );
  });

  it("AC6: says why the change's folder stays, in Spanish and in English", () => {
    expect(cancelledFolderStaysLine("/w/x", "uncommitted", ES)).toBe(
      "La carpeta /w/x queda: tiene cambios sin commit, que se perderían. Cuando ya no los necesites, descártalos y `specty prune` la quitará.",
    );
    expect(cancelledFolderStaysLine("/w/x", "uncommitted", EN)).toBe(
      "Folder /w/x stays: it has uncommitted changes, which would be lost. Once you no longer need them, discard them and `specty prune` will remove it.",
    );
    expect(cancelledFolderStaysLine("/w/x", "working", ES)).toBe(
      "La carpeta /w/x queda: una sesión de agente trabaja en ella. `specty prune` la quitará cuando ya ninguna sesión trabaje en ella.",
    );
    expect(cancelledFolderStaysLine("/w/x", "working", EN)).toBe(
      "Folder /w/x stays: an agent session works in it. `specty prune` will remove it once no session works in it.",
    );
  });

  it("AC6: the card says what became of the folder after the branch, when it has one", () => {
    const branch = { name: "specty/x", withCode: false };
    const kept = "Branch specty/x keeps the spec and its record; it is not merged.";
    expect(cancelledCard("SPECTY · x", "Cancelled.", branch, EN, "Folder line.").blocks).toEqual(
      section(undefined, ["Cancelled.", kept, "Folder line."]),
    );
    expect(cancelledCard("SPECTY · x", "Cancelled.", branch, EN).blocks).toEqual(
      section(undefined, ["Cancelled.", kept]),
    );
  });
});
