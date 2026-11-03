// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, CHANGE, cli, folderOf, git, inWorktree, read, tempRepo } from "./support";

/** `new` of another change in a worktree of its own. */
const another = (root: string, title: string, ...args: string[]) =>
  cli(root, ["new", "--worktree", title, ...args]);

const PERSONALIZE = CHANGE.replace("saludo-personalizado", "personalizar-el-saludo");

describe("specty new before an open change it may duplicate", () => {
  it("AC1: refuses a title like an open change's, naming it, its phase and its folder", async () => {
    const { root } = await inWorktree();
    const refused = await another(root, "Personalizar el saludo");
    expect(refused.code).not.toBe(0);
    expect(refused.out).toContain(
      `Puede duplicar un cambio abierto:\n  ${CHANGE} (draft, en .worktrees/${CHANGE}) — «Saludo personalizado»: título parecido`,
    );
    expect(refused.out).toContain(
      `pregúntale al usuario si es otro trabajo; si lo es, vuelve a ejecutar \`specty new\` con \`--distinct-from ${CHANGE}\`.`,
    );
    expect(git(root, "branch", "--list", `specty/${PERSONALIZE}`)).toBe("");
  });

  it("AC1: refuses a request like an open change's", async () => {
    const root = await tempRepo(APP);
    const request = ["--request", "Exportar las notas de los alumnos a CSV"];
    expect((await another(root, "Saludo personalizado", ...request)).code).toBe(0);
    const refused = await another(
      root,
      "Informe para secretaría",
      "--request",
      "Exportar a CSV las notas de alumnos",
    );
    expect(refused.code).not.toBe(0);
    expect(refused.out).toContain("— «Saludo personalizado»: petición parecida");
  });

  it("AC2: refuses a change that follows the same change as an open one", async () => {
    const root = await tempRepo(APP);
    expect((await another(root, "Saludo personalizado", "--follows", "20261001-base")).code).toBe(
      0,
    );
    const refused = await another(root, "Informe para secretaría", "--follows", "20261001-base");
    expect(refused.code).not.toBe(0);
    expect(refused.out).toContain("— «Saludo personalizado»: sigue también a 20261001-base");
  });

  it("AC3: creates it with --distinct-from, and notes it in the audit", async () => {
    const { root } = await inWorktree();
    const created = await another(root, "Personalizar el saludo", "--distinct-from", CHANGE);
    expect(created.code).toBe(0);
    const audit = await read(
      folderOf(root, PERSONALIZE),
      `.specty/changes/${PERSONALIZE}/audit.jsonl`,
    );
    expect(JSON.parse(audit.split("\n")[0] ?? "")).toMatchObject({
      event: "change.created",
      data: { distinctFrom: [CHANGE] },
    });
  });

  it("AC4: creates a change unlike any open one, or like the one it follows", async () => {
    const { root } = await inWorktree();
    expect((await another(root, "Exportar notas a CSV")).code).toBe(0);
    expect((await another(root, "Personalizar el saludo", "--follows", CHANGE)).code).toBe(0);
  });
});
