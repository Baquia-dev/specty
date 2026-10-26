// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHANGE, CONFIG, cli, person, SPEC, SPEC_PATH, tempRepo, writeFiles } from "./support";

/**
 * A git that gives `blame`'s error in Spanish, as a translated git does, and leaves the rest to
 * the real one: the machine running the tests may have no catalogs to translate it.
 */
async function spanishGit(): Promise<Record<string, string>> {
  const bin = await mkdtemp(join(tmpdir(), "specty-git-"));
  const real = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  const shim = [
    "#!/usr/bin/env node",
    'const { spawnSync } = require("node:child_process");',
    `const run = spawnSync(${JSON.stringify(real)}, process.argv.slice(2), { stdio: ["inherit", "inherit", "pipe"] });`,
    'process.stderr.write(String(run.stderr).replace(/has only (\\d+) lines?/, "solo tiene $1 líneas"));',
    "process.exit(run.status ?? 1);",
    "",
  ].join("\n");
  await writeFile(join(bin, "git"), shim);
  await chmod(join(bin, "git"), 0o755);
  return { PATH: `${bin}${delimiter}${process.env.PATH ?? ""}` };
}

const GREET = "export const greet = (name: string) => 'Hola, ' + name;\n// por defecto\n";

/** SPEC's change with T1 done: its commit wrote src/app.ts, which the first commit had. */
async function oneTask(): Promise<string> {
  const root = await tempRepo({
    "src/app.ts": "export const greet = () => 'hola';\n",
    ".specty/config.yaml": CONFIG(),
  });
  await cli(root, ["new", "Saludo personalizado"]);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  await cli(root, ["propose"]);
  await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  await cli(root, ["next"]);
  await writeFiles(root, { "src/app.ts": GREET });
  expect((await cli(root, ["task", "done", "T1", "--summary", "Saluda por nombre"])).code).toBe(0);
  return root;
}

describe("specty why", () => {
  it("tells the commit, change, task and criteria a line comes from (AC1)", async () => {
    const root = await oneTask();
    const result = await cli(root, ["why", "src/app.ts:1"]);
    expect(result.code).toBe(0);
    expect(result.out).toMatch(
      /src\/app\.ts:1:\n {2}[0-9a-f]{7,} · \d{4}-\d{2}-\d{2} · .+ · feat(\(\w+\))?: Saludar por nombre\n/,
    );
    expect(result.out).toContain(
      [
        `    Cambio ${CHANGE}: Saludo personalizado`,
        "    Tarea T1: Saludar por nombre",
        "    AC1: CUANDO se pasa «Ana» ENTONCES imprime «Hola, Ana».",
        "    Spec: revisión 1 (",
      ].join("\n"),
    );
  });

  it("lists the changes that touched a file, and the commits outside Specty (AC2, AC3)", async () => {
    const root = await oneTask();
    const file = (await cli(root, ["why", "src/app.ts"])).out;
    const change = file.indexOf(`Cambio ${CHANGE}: Saludo personalizado`);
    const outside = file.indexOf("No es de ningún cambio de Specty.");
    // Newest first: the task's commit, then the first commit of the repository.
    expect(change).toBeGreaterThan(0);
    expect(outside).toBeGreaterThan(change);
    await writeFiles(root, { "src/app.ts": `${GREET}nueva\n` });
    expect((await cli(root, ["why", "src/app.ts:3"])).out).toContain(
      "src/app.ts:3: la línea aún no está en ningún commit.",
    );
  });

  it("refuses a path with no history, and a line that is not there (AC4)", async () => {
    const root = await oneTask();
    const missing = await cli(root, ["why", "src/otro.ts"]);
    expect([missing.code, missing.out]).toEqual([
      1,
      expect.stringContaining("src/otro.ts no tiene historia en git."),
    ]);
    const beyond = await cli(root, ["why", "src/app.ts:99"]);
    expect([beyond.code, beyond.out]).toEqual([
      1,
      expect.stringContaining("src/app.ts no tiene la línea 99."),
    ]);
  });

  it.skipIf(process.platform === "win32")(
    "tells a missing line from a file with no history in any language of git (AC1, AC2)",
    async () => {
      const root = await oneTask();
      const env = await spanishGit();
      const beyond = await cli(root, ["why", "src/app.ts:99"], { env });
      expect([beyond.code, beyond.out]).toEqual([
        1,
        expect.stringContaining("src/app.ts no tiene la línea 99."),
      ]);
      const missing = await cli(root, ["why", "src/otro.ts:1"], { env });
      expect([missing.code, missing.out]).toEqual([
        1,
        expect.stringContaining("src/otro.ts no tiene historia en git."),
      ]);
    },
  );
});
