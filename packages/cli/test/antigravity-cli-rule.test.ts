// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ANTIGRAVITY_CLI_DIR, cli, person, tempRepo, testEnv } from "./support";

const PACKAGE = { "package.json": '{"name":"x","scripts":{"test":"true"}}\n' };

/**
 * A folder of Antigravity CLI's own, as `SPECTY_ANTIGRAVITY_CLI_DIR` points to it, with these
 * settings if given: no test reaches the person's `~/.gemini/antigravity-cli`.
 */
async function cliFolder(settings?: string) {
  const dir = await mkdtemp(join(tmpdir(), "specty-agy-"));
  const file = join(dir, "settings.json");
  if (settings !== undefined) await writeFile(file, settings);
  return { dir, file, env: { SPECTY_ANTIGRAVITY_CLI_DIR: dir } };
}

const init = (root: string, env: Record<string, string> = {}) =>
  cli(root, ["init", "--language", "es", "--tools", "antigravity"], { env });

const settingsOf = async (file: string): Promise<unknown> =>
  JSON.parse(await readFile(file, "utf8"));

const ruleLine = (file: string) =>
  `Antigravity CLI: regla \`command(specty)\` en ${file}, para que los comandos de Specty corran sin preguntar; sirve a todos tus proyectos.`;

const invalidWarning = (file: string) =>
  `Antigravity CLI: ${file} no es un JSON que Specty pueda editar, así que no lo toca; añade \`command(specty)\` a \`permissions.allow\` para que los comandos de Specty corran sin preguntar.`;

const APP_WARNING =
  "Antigravity (app): sus permisos no están en un archivo que Specty pueda editar; añade `command(specty)` a sus reglas de permisos (`unsandboxed(specty)` con una cuenta de empresa) para que los comandos de Specty corran sin preguntar.";

const okLine = (file: string) => `Antigravity CLI: regla de Specty en ${file}.`;

const missingLine = (file: string) =>
  `Antigravity CLI: falta \`command(specty)\` en \`permissions.allow\` de ${file}, así que los comandos de Specty piden permiso o fallan en su sandbox; ejecuta \`specty init --tools antigravity\`.`;

const staysLine = (file: string) =>
  `Antigravity CLI: la regla \`command(specty)\` sigue en ${file}, que sirve a todos tus proyectos; quítala de \`permissions.allow\` si ya no usas Specty.`;

