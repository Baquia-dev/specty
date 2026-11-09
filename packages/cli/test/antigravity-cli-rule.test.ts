// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { installFiles } from "../src/install/files";
import { installHooks } from "../src/install/hooks";
import { createGit } from "../src/io/git";
import {
  AGENT,
  ANTIGRAVITY_CLI_DIR,
  cli,
  DIST,
  git,
  NOW,
  person,
  tempRepo,
  testEnv,
} from "./support";

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

/** The folder of the node that runs the tests, as the one that runs `init`. */
const NODE = `read_file(${dirname(dirname(process.execPath))})`;
/** The tests' `init` runs the bundle in `DIST`, outside node's folder. */
const BUNDLE = `read_file(${dirname(DIST)})`;
/** Git's common folder of the repository in `root`, which Specty's commits write in. */
const gitRule = (root: string) => `write_file(${join(root, ".git")})`;
/** The rules that let Specty run inside its sandbox, in `init`'s order. */
const sandbox = (root: string) => [NODE, BUNDLE, gitRule(root)];
/** Specty's rules in `root`: its commands', then its sandbox's. */
const rules = (root: string) => ["command(specty)", ...sandbox(root)];

/** The rules as a Spanish text lists them. */
const listed = (items: readonly string[]) => {
  const quoted = items.map((item) => `\`${item}\``);
  return quoted.length < 2
    ? (quoted[0] ?? "")
    : `${quoted.slice(0, -1).join(", ")} y ${quoted.at(-1)}`;
};

const ruleLine = (file: string, written: readonly string[]) =>
  `Antigravity CLI: reglas ${listed(written)} en ${file}, para que los comandos de Specty corran sin preguntar y dentro de su sandbox; \`write_file\` abre en él el git de este proyecto, y las demás sirven a todos tus proyectos.`;

const invalidWarning = (file: string, wanted: readonly string[]) =>
  `Antigravity CLI: ${file} no es un JSON que Specty pueda editar, así que no lo toca; añade ${listed(wanted)} a \`permissions.allow\` para que los comandos de Specty corran sin preguntar y dentro de su sandbox.`;

const APP_WARNING =
  "Antigravity (app): sus permisos no están en un archivo que Specty pueda editar; añade `command(specty)` a sus reglas de permisos (`unsandboxed(specty)` con una cuenta de empresa) para que los comandos de Specty corran sin preguntar.";

const okLine = (file: string) => `Antigravity CLI: reglas de Specty en ${file}.`;

const missingLine = (file: string, missing: readonly string[]) =>
  `Antigravity CLI: ${missing.length === 1 ? "falta" : "faltan"} ${listed(missing)} en \`permissions.allow\` de ${file}, así que los comandos de Specty piden permiso o fallan en su sandbox; ejecuta \`specty init --tools antigravity\`.`;

const staysLine = (file: string, staying: readonly string[]) =>
  `Antigravity CLI: las reglas ${listed(staying)} siguen en ${file}: \`write_file\` solo sirve a este proyecto, y las demás, a todos tus proyectos; quítalas de \`permissions.allow\` si ya no usas Specty.`;

const oneStaysLine = (file: string) =>
  `Antigravity CLI: la regla \`command(specty)\` sigue en ${file}, que sirve a todos tus proyectos; quítala de \`permissions.allow\` si ya no usas Specty.`;

/** `init` of Antigravity's hooks with `script` as the bundle the person runs. */
async function installWith(root: string, script: string, env: Record<string, string>) {
  const environment = testEnv(env);
  return installHooks({
    environment: {
      cwd: root,
      env: environment,
      now: () => NOW,
      terminal: AGENT,
      io: { out: () => {}, err: () => {} },
      invocation: { command: `node "${script}"`, portable: false, script },
    },
    root,
    git: createGit(root, environment),
    tools: ["antigravity"],
    lang: "es",
    files: installFiles(),
  });
}

