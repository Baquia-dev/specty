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
  read,
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

/** `a` reads the greeting, and fails while it says «roto»; `b` reads a file nobody touches. */
const FAILS_ON_ROTO =
  "if (require('fs').readFileSync('src/app.ts', 'utf8').includes('roto')) { console.log('mal-a'); process.exit(3); }";
const UNITS = `${unit("a", ["src/app.ts"], FAILS_ON_ROTO)}${unit("b", ["src/extra.ts"])}`;

/** What the units of `root` ran, in order, one mark each. */
const marks = (root: string) => readFile(join(root, ".git", "marks"), "utf8").catch(() => "");

/** The files of the clone's record of units that passed. */
const recorded = async (root: string) =>
  (await readdir(join(root, ".git", "common", "specty", "verified")).catch(() => [])).filter(
    (name) => name.endsWith(".json"),
  );

/** A change ready to close whose merge of main conflicts, left in its folder for the agent. */
async function conflictForAgent() {
  const { root, folder } = await inWorktree({
    ...FILES,
    "src/extra.ts": "export const extra = 1;\n",
    ".specty/config.yaml": `${CONFIG()}  units:\n${UNITS}`,
  });
  // Accepting runs both units on the change's code.
  await toClosing(folder);
  await writeFiles(root, { "src/app.ts": "main\n" });
  git(root, "commit", "-q", "-am", "main cambia el saludo");
  const closed = await cli(folder, ["close"], { terminal: person() });
  expect(closed.out).toContain("el merge queda en esta carpeta para que lo resuelva el agente");
  return { root, folder };
}

const merging = (folder: string) =>
  tryGit(folder, "rev-parse", "-q", "--verify", "MERGE_HEAD").status === 0;

/** The `data` of each `change.verified` of SPEC's change in `folder`, oldest first. */
const verifications = async (folder: string): Promise<Record<string, unknown>[]> =>
  (await read(folder, `.specty/changes/${CHANGE}/audit.jsonl`))
    .trim()
    .split("\n")
    .map((line): { event: string; data: Record<string, unknown> } => JSON.parse(line))
    .filter(({ event }) => event === "change.verified")
    .map(({ data }) => data);

describe("`specty integrate` with verify.units", () => {
  it("AC4: runs only the units that have not passed, and commits the merge only when they pass", async () => {
    const { root, folder } = await conflictForAgent();
    expect(await marks(root)).toBe("ab");
    expect(await recorded(root)).toHaveLength(2);

    await writeFiles(folder, { "src/app.ts": "roto\n" });
    const failed = await cli(folder, ["integrate"]);
    expect(failed.code).toBe(2);
    // `b` already passed on this code: only `a` runs, and fails.
    expect(await marks(root)).toBe("aba");
    expect(failed.out).toContain(`\`${command("a", FAILS_ON_ROTO)}\``);
    expect(failed.out).toContain("mal-a");
    expect(failed.err).toContain("Reutilizadas (ya pasaron con este mismo código): b.");
    expect(failed.err).toMatch(/Falló: a \(\d+ s\)\./);
    expect(await recorded(root)).toHaveLength(2);
    expect(merging(folder)).toBe(true);

    await writeFiles(folder, { "src/app.ts": "resuelto\n" });
    const integrated = await cli(folder, ["integrate"]);
    expect(integrated.code).toBe(0);
    expect(await marks(root)).toBe("abaa");
    expect(integrated.err).toContain("Reutilizadas (ya pasaron con este mismo código): b.");
    expect(integrated.err).toMatch(/Ejecutadas y correctas: a \(\d+ s\)\./);
    expect(await recorded(root)).toHaveLength(3);
    expect(merging(folder)).toBe(false);
  });

  it("AC1: records the units it ran as the change's verification, with the code's tree", async () => {
    const { folder } = await conflictForAgent();
    const before = await verifications(folder);
    await writeFiles(folder, { "src/app.ts": "resuelto\n" });
    expect((await cli(folder, ["integrate"])).code).toBe(0);
    const after = await verifications(folder);
    expect(after).toHaveLength(before.length + 1);
    expect(after.at(-1)).toMatchObject({
      exit: 0,
      tree: expect.any(String),
      units: { reused: ["b"], passed: [{ name: "a" }] },
    });
  });
});
