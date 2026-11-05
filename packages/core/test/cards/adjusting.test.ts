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

/** An epic the agent adjusts while its slices are implemented, to split one that came out XL. */
const EPIC: ChangeView = {
  ...ADJUSTING,
  id: "20261105-bandeja",
  kind: "epic",
  specPath: ".specty/changes/20261105-bandeja/spec.md",
  adjustment: "C4 sale XL: divídelo",
};

const card = (lang: Lang, change = ADJUSTING) => {
  const ctx: CardContext = { lang, command: "specty", quickMaxFiles: 3, implicitTests: true };
  return renderText(nextCard({ change, dirty: [] }, ctx), lang);
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

  it("AC1: tells an epic how to split a slice, and not how to classify tasks", () => {
    const es = card("es", EPIC);
    expect(es).toContain("PETICIÓN:\n  C4 sale XL: divídelo");
    expect(es).toContain(
      "Un corte que sale demasiado grande: estréchalo a lo que cabe en un cambio (su título y su `ac` en «Cortes», y su propia spec en su carpeta si ya empezó) y añade el resto como cortes nuevos, con ids nuevos, su `ac` y su `depends`.",
    );
    expect(es).toContain("No cambies ni borres los cortes cerrados; usa ids nuevos.");
    expect(es).toContain(
      "SIGUIENTE: edita .specty/changes/20261105-bandeja/spec.md y ejecuta `specty propose`.",
    );
    expect(es).not.toContain("type: fix");
    const en = card("en", EPIC);
    expect(en).toContain(
      'A slice that comes out too large: narrow it to what fits in one change (its title and `ac` in "Slices", and its own spec in its folder if it already started) and add the rest as new slices, with new ids, their `ac` and their `depends`.',
    );
    expect(en).toContain("Do not modify or remove closed slices; use new ids.");
    expect(en).not.toContain("type: fix");
  });
});
