// SPDX-License-Identifier: Apache-2.0
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { makeChangeId, type VerifyUnit } from "@baquia-dev/specty-core";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/store/config";
import { repoPaths } from "../src/store/paths";
import { CONFIG, cli, folderOf, NOW, person, tempRepo, writeFiles } from "./support";

/** The root of this repository, whose `.specty/config.yaml` gives its units. */
const ROOT = join(import.meta.dirname, "..", "..", "..");

/** This repository's `verify.units`, read as the CLI reads them. */
async function repoUnits(): Promise<readonly VerifyUnit[]> {
  const loaded = await loadConfig(repoPaths(ROOT));
  if (loaded.kind !== "ok") throw new Error(`.specty/config.yaml: ${loaded.kind}`);
  return loaded.config.verify.units ?? [];
}

/** A unit's shell command that only appends `name|` to the file `MARKS` names. */
const command = (name: string) =>
  `node -e "require('fs').appendFileSync(process.env.MARKS,'${name}|')"`;

/** A unit of this repository in YAML, under `units:`: its name and paths, and a command that marks. */
const unit = ({ name, paths }: VerifyUnit) =>
  `    - name: ${JSON.stringify(name)}\n      command: ${JSON.stringify(command(name))}\n      paths: ${JSON.stringify(paths)}\n`;

/** The UI's entry in the test repository, the only file the changes of AC1 touch. */
const UI = "packages/ui/src/main.ts";

/** A repository with a file in each package of this one, and its units. */
async function withRepoUnits(): Promise<string> {
  const units = (await repoUnits()).map(unit).join("");
  return tempRepo({
    "packages/core/src/index.ts": "export const core = 1;\n",
    "packages/exporters/src/index.ts": "export const exporters = 1;\n",
    "packages/vscode/src/extension.ts": "export const vscode = 1;\n",
    "packages/cli/src/main.ts": "export const cli = 1;\n",
    [UI]: "export const ui = 0;\n",
    "docs/ARCHITECTURE.md": "# Arquitectura\n",
    ".specty/config.yaml": `${CONFIG()}  units:\n${units}`,
  });
}

/** A quick change of `root`, in its own worktree, that only touches the UI: in acceptance. */
async function uiChange(root: string, title: string, text: string): Promise<string> {
  expect((await cli(root, ["new", "--worktree", "--kind", "quick", title])).code).toBe(0);
  const id = makeChangeId(NOW, title);
  const folder = folderOf(root, id);
  await writeFiles(folder, {
    [`.specty/changes/${id}/spec.md`]: `---\nkind: quick\n---\n\n# ${title}\n\n## Objetivo\n\nLa UI cambia.\n\n## Archivos\n\n- modificar ${UI} — su valor\n\n## Tareas\n\n- [ ] T1: Cambiar la UI\n  - files: ${UI}\n  - type: fix\n`,
  });
  await cli(folder, ["propose"]);
  await cli(folder, ["approve"], { terminal: person() });
  await cli(folder, ["next"]);
  // A fix brings its test, next to it: `task done` runs `specty check --spec`.
  const test = `it('is ${text}', () => {});\n`;
  await writeFiles(folder, {
    [UI]: `export const ui = ${text};\n`,
    "packages/ui/src/main.test.ts": test,
  });
  await cli(folder, ["task", "done", "T1", "--summary", "UI cambiada"]);
  return folder;
}

/**
 * The person runs `accept` in `folder` of the clone `root`: yes to running the full verification,
 * no to accepting, so the change stays. The units it ran, in order, and its notes joined.
 */
async function accept(folder: string, root: string) {
  const marks = join(root, ".git", "marks");
  const before = await readFile(marks, "utf8").catch(() => "");
  const terminal = person({ confirm: [true, false] });
  await cli(folder, ["accept"], { terminal, env: { MARKS: marks } });
  const after = await readFile(marks, "utf8").catch(() => "");
  const ran = after.slice(before.length).split("|").filter(Boolean);
  return { ran, notes: terminal.notes.join("\n") };
}

describe("this repository's verify.units", () => {
  it("AC1: a change that only touches packages/ui runs again estático and ui, not the CLI's tests", async () => {
    const root = await withRepoUnits();
    const names = (await repoUnits()).map(({ name }) => name);
    const first = await accept(await uiChange(root, "Cambiar la portada", "1"), root);
    expect(first.ran).toEqual(names);

    const second = await accept(await uiChange(root, "Ajustar el menú", "2"), root);
    expect(second.ran).toEqual(["estático", "ui"]);
    expect(second.ran).not.toContain("cli");
    const reused = names.filter((name) => !second.ran.includes(name));
    expect(second.notes).toContain(
      `Reutilizadas (ya pasaron con este mismo código): ${reused.join(", ")}.`,
    );
  });

  it("AC2: between them, the units run every step of pnpm check", async () => {
    const commands = (await repoUnits()).flatMap(({ command }) => command.split(" && "));
    const root: { readonly scripts: Readonly<Record<string, string>> } = JSON.parse(
      await readFile(join(ROOT, "package.json"), "utf8"),
    );
    const steps = (root.scripts.check ?? "").split(" && ").filter((step) => step !== "pnpm test");
    expect(steps).toEqual(["pnpm lint", "pnpm typecheck", "pnpm sources", "pnpm knip"]);
    expect(commands).toEqual(expect.arrayContaining(steps));

    const folders = (await readdir(join(ROOT, "packages"), { withFileTypes: true })).filter(
      (entry) => entry.isDirectory(),
    );
    const packages = await Promise.all(
      folders.map(
        async ({ name }): Promise<{ readonly name: string; readonly scripts?: object }> =>
          JSON.parse(await readFile(join(ROOT, "packages", name, "package.json"), "utf8")),
      ),
    );
    const tested = packages
      .filter(({ scripts }) => scripts !== undefined && "test" in scripts)
      .map(({ name }) => `pnpm --filter ${name} test`);
    expect(tested).toHaveLength(5);
    expect(commands).toEqual(expect.arrayContaining(tested));
  });
});
