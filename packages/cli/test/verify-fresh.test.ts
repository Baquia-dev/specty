// SPDX-License-Identifier: Apache-2.0
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP, CONFIG, cli, tempRepo } from "./support";

/** A script that appends `text` to the file `MARKS` names: what ran, in order. */
const mark = (text: string) => `require('fs').appendFileSync(process.env.MARKS,'${text}')`;

/** Marks `text`, and fails the first time it runs in the clone; from then on, it passes. */
const flaky = (text: string) =>
  `${mark(text)};const f=process.env.MARKS+'.${text}';require('fs').existsSync(f)?0:(require('fs').writeFileSync(f,''),console.log('falla una vez ${text}'),process.exit(1))`;

/** Marks `text`, and always fails. */
const failing = (text: string) => `${mark(text)};console.log('rompe ${text}');process.exit(1)`;

/** The shell command of a unit that runs `script` with Node. */
const command = (script: string) => `node -e "${script}"`;

/** A unit of `verify.units` in YAML, under `units:`. */
const unit = (name: string, paths: readonly string[], script = mark(name)) =>
  `    - name: ${name}\n      command: ${JSON.stringify(command(script))}\n      paths: ${JSON.stringify(paths)}\n`;

/** The configuration with these units and a `verify.full` that marks `F` if it ever runs. */
const withUnits = (units: string) =>
  `${CONFIG()}  full: ${JSON.stringify(command(mark("F")))}\n  units:\n${units}`;

/** A repository with `config`, two source files and no change. */
const repo = (config: string) =>
  tempRepo({ ...APP, "src/extra.ts": "export const extra = 1;\n", ".specty/config.yaml": config });

/** `specty verify` with `argv` in `root`, the agent running it, with its marks in `.git`. */
const verify = (root: string, argv: readonly string[] = ["verify", "--fresh"]) =>
  cli(root, argv, { env: { MARKS: join(root, ".git", "marks") } });

/** What ran in `root`, in order, one mark each. */
const marks = (root: string) => readFile(join(root, ".git", "marks"), "utf8").catch(() => "");

/** The files of the clone's record of units that passed. */
const recorded = async (root: string) =>
  (await readdir(join(root, ".git", "common", "specty", "verified")).catch(() => [])).filter(
    (name) => name.endsWith(".json"),
  );

/** The open entries of the memory, as `specty memory` lists them. */
const memory = async (root: string) => (await cli(root, ["memory"])).out;

describe("specty verify --fresh", () => {
  it("AC1: runs every unit in order without the record, also after one that fails, and records those that pass", async () => {
    const root = await repo(
      withUnits(
        `${unit("a", ["src/app.ts"])}${unit("b", ["src/extra.ts"], failing("b"))}${unit("c", ["src/**"])}`,
      ),
    );
    const first = await verify(root);
    expect(await marks(root)).toBe("abbc");
    expect(first.out).toMatch(/a · correcta · \d+ s\n/);
    expect(first.out).toMatch(/b · falló las dos veces · \d+ s \+ \d+ s\n/);
    expect(first.out).toMatch(/c · correcta · \d+ s\n/);
    expect(first.out).toContain(
      "Anotadas en el registro del clon, no se repiten con este código: a, c.",
    );
    expect(first.err).toContain("Ejecutando a (");
    expect(first.err).toContain("b falló: se repite una vez (");
    expect(await recorded(root)).toHaveLength(2);
    await verify(root);
    expect(await marks(root)).toBe("abbcabbc");
    expect(await recorded(root)).toHaveLength(2);
  });

  it("AC2: a unit that fails and passes when run again is a lesson of its paths, and the command passes", async () => {
    const root = await repo(
      withUnits(`${unit("a", ["src/app.ts"])}${unit("b", ["src/extra.ts"], flaky("b"))}`),
    );
    const run = await verify(root);
    expect(run.code).toBe(0);
    expect(await marks(root)).toBe("abb");
    expect(run.out).toMatch(/b · inestable: falló y pasó al repetirla · \d+ s \+ \d+ s\n/);
    expect(run.out).toContain("SALIDA DEL FALLO DE b:\n  falla una vez b");
    expect(run.out).toMatch(/EN LA MEMORIA:\n {2}P1 · lección · b\n/);
    expect(await recorded(root)).toHaveLength(2);
    const listed = await memory(root);
    expect(listed).toContain("P1 · lección · La unidad `b` de la verificación completa (");
    expect(listed).toContain("falló y pasó al repetirla en una verificación fresca");
    expect(listed).toMatch(/P1 · lección · .+ · en src\/extra\.ts/);
  });

  it("AC2: a unit that fails twice is a pending item, with its output, and the command fails", async () => {
    const root = await repo(withUnits(`${unit("b", ["src/extra.ts"], failing("b"))}`));
    const run = await verify(root);
    expect(run.code).toBe(1);
    expect(run.out).toContain("SALIDA DEL FALLO DE b:\n  rompe b");
    expect(run.out).toMatch(/EN LA MEMORIA:\n {2}P1 · pendiente · b\n/);
    expect(run.out).toContain("corrige el fallo de b (su salida está arriba)");
    expect(await recorded(root)).toHaveLength(0);
    const listed = await memory(root);
    expect(listed).toContain("P1 · pendiente · La unidad `b` de la verificación completa (");
    expect(listed).toContain("falló dos veces seguidas en una verificación fresca");
    await verify(root);
    expect(await memory(root)).not.toContain("P2 ·");
  });

  it("AC3: without verify.units, runs verify.full the same way, and a flaky one is a pending item", async () => {
    const root = await repo(`${CONFIG()}  full: ${JSON.stringify(command(flaky("F")))}\n`);
    const run = await verify(root);
    expect(run.code).toBe(0);
    expect(await marks(root)).toBe("FF");
    expect(run.out).toMatch(
      /verify\.full · inestable: falló y pasó al repetirla · \d+ s \+ \d+ s\n/,
    );
    expect(run.out).toMatch(/EN LA MEMORIA:\n {2}P1 · pendiente · verify\.full\n/);
    expect(await recorded(root)).toHaveLength(0);
    expect(await memory(root)).toContain("P1 · pendiente · La verificación completa (`node -e");
  });

  it("AC4: without --fresh, or without verify.full nor verify.units, runs nothing and says why", async () => {
    const root = await repo(withUnits(unit("a", ["src/app.ts"])));
    const bare = await verify(root, ["verify"]);
    expect(bare.code).toBe(1);
    expect(bare.out).toContain("solo ejecuta, por ahora, la verificación fresca");
    expect(bare.out).toContain("verify --fresh`.");
    expect(await marks(root)).toBe("");
    const none = await repo(CONFIG());
    const nothing = await verify(none);
    expect(nothing.code).toBe(1);
    expect(nothing.out).toContain("no da `verify.full` ni `verify.units`");
    expect(await recorded(none)).toHaveLength(0);
  });
});
