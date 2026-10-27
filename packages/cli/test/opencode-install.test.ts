// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { parse } from "jsonc-parser";
import { describe, expect, it } from "vitest";
import { installFiles } from "../src/install/files";
import { installHooks } from "../src/install/hooks";
import { createGit } from "../src/io/git";
import {
  AGENT,
  CHANGE,
  CONFIG,
  cli,
  DIST,
  git,
  NOW,
  person,
  read,
  tempRepo,
  testEnv,
  writeFiles,
} from "./support";

/** A global OpenCode configuration of its own, as `XDG_CONFIG_HOME` points to it: Specty leaves it empty. */
async function opencodeConfig() {
  const config = await mkdtemp(join(tmpdir(), "specty-opencode-"));
  return { env: { XDG_CONFIG_HOME: config }, config };
}

const PLUGIN = ".opencode/plugins/specty.js";

const PACKAGE = { "package.json": '{"name":"x","scripts":{"test":"true"}}\n' };

describe("installing the plugin in OpenCode", () => {
  it("tells doctor when the plugin lacks the card after a compaction (AC5)", async () => {
    const root = await tempRepo({ ...PACKAGE, "opencode.json": "{}\n" });
    await cli(root, ["init", "--language", "es", "--tools", "opencode"]);
    const text = await read(root, PLUGIN);
    await writeFiles(root, { [PLUGIN]: text.replaceAll("session.compacted", "session.other") });
    const doctor = await cli(root, ["doctor"]);
    expect(doctor.code).toBe(1);
    expect(doctor.out).toContain(
      "OpenCode: al plugin del guard le falta la tarjeta de Specty tras compactar; ejecuta `specty init --tools opencode`.",
    );
  });

  it("writes it to the project's .opencode/plugins/ and leaves the global configuration alone (AC2, AC9)", async () => {
    const { env, config } = await opencodeConfig();
    const root = await tempRepo({ "src/app.ts": "x\n", ".specty/config.yaml": CONFIG() });
    const result = await cli(root, ["init", "--language", "es", "--tools", "opencode"], { env });
    expect(result.code).toBe(0);
    expect(result.out).toContain(
      "OpenCode: plugin del guard en .opencode/plugins/specty.js (local).",
    );
    expect(await read(root, PLUGIN)).toContain(`"node \\"${DIST}\\" guard --tool opencode"`);
    expect(await readdir(config)).toEqual([]);
    // With a machine path, the plugin stays out of git, and new copies it to the worktree (AC3).
    expect(await read(root, ".git/info/exclude")).toContain(`/${PLUGIN}`);
    expect(git(root, "status", "--porcelain")).toBe("");
    const created = await cli(root, ["new", "--worktree", "Otro cambio"]);
    expect(created.out).toContain(`HOOKS DEL AGENTE COPIADOS:\n  ${PLUGIN}`);
    const folder = join(
      dirname(root),
      `${basename(root)}.worktrees`,
      CHANGE.replace("saludo-personalizado", "otro-cambio"),
    );
    expect(await read(folder, PLUGIN)).toBe(await read(root, PLUGIN));
  });

  it("versions it, for init's commit, when the command is on PATH (AC3)", async () => {
    const root = await tempRepo(PACKAGE);
    const env = testEnv();
    const installed = await installHooks({
      environment: {
        cwd: root,
        env,
        now: () => NOW,
        terminal: AGENT,
        io: { out: () => {}, err: () => {} },
        invocation: { command: "specty", portable: true },
      },
      root,
      git: createGit(root, env),
      tools: ["opencode"],
      lang: "es",
      files: installFiles(),
    });
    expect(installed.written).toContain(PLUGIN);
    expect(installed.done).toContain("OpenCode: plugin del guard en .opencode/plugins/specty.js.");
    expect(await read(root, PLUGIN)).toContain('"specty guard --tool opencode"');
    expect(await read(root, ".git/info/exclude")).not.toContain(PLUGIN);
  });

  it("installs it for a repository with opencode.json, and doctor looks for it there (AC6)", async () => {
    const { env, config } = await opencodeConfig();
    const root = await tempRepo({ "opencode.json": "{}\n" });
    await cli(root, ["init", "--language", "es"], { env });
    const doctor = await cli(root, ["doctor"], { env });
    expect(doctor.out).toContain("OpenCode: plugin del guard en .opencode/plugins/specty.js.");
    await writeFiles(root, { [PLUGIN]: 'const GUARD = "specty guard --tool opencode";\n' });
    expect((await cli(root, ["doctor"], { env })).out).toContain(
      "OpenCode: al plugin del guard le falta la comprobación tras cada comando; ejecuta `specty init --tools opencode`.",
    );
    await writeFiles(root, { [PLUGIN]: "export default {};\n" });
    const missing = await cli(root, ["doctor"], { env });
    expect(missing.code).toBe(1);
    expect(missing.out).toContain(
      "OpenCode: falta el plugin del guard en .opencode/plugins/specty.js; ejecuta `specty init --tools opencode`.",
    );
    expect(await readdir(config)).toEqual([]);
  });

  it("names the formatter that would check the plugin (AC8)", async () => {
    const root = await tempRepo({
      ...PACKAGE,
      "biome.json": '{"files":{"includes":["**","!.specty"]}}\n',
    });
    await cli(root, ["init", "--language", "es", "--tools", "opencode"]);
    expect((await cli(root, ["doctor"])).out).toContain(
      'Biome también revisa .opencode/plugins/specty.js, que escribe Specty: añade "!.opencode/plugins/specty.js" en biome.json (files.includes).',
    );
  });
});

