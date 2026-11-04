// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { type CardContext, type ChangeView, type Lang, nextCard, renderText } from "../../src";

/** A standard change the person asked to adjust after a failed full verification. */
const ADJUSTING: ChangeView = {
  id: "20261104-x",
  kind: "standard",
  phase: "adjusting",
  title: "X",
  specPath: ".specty/changes/20261104-x/spec.md",
  revision: 2,
  tasks: [],
  conventions: [],
  pendingScope: [],
  rejected: [],
  closingSubmitted: false,
  specChanged: false,
  adjustment: "pnpm check falla por un error de tipos",
};

const card = (lang: Lang) => {
  const ctx: CardContext = { lang, command: "specty", quickMaxFiles: 3, implicitTests: true };
  return renderText(nextCard({ change: ADJUSTING, dirty: [] }, ctx), lang);
};

describe("the adjusting card", () => {
  it("AC2: sends a types, lint or format failure alone to a refactor task, with no red test", () => {
    expect(card("es")).toContain(
      "Fallo solo de tipos, lint o formato, sin cambiar lo que hace el código: añade una tarea `type: refactor` con `ac: —` y el comando que falló en su `verify`; no necesita un test en rojo.",
    );
    expect(card("en")).toContain(
      "A types, lint or format failure alone, which does not change what the code does: add a `type: refactor` task with `ac: —` and the failed command in its `verify`; it needs no red test.",
    );
  });
});
