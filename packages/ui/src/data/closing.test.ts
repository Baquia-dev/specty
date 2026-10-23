// SPDX-License-Identifier: Apache-2.0
import { closingOf } from "./closing";

const SPANISH = `### Resumen

La pestaña Aceptación tiene la vista «Cambios».

### Desviaciones (respecto al plan)

- **Ajuste en la revisión 2:** la franja fija.

### Decisiones

- **El diff anterior espera atenuado.**

### Pendientes

- **El servidor local.**
- **La parte fija en el teléfono.**`;

describe("closingOf", () => {
  it("splits the closing into the parts the CLI asks for (AC1)", () => {
    expect(closingOf(SPANISH)).toEqual({
      summary: "La pestaña Aceptación tiene la vista «Cambios».",
      deviations: "- **Ajuste en la revisión 2:** la franja fija.",
      decisions: "- **El diff anterior espera atenuado.**",
      pending: "- **El servidor local.**\n- **La parte fija en el teléfono.**",
      other: "",
    });
  });

  it("reads the English headings too", () => {
    const parts = closingOf(
      "### Summary\nDone.\n### Deviations (from the plan)\nNone.\n### Decisions\nKept it.\n### Follow-ups\nThe server.",
    );
    expect(parts).toEqual({
      summary: "Done.",
      deviations: "None.",
      decisions: "Kept it.",
      pending: "The server.",
      other: "",
    });
    expect(closingOf("### Pending\nLater.").pending).toBe("Later.");
  });

  it("keeps what is no part, with its heading, so nothing is lost (AC1)", () => {
    const parts = closingOf(
      "Recordatorios enviados con la cola existente.\n\n### Resumen\nHecho.\n\n### Riesgos\nNinguno nuevo.",
    );
    expect(parts.summary).toBe("Hecho.");
    expect(parts.other).toBe(
      "Recordatorios enviados con la cola existente.\n\n### Riesgos\nNinguno nuevo.",
    );
  });

  it("keeps a part written twice, and reads headings by how they begin, in any case", () => {
    const parts = closingOf(
      "### RESUMEN ###\nUno.\n### Pendientes\nA.\n### Resumen del cambio\nDos.",
    );
    expect(parts.summary).toBe("Uno.\nDos.");
    expect(parts.pending).toBe("A.");
  });

  it("takes headings in a fenced code block as code", () => {
    const parts = closingOf(
      "### Decisiones\n```md\n### Resumen\n```\n~~~\n### Pendientes\n~~~\nFin.",
    );
    expect(parts.decisions).toBe("```md\n### Resumen\n```\n~~~\n### Pendientes\n~~~\nFin.");
    expect(parts.summary).toBe("");
    expect(parts.pending).toBe("");
  });

  it("gives empty parts for an empty closing, and reads Windows line ends", () => {
    expect(closingOf("")).toEqual({
      summary: "",
      deviations: "",
      decisions: "",
      pending: "",
      other: "",
    });
    expect(closingOf("### Resumen\r\nHecho.\r\n").summary).toBe("Hecho.");
    // A level-2 or level-4 heading is the part's own text.
    expect(closingOf("### Resumen\n#### Detalle\nTexto.").summary).toBe("#### Detalle\nTexto.");
  });
});