const SETTINGS = ".opencode/opencode.jsonc";

describe("OpenCode's permission for the worktrees' folder", () => {
  it("lets it work there from settings out of git, and uninstall takes it out (AC4)", async () => {
    const root = await tempRepo(PACKAGE);
    const pattern = `${root}.worktrees/**`;
    await writeFiles(root, { [SETTINGS]: '{\n  // Mías.\n  "permission": { "bash": "ask" }\n}\n' });
    const init = await cli(root, ["init", "--language", "es", "--tools", "opencode"]);
    expect(init.out).toContain(
      "OpenCode: .opencode/opencode.jsonc (local) le deja trabajar en la carpeta de las worktrees (`permission.external_directory`), para entrar en la de un cambio desde la misma sesión (`specty enter`).",
    );
    const settings = async () => parse(await read(root, SETTINGS));
    expect(await settings()).toEqual({
      permission: { bash: "ask", external_directory: { [pattern]: "allow" } },
    });
    expect(await read(root, SETTINGS)).toContain("// Mías.");
    expect(await read(root, ".git/info/exclude")).toContain(`/${SETTINGS}`);
    expect(git(root, "status", "--porcelain")).toBe("");
    await cli(root, ["uninstall"], { terminal: person({ choose: ["yes"] }) });
    expect(await settings()).toEqual({ permission: { bash: "ask" } });
  });

  it("keeps a rule the person gave every folder, before its own (AC4)", async () => {
    const root = await tempRepo(PACKAGE);
    await writeFiles(root, { [SETTINGS]: '{ "permission": { "external_directory": "deny" } }\n' });
    await cli(root, ["init", "--language", "es", "--tools", "opencode"]);
    expect(parse(await read(root, SETTINGS)).permission.external_directory).toEqual({
      "*": "deny",
      [`${root}.worktrees/**`]: "allow",
    });
  });

  it("says what to add when the settings go in git (AC4)", async () => {
    const root = await tempRepo({ ...PACKAGE, [SETTINGS]: "{}\n" });
    const init = await cli(root, ["init", "--language", "es", "--tools", "opencode"]);
    expect(init.out).toContain(
      `OpenCode: .opencode/opencode.jsonc va en git, así que Specty no le añade la carpeta de las worktrees; para trabajar en la de un cambio desde la misma sesión (\`specty enter\`), permite \`${root}.worktrees/**\` en \`permission.external_directory\` de tu configuración de usuario.`,
    );
    expect(await read(root, SETTINGS)).toBe("{}\n");
  });
});
