// SPDX-License-Identifier: Apache-2.0
import { type CardContext, invalidConfigCard, renderText } from "@baquia-dev/specty-core";
import { describe, expect, it } from "vitest";
import { CONFIG, cli, person, tempRepo } from "./support";

const EN: CardContext = { lang: "en", command: "specty", quickMaxFiles: 3, implicitTests: true };
/** The configuration with the stray comma that reached main (P130). */
const BROKEN = CONFIG().replace(
  "  worktrees: false\n",
  '  worktrees: false\n  branchPerChange: "true,"\n',
);

describe("a folder whose configuration is not valid", () => {
  it("AC3: tells an agent that the user fixes it, with the error, and a person to fix it", async () => {
    const root = await tempRepo({ ".specty/config.yaml": BROKEN });

    const agent = await cli(root, ["next"]);
    expect(agent.code).toBe(1);
    expect(agent.out).toContain("git.branchPerChange");
    expect(agent.out).toContain(
      "SIGUIENTE: el usuario corrige .specty/config.yaml en esta carpeta (el guard no te deja editarla): pídeselo con el error de arriba.",
    );

    const human = await cli(root, ["next"], { terminal: person() });
    expect(human.code).toBe(1);
    expect(human.out).toContain("git.branchPerChange");
    expect(human.out).toContain("SIGUIENTE: corrige .specty/config.yaml.");
  });

  it("AC4: says it to an agent in English too", () => {
    expect(renderText(invalidConfigCard("mode: no válido", EN, "agent"), "en")).toBe(
      "SPECTY\nmode: no válido\nNEXT: the user fixes .specty/config.yaml in this folder (the guard does not let you edit it): ask them, with the error above.",
    );
  });
});
