// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, CHANGE, CONFIG, cli, folderOf, git, tempRepo } from "./support";

const PORTED = { ...APP, ".specty/config.yaml": `${CONFIG()}dev:\n  ports: [4200, 5173]\n` };
const EXPORT = CHANGE.replace("saludo-personalizado", "exportar-notas");

/** The line with the ports of a folder, as the cards say it. */
const ports = (list: string) =>
  `Puertos de desarrollo de esta carpeta: ${list}. Arranca aquí los servidores de desarrollo con ellos`;

/** `new` of a change in a worktree of its own. */
const another = (root: string, title: string) => cli(root, ["new", "--worktree", title]);

describe("the development ports of each change's folder", () => {
  it("AC1: new tells each new folder its own ports", async () => {
    const root = await tempRepo(PORTED);
    const first = await another(root, "Saludo personalizado");
    expect(first.code).toBe(0);
    expect(first.out).toContain(ports("4201, 5174"));
    const second = await another(root, "Exportar notas");
    expect(second.out).toContain(ports("4202, 5175"));
  });

  it("AC2: next tells them in a change's folder, and nothing in the main folder", async () => {
    const root = await tempRepo(PORTED);
    await another(root, "Saludo personalizado");
    await another(root, "Exportar notas");
    expect((await cli(folderOf(root, EXPORT), ["next"])).out).toContain(ports("4202, 5175"));
    expect((await cli(folderOf(root), ["next"])).out).toContain(ports("4201, 5174"));
    expect((await cli(root, ["next"])).out).not.toContain("Puertos de desarrollo");
  });

  it("AC3: a folder that no longer exists frees its place for the next new one", async () => {
    const root = await tempRepo(PORTED);
    await another(root, "Saludo personalizado");
    await another(root, "Exportar notas");
    git(root, "worktree", "remove", "--force", folderOf(root));
    expect((await another(root, "Tercer cambio")).out).toContain(ports("4201, 5174"));
  });

  it("AC4: without dev.ports, neither new nor next says anything of ports", async () => {
    const root = await tempRepo(APP);
    const created = await another(root, "Saludo personalizado");
    expect(created.code).toBe(0);
    expect(created.out).not.toContain("Puertos de desarrollo");
    expect((await cli(folderOf(root), ["next"])).out).not.toContain("Puertos de desarrollo");
  });
});
