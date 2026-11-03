// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, CONFIG, cli, tempRepo, tryGit } from "./support";

/** An agent that Specty recognizes: Claude Code. */
const CLAUDE = { env: { CLAUDECODE: "1" } };

const KINDS = "`--kind pending|improvement|reminder|decision|lesson`";

describe("`specty memory add` with a kind it does not know", () => {
  it("refuses it with its own card in the project's language, and adds nothing", async () => {
    const root = await tempRepo(APP);
    const refused = await cli(root, ["memory", "add", "Algo", "--kind", "bug"], CLAUDE);
    expect(refused.code).toBe(1);
    expect(refused.out).toContain("Tipo de entrada desconocido: bug.");
    expect(refused.out).toContain(`SIGUIENTE: usa ${KINDS}.`);
    expect(refused.err).not.toContain("error: option");
    expect(tryGit(root, "rev-parse", "--verify", "--quiet", "specty-memory").status).not.toBe(0);
  });

  it("says it in English in an English project, and still adds a known kind", async () => {
    const config = CONFIG().replace("language: es", "language: en");
    const root = await tempRepo({ ...APP, ".specty/config.yaml": config });
    const refused = await cli(root, ["memory", "add", "Something", "--kind", "Idea"], CLAUDE);
    expect(refused.code).toBe(1);
    expect(refused.out).toContain("Unknown entry kind: Idea.");
    expect(refused.out).toContain(`NEXT: use ${KINDS}.`);
    const added = await cli(
      root,
      ["memory", "add", "Something", "--kind", "lesson", "--path", "src/**"],
      CLAUDE,
    );
    expect(added.code).toBe(0);
  });
});
