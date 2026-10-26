// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  noActiveChangeCard,
  notProposableCard,
  renderText,
  revisionLabel,
  runNext,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

describe("the refusals several commands share", () => {
  it("send the agent to `next`", () => {
    expect(runNext(ES)).toBe("ejecuta `specty next`.");
    expect(runNext({ ...EN, command: "npx -y @baquia-dev/specty" })).toBe(
      "run `npx -y @baquia-dev/specty next`.",
    );
  });

  it("say there is no active change, with the way on of whoever asked", () => {
    const agent = noActiveChangeCard("agent", ES);
    expect(agent.status).toBe("blocked");
    expect(renderText(agent, "es")).toBe(
      "SPECTY\nNo hay un cambio activo.\nSIGUIENTE: ejecuta `specty next`.",
    );
    expect(noActiveChangeCard("person", ES).next).toBe("revisa `specty status`.");
    expect(noActiveChangeCard("person", EN).next).toBe("check `specty status`.");
    const ui = noActiveChangeCard("ui", EN);
    expect(renderText(ui, "en")).toBe("SPECTY\nThere is no active change.\nNEXT: reload the UI.");
  });
});

describe("the texts of `propose`", () => {
  it("refuse a phase without a spec to propose", () => {
    const card = notProposableCard("20261020-saludo", "implementing", ES);
    expect(card.status).toBe("blocked");
    expect(renderText(card, "es")).toBe(
      [
        "SPECTY · 20261020-saludo · implementing",
        "En la fase implementing la spec no se propone.",
        "SIGUIENTE: ejecuta `specty next`.",
      ].join("\n"),
    );
    expect(notProposableCard("20261020-saludo", "done", EN).blocks[0]?.lines).toEqual([
      "The spec is not proposed in the done phase.",
    ]);
  });

  it("name the revision in the header", () => {
    expect(revisionLabel(3, "es")).toBe("revisión 3");
    expect(revisionLabel(1, "en")).toBe("revision 1");
  });
});
