// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  duplicateCard,
  duplicateReason,
  renderText,
  type StatusEntry,
  similarTexts,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

const OPEN: StatusEntry = {
  id: "20261103-saludo",
  kind: "standard",
  phase: "implementing",
  title: "Saludo personalizado",
  waitingFor: "agent",
  current: false,
  pendingScope: [],
  folder: "../repo.worktrees/20261103-saludo",
  holder: { tool: "codex", ago: 5 },
};

describe("when two texts are alike", () => {
  it("AC1: when they share half the significant words of the shorter, by their roots", () => {
    expect(similarTexts("Exportar el informe de notas a CSV", "Exportar notas a CSV")).toBe(true);
    expect(similarTexts("Saludo personalizado", "Personalizar el saludo")).toBe(true);
    expect(similarTexts("Exportación de NOTAS", "exportacion notas")).toBe(true);
    expect(similarTexts("The export of grades", "Export the grades")).toBe(true);
  });

  it("AC4: not with fewer than two words in common, or without significant words", () => {
    expect(similarTexts("Exportar notas a CSV", "Importar alumnos desde CSV")).toBe(false);
    expect(similarTexts("Notas", "Exportar notas")).toBe(false);
    expect(similarTexts("de la para", "de la para")).toBe(false);
    expect(similarTexts("", "Exportar notas")).toBe(false);
  });
});

describe("why a new change looks like an open one", () => {
  const open = { title: "Saludo personalizado", follows: ["20261101-base"] };

  it("AC2: it follows the same change, before any likeness", () => {
    expect(
      duplicateReason({ title: "Otra cosa distinta", follows: ["20261101-base"] }, open),
    ).toEqual({ kind: "follows", change: "20261101-base" });
  });

  it("AC1: a title or a request like the open change's", () => {
    expect(duplicateReason({ title: "Personalizar el saludo", follows: [] }, open)).toEqual({
      kind: "title",
    });
    const asked = { ...open, request: "Exportar las notas de los alumnos a CSV" };
    expect(
      duplicateReason(
        {
          title: "Informe para secretaría",
          request: "Exportar a CSV las notas de alumnos",
          follows: [],
        },
        asked,
      ),
    ).toEqual({ kind: "request" });
  });

  it("AC4: nothing when neither is alike, or a request is missing", () => {
    expect(duplicateReason({ title: "Exportar notas a CSV", follows: [] }, open)).toBeUndefined();
    expect(
      duplicateReason(
        { title: "Informe para secretaría", request: "Exportar las notas a CSV", follows: [] },
        open,
      ),
    ).toBeUndefined();
  });
});

describe("the card of a new change that may duplicate an open one", () => {
  it("AC1: names each change, its phase, folder and holder, why, and asks the user", () => {
    const card = duplicateCard([{ change: OPEN, reason: { kind: "title" } }], ES);
    expect(card.status).toBe("blocked");
    const text = renderText(card, "es");
    expect(text).toContain(
      "Puede duplicar un cambio abierto:\n  20261103-saludo (implementing, en ../repo.worktrees/20261103-saludo, lo lleva codex, hace 5 min) — «Saludo personalizado»: título parecido",
    );
    expect(text).toContain(
      "SIGUIENTE: pregúntale al usuario si es otro trabajo; si lo es, vuelve a ejecutar `specty new` con `--distinct-from 20261103-saludo`.",
    );
    const english = renderText(
      duplicateCard([{ change: OPEN, reason: { kind: "request" } }], EN),
      "en",
    );
    expect(english).toContain(
      "It may duplicate an open change:\n  20261103-saludo (implementing, in ../repo.worktrees/20261103-saludo, held by codex, 5 min ago) — “Saludo personalizado”: similar request",
    );
    expect(english).toContain(
      "NEXT: ask the user whether it is other work; if it is, run `specty new` again with `--distinct-from 20261103-saludo`.",
    );
  });

  it("AC2: says which change both follow, and lists every id to tell apart", () => {
    const second: StatusEntry = {
      id: "20261103-otro",
      kind: "standard",
      phase: "implementing",
      title: "Otro",
      waitingFor: "agent",
      current: false,
      pendingScope: [],
    };
    const card = duplicateCard(
      [
        { change: OPEN, reason: { kind: "follows", change: "20261101-base" } },
        { change: second, reason: { kind: "title" } },
      ],
      ES,
    );
    const text = renderText(card, "es");
    expect(text).toContain("— «Saludo personalizado»: sigue también a 20261101-base");
    expect(text).toContain("  20261103-otro (implementing) — «Otro»: título parecido");
    expect(text).toContain("`--distinct-from 20261103-saludo 20261103-otro`");
    expect(
      renderText(
        duplicateCard([{ change: OPEN, reason: { kind: "follows", change: "20261101-base" } }], EN),
        "en",
      ),
    ).toContain(": it also follows 20261101-base");
  });
});
