// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  alreadyClosedLine,
  cancelCommitSubject,
  cancelledLine,
  cancelQuestion,
  cancelReasonQuestion,
  closeCommitSubject,
  closedLine,
  confirmCloseQuestion,
  landQuestion,
  resolvedIntegrationNote,
} from "../../src";

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
});
