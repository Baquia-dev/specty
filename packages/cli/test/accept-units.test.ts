// SPDX-License-Identifier: Apache-2.0
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APP,
  CHANGE,
  CONFIG,
  cli,
  git,
  person,
  quickInWorktree,
  read,
  SPEC,
  SPEC_PATH,
  stateIn,
  tempRepo,
  writeFiles,
} from "./support";

/** A script that appends `text` to the file `MARKS` names: what ran, in order. */
const mark = (text: string) => `require('fs').appendFileSync(process.env.MARKS,'${text}')`;

/** The shell command of a unit that runs `script` with Node. */
const command = (script: string) => `node -e "${script}"`;

/** A unit of `verify.units` in YAML, under `units:`. */
const unit = (name: string, paths: readonly string[], script = mark(name)) =>
  `    - name: ${name}\n      command: ${JSON.stringify(command(script))}\n      paths: ${JSON.stringify(paths)}\n`;

/** The configuration with these units and a `verify.full` that marks `F` if it ever runs. */
const config = (units: string) =>
  `${CONFIG()}  full: ${JSON.stringify(command(mark("F")))}\n  units:\n${units}`;

const A = unit("a", ["src/app.ts"]);
const B = unit("b", ["src/extra.ts"]);

/** SPEC's change in `root`'s own folder, waiting for the person to accept it. */
async function inAcceptance(units: string): Promise<string> {
  const root = await tempRepo({
    ...APP,
    "src/extra.ts": "export const extra = 1;\n",
    ".specty/config.yaml": config(units),
  });
  expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  expect((await cli(root, ["propose"])).code).toBe(0);
  await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  await cli(root, ["next"]);
  await writeFiles(root, { "src/app.ts": "1\n" });
  await cli(root, ["task", "done", "T1", "--summary", "Uno"]);
  await writeFiles(root, { "src/app.ts": "2\n" });
  await cli(root, ["task", "done", "T2", "--summary", "Dos"]);
  return root;
}

/**
 * The person runs `accept` in `folder` of the clone `root` with these answers, the last of which
 * postpones the acceptance, so the change stays to be accepted again; its notes come joined.
 */
async function accept(folder: string, root: string, confirm: readonly boolean[]) {
  const terminal = person({ confirm });
  const env = { MARKS: join(root, ".git", "marks") };
  const run = await cli(folder, ["accept"], { terminal, env });
  return { ...run, notes: terminal.notes.join("\n") };
}

/** What the units of `root` ran, in order, one mark each. */
const marks = (root: string) => readFile(join(root, ".git", "marks"), "utf8").catch(() => "");

/** The files of the clone's record of units that passed. */
const recorded = async (root: string) =>
  (await readdir(join(root, ".git", "common", "specty", "verified")).catch(() => [])).filter(
    (name) => name.endsWith(".json"),
  );

/** The `data` of each `change.verified` of SPEC's change, oldest first. */
const verifications = async (root: string): Promise<Record<string, unknown>[]> =>
  (await read(root, `.specty/changes/${CHANGE}/audit.jsonl`))
    .trim()
    .split("\n")
    .map((line): { event: string; data: Record<string, unknown> } => JSON.parse(line))
    .filter(({ event }) => event === "change.verified")
    .map(({ data }) => data);

