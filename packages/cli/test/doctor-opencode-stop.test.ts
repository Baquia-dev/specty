// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { cli, read, tempRepo, writeFiles } from "./support";

const PACKAGE = { "package.json": '{"name":"x","scripts":{"test":"true"}}\n' };
const PLUGIN = ".opencode/plugins/specty.js";

/** What `doctor` says while the end of turn of OpenCode's plugin is off. */
const MISSING =
  "OpenCode: falta el fin de turno de Specty (`hook agent-stop`), que devuelve al agente a `specty wait` cuando el cambio espera a la persona; ejecuta `specty init`.";

describe("doctor and the end of turn of OpenCode's plugin", () => {
  it("AC2: says it is missing while STOP is off, and nothing once it is on, with CHECK off or on", async () => {
    const root = await tempRepo(PACKAGE);
    expect((await cli(root, ["init", "--language", "es", "--tools", "opencode"])).code).toBe(0);
    const plugin = await read(root, PLUGIN);
    expect(plugin).toMatch(/^const STOP = \d+;$/m);
    expect(plugin).toMatch(/^const CHECK = false;$/m);
    expect((await cli(root, ["doctor"])).out).not.toContain(MISSING);
    const checked = plugin.replace(/^const CHECK = false;$/m, "const CHECK = true;");
    await writeFiles(root, { [PLUGIN]: checked });
    expect((await cli(root, ["doctor"])).out).not.toContain(MISSING);
    await writeFiles(root, {
      [PLUGIN]: plugin.replace(/^const STOP = \d+;$/m, "const STOP = null;"),
    });
    const doctor = await cli(root, ["doctor"]);
    expect(doctor.out).toContain(MISSING);
    expect(doctor.code).toBe(1);
  });
});
