// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, cli, tempRepo } from "./support";

/**
 * The user's literal request, the same for every change the session hands to a subagent, as the
 * card with no change active asks (P265).
 */
const REQUEST = "Procede con los pendientes 260, 261 y 262 aprobando, aceptando y cerrando";

/** `new` of a change in a worktree of its own, with `args` after its title. */
const another = (root: string, title: string, ...args: string[]) =>
  cli(root, ["new", "--worktree", title, ...args]);

/** What the subagent of one change of `REQUEST` runs, as its brief says. */
const bySubagent = (root: string, title: string) =>
  another(root, title, "--request", REQUEST, "--subagent");

/** A repository where a subagent already created the first change of `REQUEST`. */
async function firstOfRequest(): Promise<string> {
  const root = await tempRepo(APP);
  expect((await bySubagent(root, "Saludo personalizado")).code).toBe(0);
  return root;
}

describe("specty new --subagent with the user's same literal request (P265)", () => {
  it("creates the other changes of the request, with titles of their own, without --distinct-from", async () => {
    const root = await firstOfRequest();
    for (const title of ["Exportar notas a CSV", "Informe para secretaría"]) {
      const created = await bySubagent(root, title);
      expect(created.out).not.toContain("Puede duplicar");
      expect(created.code, created.out).toBe(0);
    }
  });

  it("is the same request without the spaces at its ends", async () => {
    const root = await firstOfRequest();
    const spaced = ["--request", `  ${REQUEST} `, "--subagent"];
    const created = await another(root, "Exportar notas a CSV", ...spaced);
    expect(created.code, created.out).toBe(0);
  });

  it("still refuses a title like an open change's of the same request", async () => {
    const root = await firstOfRequest();
    const refused = await bySubagent(root, "Personalizar el saludo");
    expect(refused.code).not.toBe(0);
    expect(refused.out).toContain("— «Saludo personalizado»: título parecido");
  });

  it("still refuses a request like an open change's that is not the same", async () => {
    const root = await firstOfRequest();
    const like = "Procede con los pendientes 263, 264 y 265 aprobando, aceptando y cerrando";
    const refused = await another(root, "Exportar notas a CSV", "--request", like, "--subagent");
    expect(refused.code).not.toBe(0);
    expect(refused.out).toContain("— «Saludo personalizado»: petición parecida");
  });

  it("still refuses the same request without --subagent", async () => {
    const root = await firstOfRequest();
    const refused = await another(root, "Exportar notas a CSV", "--request", REQUEST);
    expect(refused.code).not.toBe(0);
    expect(refused.out).toContain("— «Saludo personalizado»: petición parecida");
  });
});