describe("accept with verify.units", () => {
  it("AC1: runs its units in order instead of verify.full, and records which ran", async () => {
    const root = await inAcceptance(`${A}${B}`);
    const accepted = await accept(root, root, [true, false]);
    expect(await marks(root)).toBe("ab");
    expect(accepted.notes).toContain("Verificación correcta");
    expect(accepted.notes).toMatch(/Ejecutadas y correctas: a \(\d+ s\), b \(\d+ s\)\./);
    expect(await verifications(root)).toEqual([
      expect.objectContaining({
        cmd: `${command(mark("a"))} && ${command(mark("b"))}`,
        exit: 0,
        units: {
          reused: [],
          passed: [
            { name: "a", ms: expect.any(Number) },
            { name: "b", ms: expect.any(Number) },
          ],
          skipped: [],
        },
      }),
    ]);
    expect(await recorded(root)).toHaveLength(2);
  });

  it("AC3: runs again only the unit whose files changed", async () => {
    const root = await inAcceptance(`${A}${B}`);
    await accept(root, root, [true, false]);
    await writeFiles(root, { "src/extra.ts": "export const extra = 2;\n" });
    git(root, "commit", "-q", "-am", "Otro extra");
    const again = await accept(root, root, [true, false]);
    expect(await marks(root)).toBe("abb");
    expect(again.notes).toContain("Reutilizadas (ya pasaron con este mismo código): a.");
    expect(again.notes).toMatch(/Ejecutadas y correctas: b \(\d+ s\)\./);
    expect((await verifications(root))[1]).toMatchObject({
      exit: 0,
      units: { reused: ["a"], passed: [{ name: "b" }], skipped: [] },
    });
  });

  it("AC3: runs again only the unit whose command changed", async () => {
    const root = await inAcceptance(`${A}${B}`);
    await accept(root, root, [true, false]);
    await writeFiles(root, {
      ".specty/config.yaml": config(`${unit("a", ["src/app.ts"], mark("A"))}${B}`),
    });
    git(root, "commit", "-q", "-am", "Otro comando");
    const again = await accept(root, root, [true, false]);
    expect(await marks(root)).toBe("abA");
    expect(again.notes).toContain("Reutilizadas (ya pasaron con este mismo código): b.");
    expect(again.notes).toMatch(/Ejecutadas y correctas: a \(\d+ s\)\./);
  });

  it("AC4: stops at the unit that fails, with its output, and does not record it", async () => {
    const failing = unit(
      "b",
      ["src/extra.ts"],
      `${mark("b")};console.log('mal-b');process.exit(3)`,
    );
    const root = await inAcceptance(`${A}${failing}${unit("c", ["src/app.ts"])}`);
    // Yes to running it, no to accepting it anyway.
    const failed = await accept(root, root, [true, false]);
    expect(await marks(root)).toBe("ab");
    expect(failed.notes).toContain("Verificación fallida");
    expect(failed.notes).toContain("mal-b");
    expect(failed.notes).toMatch(/Falló: b \(\d+ s\)\./);
    expect(failed.notes).toContain("Sin ejecutar tras el fallo: c.");
    expect(await verifications(root)).toEqual([
      expect.objectContaining({
        exit: 3,
        outputTail: ["mal-b"],
        units: {
          reused: [],
          passed: [{ name: "a", ms: expect.any(Number) }],
          failed: { name: "b", ms: expect.any(Number) },
          skipped: ["c"],
        },
      }),
    ]);
    // Only the unit that passed is in the record: the one that failed runs again.
    expect(await recorded(root)).toHaveLength(1);
    const again = await accept(root, root, [true, false]);
    expect(await marks(root)).toBe("abb");
    expect(again.notes).toContain("Reutilizadas (ya pasaron con este mismo código): a.");
  });
});

describe("accept with verify.units in several changes of the clone", () => {
  it("AC2: does not run the units that passed with the same fingerprint in another change", async () => {
    const root = await tempRepo({
      "src/app.ts": "export const greet = () => 'hola';\n",
      "src/button.ts": "Sing in\n",
      ".specty/config.yaml": config(`${A}${unit("b", ["src/button.ts"])}`),
    });
    const first = await quickInWorktree(root, "Corregir botón", "corregir-boton", "Sign in\n");
    await accept(first.folder, root, [true, false]);
    expect(await marks(root)).toBe("ab");

    // Same code for both units: nothing runs, nor is the person asked whether to run it.
    const same = await quickInWorktree(root, "Otro botón", "otro-boton", "Sign in\n");
    const reused = await accept(same.folder, root, [false]);
    expect(await marks(root)).toBe("ab");
    expect(reused.notes).toContain(
      "Todas las unidades ya pasaron con este mismo código, en este cambio o en otro del clon: a, b. No se repite ninguna.",
    );
    expect(await stateIn(same.folder, same.id)).toMatchObject({ phase: "acceptance" });

    // Another button: only the unit that reads it runs.
    const other = await quickInWorktree(root, "Tercer botón", "tercer-boton", "Log in\n");
    const ran = await accept(other.folder, root, [true, false]);
    expect(await marks(root)).toBe("abb");
    expect(ran.notes).toContain("Reutilizadas (ya pasaron con este mismo código): a.");
    expect(ran.notes).toMatch(/Ejecutadas y correctas: b \(\d+ s\)\./);
  });
});
