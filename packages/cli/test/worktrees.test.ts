// SPDX-License-Identifier: Apache-2.0
import { mkdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
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
      `SIGUIENTE: en ${folder}, instala las dependencias y abre allí un agente que ejecute \`specty next\``,
    );
    expect(git(folder, "branch", "--show-current")).toBe(`specty/${OTHER}`);
    expect(git(folder, "rev-parse", "HEAD")).toBe(main);
    expect((await cli(folder, ["next"])).out).toContain(`SPECTY · ${OTHER} · draft`);
    expect(git(root, "branch", "--show-current")).toBe(`specty/${CHANGE}`);
    expect(await read(root, "src/app.ts")).toBe("a medias\n");
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

  it("needs a branch per change", async () => {
    const config = `${CONFIG()}git:\n  branchPerChange: false\n`;
    const root = await tempRepo({ ...FILES, ".specty/config.yaml": config });
    const refused = await cli(root, ["new", "--worktree", "Otro cambio"]);
    expect(refused.code).toBe(2);
    expect(refused.out).toContain("`--worktree` necesita una rama por cambio");
    await cli(root, ["new", "Saludo personalizado"]);
    expect((await cli(root, ["new", "Otro cambio"])).out).toContain("cámbiate a otra rama");
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