describe("init and the permissions of Antigravity's CLI", () => {
  it("AC1: adds command(specty) to permissions.allow, keeps the person's keys and entries, and names the file", async () => {
    const mine = {
      model: "gemini-3.8-flash",
      permissions: { allow: ["command(git status)"], deny: ["command(rm)"] },
    };
    const { file, env } = await cliFolder(`${JSON.stringify(mine, null, 2)}\n`);
    const root = await tempRepo(PACKAGE);
    const result = await init(root, env);
    expect(result.code).toBe(0);
    expect(result.out).toContain(ruleLine(file));
    expect(await settingsOf(file)).toEqual({
      model: "gemini-3.8-flash",
      permissions: { allow: ["command(git status)", "command(specty)"], deny: ["command(rm)"] },
    });
  });

  it("AC1: creates the settings, permissions or its list when they are missing", async () => {
    const root = await tempRepo(PACKAGE);
    const none = await cliFolder();
    expect((await init(root, none.env)).out).toContain(ruleLine(none.file));
    expect(await settingsOf(none.file)).toEqual({ permissions: { allow: ["command(specty)"] } });
    const bare = await cliFolder('{ "model": "x" }\n');
    expect((await init(root, bare.env)).code).toBe(0);
    expect(await settingsOf(bare.file)).toEqual({
      model: "x",
      permissions: { allow: ["command(specty)"] },
    });
    const denying = await cliFolder('{ "permissions": { "deny": ["command(rm)"] } }\n');
    expect((await init(root, denying.env)).code).toBe(0);
    expect(await settingsOf(denying.file)).toEqual({
      permissions: { deny: ["command(rm)"], allow: ["command(specty)"] },
    });
  });

  it("AC2: leaves the settings as they were when command(specty) or unsandboxed(specty) is there, without repeating it", async () => {
    const root = await tempRepo(PACKAGE);
    for (const rule of ["command(specty)", "unsandboxed(specty)"]) {
      const text = `{\n\t"permissions": {"allow": ["command(ls)", "${rule}"]}\n}\n`;
      const { file, env } = await cliFolder(text);
      const result = await init(root, env);
      expect(result.code).toBe(0);
      expect(result.out).toContain(ruleLine(file));
      expect(await readFile(file, "utf8")).toBe(text);
    }
    const twice = await cliFolder('{ "permissions": { "allow": [] } }\n');
    await init(root, twice.env);
    await init(root, twice.env);
    expect(await settingsOf(twice.file)).toEqual({ permissions: { allow: ["command(specty)"] } });
  });

  it("AC3: neither creates the folder of its CLI nor names it when the person does not use it", async () => {
    const root = await tempRepo(PACKAGE);
    const parent = await mkdtemp(join(tmpdir(), "specty-agy-"));
    const dir = join(parent, "antigravity-cli");
    const result = await init(root, { SPECTY_ANTIGRAVITY_CLI_DIR: dir });
    expect(result.code).toBe(0);
    expect(existsSync(dir)).toBe(false);
    expect(result.out).not.toContain("Antigravity CLI:");
  });

  it("AC4: leaves settings it cannot edit alone and says which rule to add", async () => {
    const root = await tempRepo(PACKAGE);
    for (const text of [
      "{ not json\n",
      '{ "permissions": ["command(ls)"] }\n',
      '{ "permissions": { "allow": "command(ls)" } }\n',
    ]) {
      const { file, env } = await cliFolder(text);
      const result = await init(root, env);
      expect(result.code).toBe(0);
      expect(result.out).toContain(invalidWarning(file));
      expect(result.out).not.toContain(ruleLine(file));
      expect(await readFile(file, "utf8")).toBe(text);
    }
  });

  it("AC5: warns which rule to add in the app, whether or not the person uses its CLI", async () => {
    const root = await tempRepo(PACKAGE);
    expect((await init(root)).out).toContain(APP_WARNING);
    const { env } = await cliFolder();
    expect((await init(root, env)).out).toContain(APP_WARNING);
  });

  it("AC8: uses SPECTY_ANTIGRAVITY_CLI_DIR, or .gemini/antigravity-cli in HOME without it, and the tests never the person's", async () => {
    const home = await mkdtemp(join(tmpdir(), "specty-home-"));
    const dir = join(home, ".gemini", "antigravity-cli");
    await mkdir(dir, { recursive: true });
    const root = await tempRepo(PACKAGE);
    const result = await init(root, { HOME: home, SPECTY_ANTIGRAVITY_CLI_DIR: "" });
    expect(result.code).toBe(0);
    expect(await settingsOf(join(dir, "settings.json"))).toEqual({
      permissions: { allow: ["command(specty)"] },
    });

    expect(testEnv().SPECTY_ANTIGRAVITY_CLI_DIR).toBe(ANTIGRAVITY_CLI_DIR);
    expect(ANTIGRAVITY_CLI_DIR.startsWith(tmpdir())).toBe(true);
    expect(ANTIGRAVITY_CLI_DIR.startsWith(join(homedir(), ".gemini"))).toBe(false);
    expect((await init(await tempRepo(PACKAGE))).code).toBe(0);
    expect(existsSync(ANTIGRAVITY_CLI_DIR)).toBe(false);
  });
});

describe("doctor and the rule of Antigravity's CLI", () => {
  it("AC6: confirms command(specty) or unsandboxed(specty), asks for init without it, and says nothing without the folder", async () => {
    const root = await tempRepo(PACKAGE);
    const { file, env } = await cliFolder();
    expect((await init(root, env)).code).toBe(0);
    const ok = await cli(root, ["doctor"], { env });
    expect(ok.out).toContain(okLine(file));
    expect(ok.code).toBe(0);
    await writeFile(file, '{ "permissions": { "allow": ["unsandboxed(specty)"] } }\n');
    expect((await cli(root, ["doctor"], { env })).out).toContain(okLine(file));

    for (const text of ['{ "permissions": { "allow": ["command(ls)"] } }\n', "{ not json\n"]) {
      await writeFile(file, text);
      const doctor = await cli(root, ["doctor"], { env });
      expect(doctor.code).toBe(1);
      expect(doctor.out).toContain(missingLine(file));
    }
    await rm(file);
    expect((await cli(root, ["doctor"], { env })).out).toContain(missingLine(file));

    const elsewhere = await cli(root, ["doctor"]);
    expect(elsewhere.out).not.toContain("Antigravity CLI:");
    expect(elsewhere.code).toBe(0);
  });
});

describe("uninstall and the rule of Antigravity's CLI", () => {
  it("AC7: leaves the rule where it is and says so, with how to remove it", async () => {
    const root = await tempRepo(PACKAGE);
    const { file, env } = await cliFolder();
    expect((await init(root, env)).code).toBe(0);
    const before = await readFile(file, "utf8");
    const removed = await cli(root, ["uninstall"], {
      terminal: person({ choose: ["yes"] }),
      env,
    });
    expect(removed.code).toBe(0);
    expect(removed.out).toContain(staysLine(file));
    expect(await readFile(file, "utf8")).toBe(before);

    const other = await tempRepo(PACKAGE);
    expect((await init(other)).code).toBe(0);
    const plain = await cli(other, ["uninstall"], { terminal: person({ choose: ["yes"] }) });
    expect(plain.out).not.toContain("Antigravity CLI:");
  });
});