describe("init and the permissions of Antigravity's CLI", () => {
  it("AC1: adds command(specty) and the sandbox's rules to permissions.allow, after the person's, and names the file and the rules", async () => {
    const mine = {
      model: "gemini-3.8-flash",
      permissions: { allow: ["command(git status)"], deny: ["command(rm)"] },
    };
    const { file, env } = await cliFolder(`${JSON.stringify(mine, null, 2)}\n`);
    const root = await tempRepo(PACKAGE);
    const result = await init(root, env);
    expect(result.code).toBe(0);
    expect(result.out).toContain(ruleLine(file, rules(root)));
    expect(await settingsOf(file)).toEqual({
      model: "gemini-3.8-flash",
      permissions: { allow: ["command(git status)", ...rules(root)], deny: ["command(rm)"] },
    });
  });

  it("AC1: creates the settings, permissions or its list when they are missing", async () => {
    const root = await tempRepo(PACKAGE);
    const none = await cliFolder();
    expect((await init(root, none.env)).out).toContain(ruleLine(none.file, rules(root)));
    expect(await settingsOf(none.file)).toEqual({ permissions: { allow: rules(root) } });
    const bare = await cliFolder('{ "model": "x" }\n');
    expect((await init(root, bare.env)).code).toBe(0);
    expect(await settingsOf(bare.file)).toEqual({
      model: "x",
      permissions: { allow: rules(root) },
    });
    const denying = await cliFolder('{ "permissions": { "deny": ["command(rm)"] } }\n');
    expect((await init(root, denying.env)).code).toBe(0);
    expect(await settingsOf(denying.file)).toEqual({
      permissions: { deny: ["command(rm)"], allow: rules(root) },
    });
  });

  it("AC1: gives write_file git's common folder of the repository when init runs in one of its worktrees", async () => {
    const root = await tempRepo(PACKAGE);
    const tree = `${root}-otro`;
    git(root, "worktree", "add", "-q", "-b", "otro", tree);
    const { file, env } = await cliFolder();
    const result = await init(tree, env);
    expect(result.code).toBe(0);
    expect(await settingsOf(file)).toEqual({ permissions: { allow: rules(root) } });
    expect(result.out).toContain(ruleLine(file, rules(root)));
  });

  it("AC1: leaves the bundle's rule out when the bundle is inside node's folder, as in a global npm install", async () => {
    const root = await tempRepo(PACKAGE);
    const prefix = dirname(dirname(process.execPath));
    const script = join(
      prefix,
      "lib",
      "node_modules",
      "@baquia-dev",
      "specty",
      "dist",
      "specty.mjs",
    );
    const { file, env } = await cliFolder();
    const installed = await installWith(root, script, env);
    expect(await settingsOf(file)).toEqual({
      permissions: { allow: ["command(specty)", NODE, gitRule(root)] },
    });
    expect(installed.done).toContain(ruleLine(file, ["command(specty)", NODE, gitRule(root)]));
  });

  it("AC2: leaves the settings as they were when they hold every rule, with command(specty) or unsandboxed(specty)", async () => {
    const root = await tempRepo(PACKAGE);
    for (const rule of ["command(specty)", "unsandboxed(specty)"]) {
      const all = JSON.stringify(["command(ls)", rule, ...sandbox(root)]);
      const text = `{\n\t"permissions": {"allow": ${all}}\n}\n`;
      const { file, env } = await cliFolder(text);
      const result = await init(root, env);
      expect(result.code).toBe(0);
      expect(result.out).toContain(ruleLine(file, [rule, ...sandbox(root)]));
      expect(await readFile(file, "utf8")).toBe(text);
    }
  });

  it("AC2: adds only the missing rules, without repeating any, when init runs twice or after an earlier install", async () => {
    const root = await tempRepo(PACKAGE);
    const twice = await cliFolder('{ "permissions": { "allow": [] } }\n');
    await init(root, twice.env);
    await init(root, twice.env);
    expect(await settingsOf(twice.file)).toEqual({ permissions: { allow: rules(root) } });
    // An install from before the sandbox's rules: only its commands'.
    const before = await cliFolder(
      '{ "permissions": { "allow": ["command(specty)", "command(ls)"] } }\n',
    );
    expect((await init(root, before.env)).code).toBe(0);
    expect(await settingsOf(before.file)).toEqual({
      permissions: { allow: ["command(specty)", "command(ls)", ...sandbox(root)] },
    });
    // Some of them, with the one of business accounts.
    const some = await cliFolder(
      JSON.stringify({ permissions: { allow: [gitRule(root), "unsandboxed(specty)"] } }),
    );
    expect((await init(root, some.env)).code).toBe(0);
    expect(await settingsOf(some.file)).toEqual({
      permissions: { allow: [gitRule(root), "unsandboxed(specty)", NODE, BUNDLE] },
    });
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

  it("AC3: leaves settings it cannot edit alone and names every rule to add", async () => {
    const root = await tempRepo(PACKAGE);
    for (const text of [
      "{ not json\n",
      '{ "permissions": ["command(ls)"] }\n',
      '{ "permissions": { "allow": "command(ls)" } }\n',
    ]) {
      const { file, env } = await cliFolder(text);
      const result = await init(root, env);
      expect(result.code).toBe(0);
      expect(result.out).toContain(invalidWarning(file, rules(root)));
      expect(result.out).not.toContain(ruleLine(file, rules(root)));
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
      permissions: { allow: rules(root) },
    });

    expect(testEnv().SPECTY_ANTIGRAVITY_CLI_DIR).toBe(ANTIGRAVITY_CLI_DIR);
    expect(ANTIGRAVITY_CLI_DIR.startsWith(tmpdir())).toBe(true);
    expect(ANTIGRAVITY_CLI_DIR.startsWith(join(homedir(), ".gemini"))).toBe(false);
    expect((await init(await tempRepo(PACKAGE))).code).toBe(0);
    expect(existsSync(ANTIGRAVITY_CLI_DIR)).toBe(false);
  });
});

describe("doctor and the rules of Antigravity's CLI", () => {
  it("AC4: confirms Specty's rules, names the missing ones and asks for init, and says nothing without the folder", async () => {
    const root = await tempRepo(PACKAGE);
    const { file, env } = await cliFolder();
    expect((await init(root, env)).code).toBe(0);
    const ok = await cli(root, ["doctor"], { env });
    expect(ok.out).toContain(okLine(file));
    expect(ok.code).toBe(0);
    const business = JSON.stringify({
      permissions: { allow: ["unsandboxed(specty)", ...sandbox(root)] },
    });
    await writeFile(file, business);
    expect((await cli(root, ["doctor"], { env })).out).toContain(okLine(file));

    // An install from before the sandbox's rules, and one from another node.
    await writeFile(file, '{ "permissions": { "allow": ["command(specty)"] } }\n');
    const before = await cli(root, ["doctor"], { env });
    expect(before.code).toBe(1);
    expect(before.out).toContain(missingLine(file, sandbox(root)));
    const otherNode = ["command(specty)", "read_file(/opt/node-22)", BUNDLE, gitRule(root)];
    await writeFile(file, JSON.stringify({ permissions: { allow: otherNode } }));
    const moved = await cli(root, ["doctor"], { env });
    expect(moved.code).toBe(1);
    expect(moved.out).toContain(missingLine(file, [NODE]));

    for (const text of ['{ "permissions": { "allow": ["command(ls)"] } }\n', "{ not json\n"]) {
      await writeFile(file, text);
      const doctor = await cli(root, ["doctor"], { env });
      expect(doctor.code).toBe(1);
      expect(doctor.out).toContain(missingLine(file, rules(root)));
    }
    await rm(file);
    expect((await cli(root, ["doctor"], { env })).out).toContain(missingLine(file, rules(root)));

    const elsewhere = await cli(root, ["doctor"]);
    expect(elsewhere.out).not.toContain("Antigravity CLI:");
    expect(elsewhere.code).toBe(0);
  });
});

describe("uninstall and the rules of Antigravity's CLI", () => {
  it("AC5: leaves Specty's rules where they are and names them, with how to remove them", async () => {
    const root = await tempRepo(PACKAGE);
    const { file, env } = await cliFolder();
    expect((await init(root, env)).code).toBe(0);
    const before = await readFile(file, "utf8");
    const removed = await cli(root, ["uninstall"], {
      terminal: person({ choose: ["yes"] }),
      env,
    });
    expect(removed.code).toBe(0);
    expect(removed.out).toContain(staysLine(file, rules(root)));
    expect(await readFile(file, "utf8")).toBe(before);

    // Only the rules of Specty that are there: an install from before the sandbox's rules.
    const earlier = await tempRepo(PACKAGE);
    const old = await cliFolder(
      '{ "permissions": { "allow": ["command(ls)", "command(specty)"] } }\n',
    );
    expect((await init(earlier, old.env)).code).toBe(0);
    await writeFile(
      old.file,
      '{ "permissions": { "allow": ["command(ls)", "command(specty)"] } }\n',
    );
    const kept = await cli(earlier, ["uninstall"], {
      terminal: person({ choose: ["yes"] }),
      env: old.env,
    });
    expect(kept.code).toBe(0);
    expect(kept.out).toContain(oneStaysLine(old.file));

    const other = await tempRepo(PACKAGE);
    expect((await init(other)).code).toBe(0);
    const plain = await cli(other, ["uninstall"], { terminal: person({ choose: ["yes"] }) });
    expect(plain.out).not.toContain("Antigravity CLI:");
  });
});
