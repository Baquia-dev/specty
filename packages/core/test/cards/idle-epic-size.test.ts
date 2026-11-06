// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { type CardContext, type ChangeView, type NextView, nextCard, renderText } from "../../src";

const ES: CardContext = {
  lang: "es",
  command: "specty",
  quickMaxFiles: 3,
  implicitTests: true,
  tool: "claude-code",
};
const EN: CardContext = { ...ES, lang: "en" };

const card = (view: NextView, ctx: CardContext) => renderText(nextCard(view, ctx), ctx.lang);
const idle = (ctx: CardContext) => card({ dirty: [] }, ctx);

const STEP =
  "Si `propose` dice que el cambio es demasiado grande y pide dividirlo en una épica, no lo conviertas tú: detente y responde con eso, que la épica la hace la sesión principal en tu cambio.";
const STEP_EN =
  "If `propose` says the change is too large and asks to split it into an epic, do not turn it into one yourself: stop and answer with that, since the main session makes the epic in your change.";

describe("a subagent whose change comes out the size of an epic leaves it to the main session", () => {
  it("AC1: the change's brief asks to stop, between the question to the user and the answer", () => {
    expect(idle(ES)).toContain(
      [
        "  5. Si para la spec te falta una respuesta del usuario, no la supongas: detente y responde con la pregunta.",
        `  6. ${STEP}`,
        "  7. Responde en tres líneas: el cambio, su fase y lo que falta.",
      ].join("\n"),
    );
  });

  it("AC2: the card's next step asks the main session to turn that change into the epic", () => {
    const next = idle(ES).split("\n").at(-1) ?? "";
    expect(next.startsWith("SIGUIENTE: lanza un subagente por cada cambio")).toBe(true);
    expect(
      next.endsWith(
        "Si uno vuelve con una pregunta, házsela al usuario y pásale la respuesta (en Claude Code, con `SendMessage`). Cuando terminen, si uno volvió porque su cambio es demasiado grande, entra tú en él (`specty enter <id>`) y conviértelo allí en la épica; si no, vuelve a ejecutar `specty next` aquí.",
      ),
    ).toBe(true);
  });

  it("AC3: in English, and not in the brief of an epic's slice", () => {
    const text = idle(EN);
    expect(text).toContain(
      [
        "  5. If the spec needs an answer from the user, do not assume it: stop and answer with the question.",
        `  6. ${STEP_EN}`,
        "  7. Answer in three lines: the change, its phase and what is left.",
      ].join("\n"),
    );
    expect(text.split("\n").at(-1)).toMatch(
      /If one comes back with a question, ask the user and pass it the answer \(in Claude Code, with `SendMessage`\)\. Once they finish, if one came back because its change is too large, enter it yourself \(`specty enter <id>`\) and turn it into the epic there; otherwise, run `specty next` again here\.$/,
    );
    const epic: ChangeView = {
      id: "20261024-panel",
      kind: "epic",
      phase: "implementing",
      title: "Panel",
      specPath: ".specty/changes/20261024-panel/spec.md",
      revision: 1,
      tasks: [],
      conventions: [],
      pendingScope: [],
      rejected: [],
      closingSubmitted: false,
      specChanged: false,
      slices: [{ id: "C1", title: "Corte C1", depends: [], status: "ready" }],
    };
    const slices = card({ change: epic, dirty: [] }, ES);
    expect(slices).toContain("ENCARGO C1:");
    expect(slices).not.toContain(STEP);
    expect(slices).not.toContain("demasiado grande y pide dividirlo en una épica");
  });
});
