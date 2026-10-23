// SPDX-License-Identifier: Apache-2.0
import type { DiffPart } from "./records";
import { codeTokens, textAndBefore, wordDiff } from "./word-diff";

const changed = (parts: readonly DiffPart[], change: DiffPart["change"]) =>
  parts
    .filter((part) => part.change === change)
    .map((part) => part.text)
    .join("|");

describe("wordDiff", () => {
  it("keeps what did not change and marks the words removed and added (AC1)", () => {
    const parts = wordDiff("La página carga rápido.", "La página carga en menos de 2 s.");
    expect(parts[0]).toEqual({ text: "La página carga " });
    expect(changed(parts, "removed")).toBe("rápido");
    expect(changed(parts, "added")).toBe("en menos de 2 s");
    // Punctuation is a token of its own: the final period is kept, not removed and added.
    expect(parts.at(-1)).toEqual({ text: "." });
  });

  it("returns one unchanged part for equal texts, and only additions from nothing", () => {
    expect(wordDiff("Igual que antes.", "Igual que antes.")).toEqual([
      { text: "Igual que antes." },
    ]);
    expect(wordDiff("", "Nuevo")).toEqual([{ text: "Nuevo", change: "added" }]);
  });

  it("shows a very long text whole, removed and then added", () => {
    const long = "palabra ".repeat(400);
    expect(wordDiff(long, `${long}más`)).toEqual([
      { text: long, change: "removed" },
      { text: `${long}más`, change: "added" },
    ]);
  });

  it("cuts code at every sign, so only what changed is marked", () => {
    const prose = wordDiff("limit=3;", "limit=4;");
    expect(changed(prose, "added")).toBe("limit=4");
    const code = wordDiff("limit=3;", "limit=4;", codeTokens);
    expect(changed(code, "removed")).toBe("3");
    expect(changed(code, "added")).toBe("4");
    expect(codeTokens("a.b(c_d, $e)")).toEqual(["a", ".", "b", "(", "c_d", ",", " ", "$e", ")"]);
  });
});

describe("textAndBefore", () => {
  it("gives the final text with the additions, and no «Antes» when nothing was removed (AC1)", () => {
    expect(textAndBefore("queda justificada.", "queda justificada y avisa.")).toEqual({
      text: [{ text: "queda justificada" }, { text: " y avisa", change: "added" }, { text: "." }],
    });
  });

  it("adds «Antes» with the removed words only when something was removed (AC1)", () => {
    const { text, before } = textAndBefore(
      "Basta con una foto; no hace falta el original.",
      "Basta con una foto o un PDF; el original ya no se pide.",
    );
    expect(changed(text, "added")).toBe(" o un PDF| ya no se pide");
    expect(changed(text, "removed")).toBe("");
    expect(text.map((part) => part.text).join("")).toBe(
      "Basta con una foto o un PDF; el original ya no se pide.",
    );
    expect(changed(before ?? [], "removed")).toBe("no hace falta ");
    expect((before ?? []).map((part) => part.text).join("")).toBe(
      "Basta con una foto; no hace falta el original.",
    );
  });
});
