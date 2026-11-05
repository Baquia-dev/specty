// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { adjustRefusalCard, type CardContext, renderText } from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };
const HEADER = "SPECTY · 20261020-saludo · acceptance";

describe("the cards of a refused `adjust`", () => {
  it("are invalid without the user's request, and say how to pass it", () => {
    const card = adjustRefusalCard({ reason: "no-request" }, HEADER, ES);
    expect(card.status).toBe("invalid");
    expect(renderText(card, "es")).toBe(
      [
        HEADER,
        "Falta la petición del usuario.",
        'SIGUIENTE: ejecuta `specty adjust "<petición literal>"`.',
      ].join("\n"),
    );
    expect(adjustRefusalCard({ reason: "no-request" }, HEADER, EN).next).toBe(
      'run `specty adjust "<literal request>"`.',
    );
  });

  it("send the agent to `next` outside the acceptance", () => {
    const card = adjustRefusalCard({ reason: "not-in-acceptance" }, HEADER, EN);
    expect(card.status).toBe("blocked");
    expect(renderText(card, "en")).toBe(
      [
        HEADER,
        "Adjustments are requested while the result is in acceptance.",
        "NEXT: run `specty next`.",
      ].join("\n"),
    );
  });

  it("AC4: name both phases of an epic's adjustments", () => {
    const epic = "SPECTY · 20261105-bandeja · review";
    const card = adjustRefusalCard({ reason: "not-in-acceptance", epic: true }, epic, ES);
    expect(card.status).toBe("blocked");
    expect(renderText(card, "es")).toBe(
      [
        epic,
        "Los ajustes de una épica se piden mientras se implementan sus cortes o con el resultado en aceptación.",
        "SIGUIENTE: ejecuta `specty next`.",
      ].join("\n"),
    );
    expect(
      renderText(adjustRefusalCard({ reason: "not-in-acceptance", epic: true }, epic, EN), "en"),
    ).toBe(
      [
        epic,
        "An epic's adjustments are requested while its slices are implemented or with the result in acceptance.",
        "NEXT: run `specty next`.",
      ].join("\n"),
    );
  });

  it("send the agent to finish a merge still in progress first", () => {
    const card = adjustRefusalCard({ reason: "merging", target: "main" }, HEADER, ES);
    expect(card.status).toBe("blocked");
    expect(renderText(card, "es")).toBe(
      [
        HEADER,
        "El merge de main sigue en curso en esta carpeta: los ajustes se piden cuando termine.",
        "SIGUIENTE: termina la incorporación con `specty integrate` (`specty next` te dice qué falta) y vuelve a ejecutar `specty adjust`.",
      ].join("\n"),
    );
    expect(
      renderText(adjustRefusalCard({ reason: "merging", target: "main" }, HEADER, EN), "en"),
    ).toBe(
      [
        HEADER,
        "The merge of main is still in progress in this folder: adjustments are requested once it is done.",
        "NEXT: finish the incorporation with `specty integrate` (`specty next` says what is missing) and run `specty adjust` again.",
      ].join("\n"),
    );
  });
});
