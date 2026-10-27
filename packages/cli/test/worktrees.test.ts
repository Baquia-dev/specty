// SPDX-License-Identifier: Apache-2.0
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import {
  CHANGE,
  CONFIG,
  cli,
  git,
  person,
  read,
  SPEC,
  SPEC_PATH,
  tempRepo,
  writeFiles,
} from "./support";

const FILES = {
  "src/app.ts": "export const greet = () => 'hola';\n",
  ".specty/config.yaml": CONFIG(),
};
const OTHER = CHANGE.replace("saludo-personalizado", "otro-cambio");
/** Where `new --worktree` puts the worktrees of `root`. */
const home = (root: string) => join(dirname(root), `${basename(root)}.worktrees`);
/** Claude Code's hook before an agent action, run from `cwd`. */
const claude = (cwd: string, tool: string, input: Record<string, unknown>) =>
  cli(cwd, ["guard", "--tool", "claude-code"], {
    stdin: JSON.stringify({ cwd, tool_name: tool, tool_input: input }),
  });

describe("specty new --worktree", () => {
  it("creates the change in its own folder, from the main branch, leaving this one as it was", async () => {
    const root = await tempRepo(FILES);
    await cli(root, ["new", "Saludo personalizado"]);
    git(root, "commit", "-q", "--allow-empty", "-m", "trabajo en curso");
    await writeFiles(root, { "src/app.ts": "a medias\n" });
    const blocked = await cli(root, ["new", "Otro cambio"]);
    expect(blocked.code).toBe(2);
    expect(blocked.out).toContain(
      'crea el nuevo en paralelo, en otra carpeta: `specty new --worktree "<título>"`',
    );
    const created = await cli(root, ["new", "--worktree", "Otro cambio"]);
    expect(created.code).toBe(0);
    const folder = join(home(root), OTHER);
    const main = git(root, "rev-parse", "main");
    expect(created.out).toContain(
      `Cambio creado: ${OTHER} (rama specty/${OTHER}) en ${folder}, desde main (${main.slice(0, 7)}).`,
    );
    expect(created.out).toContain(
      `SIGUIENTE: continúa en ${folder}: cambia allí la carpeta de trabajo de tu sesión (o abre allí un agente) y ejecuta \`specty next\`; esta carpeta sigue con su propio trabajo.`,
    );
    expect(git(folder, "branch", "--show-current")).toBe(`specty/${OTHER}`);
    expect(git(folder, "rev-parse", "HEAD")).toBe(main);
    expect((await cli(folder, ["next"])).out).toContain(`SPECTY · ${OTHER} · draft`);
    expect(git(root, "branch", "--show-current")).toBe(`specty/${CHANGE}`);
    expect(await read(root, "src/app.ts")).toBe("a medias\n");
  });

  it("tells Codex's agent how the person opens Codex in the change's folder (AC1)", async () => {
    const root = await tempRepo(FILES);
    const created = await cli(root, ["new", "--worktree", "Otro cambio"], {
      env: { CODEX_THREAD_ID: "019a" },
    });
    expect(created.code).toBe(0);
    const folder = join(home(root), CHANGE.replace("saludo-personalizado", "otro-cambio"));
    expect(created.out).toContain(
      `SIGUIENTE: continúa en ${folder}: Codex no cambia de carpeta en mitad de la sesión, así que pídele a la persona que abra Codex en esa carpeta (\`codex -C "${folder}"\`) y termina tu turno;`,
    );
  });

  it("starts from the branch given with --from, and refuses one that does not exist", async () => {
    const root = await tempRepo(FILES);
    git(root, "switch", "-q", "-c", "base");
    git(root, "commit", "-q", "--allow-empty", "-m", "base");
    git(root, "switch", "-q", "main");
    const missing = await cli(root, ["new", "--worktree", "--from", "nada", "Desde base"]);
    expect(missing.code).toBe(2);
    expect(missing.out).toContain("`nada` no es una rama ni un commit.");
    expect(await exists(home(root))).toBe(false);
    expect(git(root, "branch", "--list", "specty/*")).toBe("");
    const alone = await cli(root, ["new", "--from", "base", "Desde base"]);
    expect(alone.code).toBe(1);
    expect(alone.out).toContain("`--from` solo vale con `--worktree`.");
    // A folder left behind keeps its id.
    const id = CHANGE.replace("saludo-personalizado", "desde-base");
    await mkdir(join(home(root), id), { recursive: true });
    expect((await cli(root, ["new", "--worktree", "--from", "base", "Desde base"])).code).toBe(0);
    expect(git(join(home(root), `${id}-2`), "rev-parse", "HEAD")).toBe(
      git(root, "rev-parse", "base"),
    );
  });

  it("follows the remote's default branch and copies the agent hooks git does not track", async () => {
    const root = await tempRepo({ ...FILES, ".cursor/hooks.json": '{"version":1}\n' });
    git(root, "switch", "-q", "-c", "develop");
    git(root, "commit", "-q", "--allow-empty", "-m", "develop");
    git(root, "update-ref", "refs/remotes/origin/develop", "develop");
    git(root, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/develop");
    git(root, "switch", "-q", "main");
    const settings = '{"hooks":{"PreToolUse":[]}}\n';
    await writeFiles(root, { ".claude/settings.local.json": settings });
    const created = await cli(root, ["new", "--worktree", "Otro cambio"]);
    const folder = join(home(root), OTHER);
    expect(created.out).toContain(", desde develop (");
    expect(git(folder, "rev-parse", "HEAD")).toBe(git(root, "rev-parse", "develop"));
    expect(created.out).toContain("HOOKS DEL AGENTE COPIADOS:\n  .claude/settings.local.json");
    expect(await read(folder, ".claude/settings.local.json")).toBe(settings);
    // A tracked hook file arrives with the branch.
    expect(created.out).not.toContain(".cursor/hooks.json");
    expect(await read(folder, ".cursor/hooks.json")).toBe('{"version":1}\n');
  });

  it("tells Claude Code to enter by name when its worktree hooks are installed (AC6)", async () => {
    const root = await tempRepo(FILES);
    const guard = [{ hooks: [{ type: "command", command: "specty guard --tool claude-code" }] }];
    await writeFiles(root, {
      ".claude/settings.local.json": JSON.stringify({
        hooks: { WorktreeCreate: guard, WorktreeRemove: guard },
      }),
    });
    const created = await cli(root, ["new", "--worktree", "Otro cambio"]);
    expect(created.out).toContain(
      `cambia allí la carpeta de trabajo de tu sesión (en Claude Code, \`EnterWorktree\` con \`name: "${OTHER}"\`; o abre allí un agente) y ejecuta \`specty next\``,
    );
  });

  it("needs a branch per change", async () => {
    const config =
      'version: 1\nlanguage: es\ngit:\n  branchPerChange: false\nverify:\n  default: "true"\n';
    const root = await tempRepo({ ...FILES, ".specty/config.yaml": config });
    const refused = await cli(root, ["new", "--worktree", "Otro cambio"]);
    expect(refused.code).toBe(2);
    expect(refused.out).toContain("`--worktree` necesita una rama por cambio");
    await cli(root, ["new", "Saludo personalizado"]);
    expect((await cli(root, ["new", "Otro cambio"])).out).toContain("cámbiate a otra rama");
  });
});

describe("every change in its own worktree", () => {
  /** Specty's defaults: changes go to worktrees. */
  const DEFAULTS = 'version: 1\nlanguage: es\nverify:\n  default: "true"\n';
  const configured = (git: string) => ({
    ...FILES,
    ".specty/config.yaml": `${DEFAULTS}git:\n${git}`,
  });

  it("creates the change in a worktree without --worktree, leaving this folder on its branch (AC1, AC4)", async () => {
    const root = await tempRepo({ ...FILES, ".specty/config.yaml": DEFAULTS });
    const created = await cli(root, ["new", "Otro cambio"]);
    expect(created.code).toBe(0);
    const folder = join(home(root), OTHER);
    expect(created.out).toContain(
      `Cambio creado: ${OTHER} (rama specty/${OTHER}) en ${folder}, desde main (`,
    );
    expect(created.out).toContain(
      `SIGUIENTE: continúa en ${folder}: cambia allí la carpeta de trabajo de tu sesión (o abre allí un agente) y ejecuta \`specty next\``,
    );
    expect(created.out).not.toContain("Carpeta preparada");
    expect(git(root, "branch", "--show-current")).toBe("main");
    expect(git(folder, "branch", "--show-current")).toBe(`specty/${OTHER}`);
    expect((await cli(folder, ["next"])).out).toContain(`SPECTY · ${OTHER} · draft`);
    // `--from` needs no `--worktree` either.
    expect((await cli(root, ["new", "--from", "main", "Desde main"])).code).toBe(0);
  });

  it("starts from git.target unless --from says otherwise, and refuses a missing one", async () => {
    const root = await tempRepo(configured("  target: develop\n"));
    const missing = await cli(root, ["new", "Otro cambio"]);
    expect(missing.code).toBe(2);
    expect(missing.out).toContain("`develop` no es una rama ni un commit.");
    expect(await exists(home(root))).toBe(false);
    git(root, "switch", "-q", "-c", "develop");
    git(root, "commit", "-q", "--allow-empty", "-m", "develop");
    git(root, "switch", "-q", "main");
    const created = await cli(root, ["new", "Otro cambio"]);
    expect(created.out).toContain(", desde develop (");
    expect(git(join(home(root), OTHER), "rev-parse", "HEAD")).toBe(
      git(root, "rev-parse", "develop"),
    );
    const from = await cli(root, ["new", "--from", "main", "Desde main"]);
    expect(from.out).toContain(", desde main (");
  });

  it("prepares the new folder with git.setup, or else with the stack's install command (AC2)", async () => {
    const folderOf = (root: string) => join(home(root), OTHER);
    const set = await tempRepo(configured('  setup: "echo listo > preparado.txt"\n'));
    const prepared = await cli(set, ["new", "Otro cambio"]);
    expect(prepared.out).toContain("Carpeta preparada con `echo listo > preparado.txt`.");
    expect(await read(folderOf(set), "preparado.txt")).toBe("listo\n");

    const broken = await tempRepo(configured('  setup: "echo roto && exit 3"\n'));
    const failed = await cli(broken, ["new", "Otro cambio"]);
    expect(failed.code).toBe(0);
    expect(failed.out).toContain("FALLÓ `echo roto && exit 3`:\n  roto");
    expect(failed.out).toContain(
      `SIGUIENTE: en ${folderOf(broken)}, ejecuta \`echo roto && exit 3\`; después cambia allí la carpeta de trabajo de tu sesión`,
    );
    expect(await exists(join(folderOf(broken), `.specty/changes/${OTHER}/spec.md`))).toBe(true);

    // Without git.setup, the detected stack's command runs: here a stand-in `pnpm`.
    const bin = await mkdtemp(join(tmpdir(), "specty-bin-"));
    await writeFile(join(bin, "pnpm"), '#!/bin/sh\necho "$@" > instalado.txt\n');
    await chmod(join(bin, "pnpm"), 0o755);
    const env = { PATH: `${bin}${delimiter}${process.env.PATH ?? ""}` };
    const node = {
      "package.json": '{"name":"demo"}\n',
      "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
    };
    const detected = await tempRepo({ ...FILES, ...node, ".specty/config.yaml": DEFAULTS });
    const installed = await cli(detected, ["new", "Otro cambio"], { env });
    expect(installed.out).toContain("Carpeta preparada con `pnpm install --prefer-offline`.");
    expect(await read(folderOf(detected), "instalado.txt")).toBe("install --prefer-offline\n");
    const off = await tempRepo({ ...configured("  setup: false\n"), ...node });
    const untouched = await cli(off, ["new", "Otro cambio"], { env });
    expect(untouched.out).not.toContain("Carpeta preparada");
    expect(await exists(join(folderOf(off), "instalado.txt"))).toBe(false);
  });
});

describe("a worktree inside the repository", () => {
  it("is not code without a spec, not out of scope and not part of Specty's commits", async () => {
    const root = await tempRepo(FILES);
    // Where Claude Code creates its worktrees.
    git(root, "worktree", "add", "-q", "--detach", ".claude/worktrees/x");
    expect((await cli(root, ["next"])).out).toContain("No hay un cambio activo.");
    expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
    await writeFiles(root, { [SPEC_PATH]: SPEC });
    expect((await cli(root, ["propose"])).code).toBe(0);
    const approved = await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
    expect(approved.code).toBe(0);
    await cli(root, ["next"]);
    await writeFiles(root, {
      "src/app.ts": "export const greet = (name: string) => 'Hola, ' + name;\n",
      "src/app.test.ts": "test\n",
    });
    const done = await cli(root, ["task", "done", "T1", "--summary", "Saludo por nombre"]);
    expect(done.code).toBe(0);
    expect(git(root, "ls-tree", "-r", "--name-only", "HEAD")).not.toContain(".claude");
  });

  it("is told apart from other nested repositories, which still count", async () => {
    const root = await tempRepo(FILES);
    git(root, "init", "-q", "vendor/lib");
    await writeFiles(root, { "vendor/lib/a.ts": "x\n" });
    git(`${root}/vendor/lib`, "add", "-A");
    git(`${root}/vendor/lib`, "commit", "-q", "-m", "init");
    expect((await cli(root, ["next"])).out).toContain("CAMBIOS SIN SPEC:\n  vendor/lib/");
  });
});

describe("the guard and the other worktrees", () => {
  it("blocks changing another worktree's files, beside this folder or inside it", async () => {
    const root = await tempRepo(FILES);
    const sibling = join(home(root), "otra");
    const nested = join(root, ".claude/worktrees/x");
    git(root, "worktree", "add", "-q", "-b", "specty/otra", sibling);
    git(root, "worktree", "add", "-q", "--detach", ".claude/worktrees/x");
    const write = await claude(root, "Write", { file_path: join(sibling, "src/app.ts") });
    expect(write.code).toBe(2);
    expect(write.err).toContain(
      `\`${join(sibling, "src/app.ts")}\` está en otra worktree (\`${sibling}\`, rama specty/otra): es de otro cambio.`,
    );
    expect(write.err).toContain(
      `SIGUIENTE: trabaja solo con los archivos de esta carpeta; ese cambio se edita desde una sesión abierta en \`${sibling}\`.`,
    );
    const shell = await claude(root, "Bash", { command: `echo x > ${sibling}/src/app.ts` });
    expect(shell.err).toContain("está en otra worktree");
    const removal = await claude(root, "Bash", { command: `rm ${sibling}/src/app.ts` });
    expect(removal.err).toContain("está en otra worktree");
    const inside = await claude(root, "Edit", { file_path: join(nested, "src/app.ts") });
    expect(inside.err).toContain(`está en otra worktree (\`${nested}\`): es de otro cambio.`);
    // From the nested worktree, the main folder is another one.
    const outward = await claude(nested, "Edit", { file_path: join(root, "src/app.ts") });
    expect(outward.err).toContain(`está en otra worktree (\`${root}\`, rama main)`);
  });

  it("decides as before inside this folder and outside every worktree", async () => {
    const root = await tempRepo(FILES);
    git(root, "worktree", "add", "-q", "-b", "specty/otra", join(home(root), "otra"));
    const own = await claude(root, "Write", { file_path: join(root, "src/app.ts") });
    expect(own.err).toContain("No hay un cambio activo y `src/app.ts` es código gobernado");
    expect((await claude(root, "Write", { file_path: join(dirname(root), "fuera.ts") })).code).toBe(
      0,
    );
  });

  it("answers Cursor in its own format", async () => {
    const root = await tempRepo(FILES);
    const sibling = join(home(root), "otra");
    git(root, "worktree", "add", "-q", "-b", "specty/otra", sibling);
    const denied = await cli(root, ["guard", "--tool", "cursor"], {
      stdin: JSON.stringify({
        hook_event_name: "preToolUse",
        tool_name: "Write",
        workspace_roots: [root],
        tool_input: { file_path: join(sibling, "src/app.ts") },
      }),
    });
    expect(JSON.parse(denied.out)).toMatchObject({
      permission: "deny",
      user_message: expect.stringContaining("está en otra worktree"),
    });
  });
});
