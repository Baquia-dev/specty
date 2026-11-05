// SPDX-License-Identifier: Apache-2.0
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHANGE,
  CONFIG,
  cli,
  APP as FILES,
  git,
  inWorktree,
  person,
  toAcceptance,
  toClosing,
  tryGit,
  writeFiles,
} from "./support";

/**
 * A unit's shell command: Node appends `name` to the clone's `.git/marks`, from any worktree, so
 * the file says what ran and in what order, and then runs `script`.
 */
const command = (name: string, script = "") =>
  `node -e "require('fs').appendFileSync(process.argv[1] + '/marks', '${name}');${script}" "$(git rev-parse --git-common-dir)"`;

/** A unit of `verify.units` in YAML, under `units:`. */
const unit = (name: string, paths: readonly string[], script = "") =>
  `    - name: ${name}\n      command: ${JSON.stringify(command(name, script))}\n      paths: ${JSON.stringify(paths)}\n`;

/** A repository whose full verification is these units, with no `verify.full`. */
const withUnits = (units: string) => ({
  ...FILES,
  ".specty/config.yaml": `${CONFIG()}  units:\n${units}`,
});

/** `a` reads the change's file and `b` the one main brings. */
const A = unit("a", ["src/app.ts"]);
const B = unit("b", ["src/other.ts"]);

/** What the units of `root` ran, in order, one mark each. */
const marks = (root: string) => readFile(join(root, ".git", "marks"), "utf8").catch(() => "");

/** The files of the clone's record of units that passed. */
const recorded = async (root: string) =>
  (await readdir(join(root, ".git", "common", "specty", "verified")).catch(() => [])).filter(
    (name) => name.endsWith(".json"),
  );

/** Main moves on in `root` with the file only `b` reads. */
async function mainMoves(root: string): Promise<void> {
  await writeFiles(root, { "src/other.ts": "export const other = 1;\n" });
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "otro trabajo en main");
}

const MERGED =
  /Antes, main se incorporó a la rama del cambio \(merge [0-9a-f]{7}\) y pasaron las unidades de su verificación completa\./;

describe("the incorporation of main with verify.units", () => {
  it("AC1: accept's merge runs only the units that have not passed, and records them", async () => {
    const { root, folder } = await inWorktree(withUnits(`${A}${B}`));
    await toAcceptance(folder);
    // Yes to running the full verification, no to accepting: both units pass on the change's code.
    await cli(folder, ["accept"], { terminal: person({ confirm: [true, false] }) });
    expect(await marks(root)).toBe("ab");
    expect(await recorded(root)).toHaveLength(2);
    await mainMoves(root);
    const accepted = await cli(folder, ["accept"], { terminal: person() });
    expect(accepted.code).toBe(0);
    // Main brings only what `b` reads: `a` is reused.
    expect(await marks(root)).toBe("abb");
    expect(accepted.out).toMatch(MERGED);
    expect(accepted.out).toContain("Reutilizadas (ya pasaron con este mismo código): a.");
    expect(accepted.out).toMatch(/Ejecutadas y correctas: b \(\d+ s\)\./);
    expect(await recorded(root)).toHaveLength(3);
  });

  it("AC2: after the merge's units, accept's own full verification runs none again", async () => {
    const { root, folder } = await inWorktree(withUnits(`${A}${B}`));
    await toAcceptance(folder);
    await mainMoves(root);
    const terminal = person();
    const accepted = await cli(folder, ["accept"], { terminal });
    expect(accepted.code).toBe(0);
    expect(accepted.out).toMatch(MERGED);
    expect(accepted.out).toMatch(/Ejecutadas y correctas: a \(\d+ s\), b \(\d+ s\)\./);
    expect(await marks(root)).toBe("ab");
    expect(terminal.notes.join("\n")).toContain(
      "ya pasó con este mismo código en una verificación anterior: no se repite.",
    );
  });

  it("AC1: closing's merge also runs only the units that have not passed", async () => {
    const { root, folder } = await inWorktree(withUnits(`${A}${B}`));
    // Accepting runs both units on the change's code.
    await toClosing(folder);
    expect(await marks(root)).toBe("ab");
    await mainMoves(root);
    const closed = await cli(folder, ["close"], { terminal: person() });
    expect(closed.code).toBe(0);
    expect(await marks(root)).toBe("abb");
    expect(closed.out).toMatch(MERGED);
    expect(closed.out).toContain("Reutilizadas (ya pasaron con este mismo código): a.");
    expect(closed.out).toMatch(/Ejecutadas y correctas: b \(\d+ s\)\./);
    expect(git(root, "rev-parse", "main")).toBe(git(root, "rev-parse", `specty/${CHANGE}`));
  });

  it("AC3: stops at the unit that fails on the merged code, and leaves the merge for the agent", async () => {
    const fails =
      "if (require('fs').existsSync('src/other.ts')) { console.log('mal-b'); process.exit(3); }";
    const failing = unit("b", ["src/other.ts"], fails);
    const { root, folder } = await inWorktree(withUnits(`${A}${failing}${unit("c", ["src/**"])}`));
    await toAcceptance(folder);
    await mainMoves(root);
    const accepted = await cli(folder, ["accept"], { terminal: person() });
    expect(accepted.code).toBe(2);
    expect(await marks(root)).toBe("ab");
    expect(accepted.out).toContain(`Con main incorporado, \`${command("b", fails)}\` falla.`);
    expect(accepted.out).toContain("mal-b");
    expect(accepted.out).toMatch(/Ejecutadas y correctas: a \(\d+ s\)\./);
    expect(accepted.out).toMatch(/Falló: b \(\d+ s\)\./);
    expect(accepted.out).toContain("Sin ejecutar tras el fallo: c.");
    expect(accepted.out).toContain("SIGUIENTE: dile a tu agente «continúa»");
    // Only the unit that passed is in the record.
    expect(await recorded(root)).toHaveLength(1);
    expect(tryGit(folder, "rev-parse", "-q", "--verify", "MERGE_HEAD").status).toBe(0);
  });
});
