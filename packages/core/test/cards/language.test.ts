// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  flowBlock,
  languageChoices,
  languageLine,
  languageQuestion,
  notInitializedCard,
} from "../../src";

const ctx = (lang: CardContext["lang"]): CardContext => ({
  lang,
  command: "specty",
  quickMaxFiles: 3,
  implicitTests: true,
});

describe("the language of Specty", () => {
  it("is asked in both languages, with the detected one first (AC1)", () => {
    expect(languageQuestion()).toBe(
      "¿En qué idioma trabaja Specty? · Which language should Specty work in?",
    );
    expect(languageChoices("es")).toEqual([
      { value: "es", label: "Español" },
      { value: "en", label: "English" },
    ]);
    expect(languageChoices("en").map((choice) => choice.value)).toEqual(["en", "es"]);
  });

  it("says when init changed it (AC3)", () => {
    expect(languageLine("es")).toBe(".specty/config.yaml: Specty trabaja ahora en español.");
    expect(languageLine("en")).toBe(".specty/config.yaml: Specty now works in English.");
  });

  it("is the one the agent talks to the user in, without a line more (AC4)", () => {
    const es = flowBlock("es", "specty").split("\n");
    expect(es[1]).toMatch(/`SIGUIENTE:`\. Habla con el usuario en español\.$/);
    expect(es.length).toBeLessThanOrEqual(15);
    const en = flowBlock("en", "specty").split("\n");
    expect(en[1]).toMatch(/`NEXT:` line\. Talk to the user in English\.$/);
  });

  it("is passed by an agent that sets Specty up (AC5)", () => {
    expect(notInitializedCard(ctx("es")).next).toBe(
      "si el usuario quiere usarlo, ejecuta `specty init --language <es|en>` con el idioma en que te habla.",
    );
    expect(notInitializedCard(ctx("en")).next).toBe(
      "if the user wants to use it, run `specty init --language <es|en>` with the language they speak to you in.",
    );
  });
});
