// SPDX-License-Identifier: Apache-2.0
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createGit } from "../src/io/git";
import { readRuns } from "../src/store/runs";
import { APP, CHANGE, CONFIG, cli, tempRepo, testEnv } from "./support";

/** A script that appends `text` to the file `MARKS` names: what ran, in order. */
const mark = (text: string) => `require('fs').appendFileSync(process.env.MARKS,'${text}')`;

/** Marks `text`, and fails the first time it runs in the clone; from then on, it passes. */
const flaky = (text: string) =>
  `${mark(text)};const f=process.env.MARKS+'.${text}';require('fs').existsSync(f)?0:(require('fs').writeFileSync(f,''),console.log('falla una vez ${text}'),process.exit(1))`;

/** Marks `text`, and always fails. */
const failing = (text: string) => `${mark(text)};console.log('rompe ${text}');process.exit(1)`;

/** Marks `text`, says «dice `text`» and waits two seconds: a unit to watch while it runs. */
const slow = (text: string) => `${mark(text)};console.log('dice ${text}');setTimeout(()=>{},2000)`;

/** Marks `text` and fails at once the first time; run again, says «otra vez `text`» and waits. */
const slowAgain = (text: string) =>
  `${mark(text)};const f=process.env.MARKS+'.${text}';require('fs').existsSync(f)?(console.log('otra vez ${text}'),setTimeout(()=>{},2000)):(require('fs').writeFileSync(f,''),process.exit(1))`;

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

/** The verifications going on in `root`'s clone, by change, as the UI and the MCP App read them. */
const going = (root: string) => readRuns(createGit(root, testEnv()));

/** Waits for `check` to hold, up to 20 s of real time. */
async function until(check: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("timed out");
    await new Promise((done) => setTimeout(done, 50));
  }
}

/**
 * A unit's tests as a script: `node scripts/report.cjs <unit> <mode>` marks the unit and, like a
 * test tool, writes `packages/<unit>/coverage/junit.xml`, with `test/<unit>.test.ts` relative to
 * its package. `fails`: a test fails, always. `flaky`: a test fails the first time, then passes.
 * `silent`: fails without a report. `green`: fails though its report has no failed test.
 */
const REPORTER = `const fs = require("node:fs");
const [unit, mode] = process.argv.slice(2);
fs.appendFileSync(process.env.MARKS, unit);
const once = process.env.MARKS + "." + unit;
const first = !fs.existsSync(once);
fs.writeFileSync(once, "");
const failing = mode === "fails" || (mode === "flaky" && first);
const name = mode === "flaky" ? unit + " &gt; a veces" : unit + " &gt; rompe";
const testcase = (title, failed) =>
  '<testcase classname="test/' + unit + '.test.ts" name="' + title + '" time="0.01">' +
  (failed ? '<failure message="expected 1 to be 2">AssertionError</failure>' : "") +
  "</testcase>";
if (mode !== "silent") {
  fs.mkdirSync("packages/" + unit + "/coverage", { recursive: true });
  fs.writeFileSync(
    "packages/" + unit + "/coverage/junit.xml",
    '<testsuites><testsuite name="test/' + unit + '.test.ts">' +
      testcase(unit + " &gt; suma", false) + testcase(name, failing) +
      "</testsuite></testsuites>",
  );
}
const said = { fails: "rompe", flaky: "falla una vez", silent: "sin informe", green: "umbral" };
console.log(said[mode] + " " + unit);
process.exit(failing || mode === "silent" || mode === "green" ? 1 : 0);
`;

/** A unit of `verify.units` in YAML whose tests are REPORTER's, in `mode`. */
const reported = (name: string, mode: "fails" | "flaky" | "silent" | "green") =>
  `    - name: ${name}\n      command: "node scripts/report.cjs ${name} ${mode}"\n      paths: ["packages/${name}/**"]\n`;

/** `checks.testTime`, with the reports REPORTER writes. */
const TEST_TIME = `checks:\n  testTime:\n    reports: ["packages/*/coverage/junit.xml"]\n    maxMs: 60000\n`;

/** A repository with `config`, REPORTER, the test file of each of `units` and `files`. */
const withReports = (
  config: string,
  units: readonly string[],
  files: Readonly<Record<string, string>> = {},
) =>
  tempRepo({
    ...APP,
    ".specty/config.yaml": config,
    "scripts/report.cjs": REPORTER,
    ...Object.fromEntries(
      units.map((name) => [`packages/${name}/test/${name}.test.ts`, "export {};\n"]),
    ),
    ...files,
  });

describe("specty verify --fresh with JUnit reports", () => {
  it("AC1: names the tests that failed in each attempt, with their file, before the output; for a flaky unit, those of the attempt that failed", async () => {
    const root = await withReports(
      `${withUnits(`${reported("b", "fails")}${reported("c", "flaky")}`)}${TEST_TIME}`,
      ["b", "c"],
    );
    const run = await verify(root);
    expect(run.code).toBe(1);
    expect(await marks(root)).toBe("bbcc");
    expect(run.out).toContain(
      "TESTS QUE FALLARON EN b:\n  packages/b/test/b.test.ts «b > rompe»\nSALIDA DEL FALLO DE b:\n  rompe b",
    );
    expect(run.out).toContain(
      "TESTS QUE FALLARON EN c:\n  packages/c/test/c.test.ts «c > a veces»\nSALIDA DEL FALLO DE c:\n  falla una vez c",
    );
    expect(run.out).not.toContain("> suma»");
  });

  it("AC2: without a report of the attempt, or with reports that name no failed test, shows only the output", async () => {
    const stale =
      '<testsuites><testsuite name="test/d.test.ts"><testcase classname="test/d.test.ts" name="d &gt; antes" time="0.01"><failure/></testcase></testsuite></testsuites>';
    const root = await withReports(
      `${withUnits(`${reported("d", "silent")}${reported("e", "green")}`)}${TEST_TIME}`,
      ["d", "e"],
      { "packages/d/coverage/junit.xml": stale },
    );
    const run = await verify(root);
    expect(run.code).toBe(1);
    expect(run.out).not.toContain("TESTS QUE FALLARON");
    expect(run.out).toContain("SALIDA DEL FALLO DE d:\n  sin informe d");
    expect(run.out).toContain("SALIDA DEL FALLO DE e:\n  umbral e");
  });

  it("AC2: without checks.testTime, reads no report and shows only the output", async () => {
    const root = await withReports(withUnits(reported("b", "fails")), ["b"]);
    const run = await verify(root);
    expect(run.code).toBe(1);
    expect(await readFile(join(root, "packages/b/coverage/junit.xml"), "utf8")).toContain(
      "b &gt; rompe",
    );
    expect(run.out).not.toContain("TESTS QUE FALLARON");
    expect(run.out).toContain("SALIDA DEL FALLO DE b:\n  rompe b");
  });
});

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

describe("specty verify --fresh, live", () => {
  it("AC1: in the folder of an open change, each attempt is that change's full verification going on, with its unit's command and output, and none is left", async () => {
    const root = await repo(
      withUnits(
        `${unit("a", ["src/app.ts"], slow("a"))}${unit("c", ["src/extra.ts"], slowAgain("c"))}`,
      ),
    );
    expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
    const running = verify(root);
    for (const [name, said] of [
      ["a", "dice a"],
      ["c", "otra vez c"],
    ] as const) {
      await until(async () => (await going(root)).get(CHANGE)?.output.includes(said) === true);
      const run = (await going(root)).get(CHANGE);
      const script = name === "a" ? slow(name) : slowAgain(name);
      expect(run).toMatchObject({ command: command(script), output: [said], pid: process.pid });
      expect(run?.task).toBeUndefined();
    }
    const done = await running;
    expect(done.code).toBe(0);
    expect(await marks(root)).toBe("acc");
    expect(done.out).toMatch(/c · inestable: falló y pasó al repetirla · \d+ s \+ \d+ s\n/);
    expect((await going(root)).size).toBe(0);
  });

  it("AC2: without an open change in the folder, runs as before and leaves no verification going on", async () => {
    const root = await repo(withUnits(unit("a", ["src/app.ts"], slow("a"))));
    const running = verify(root);
    await until(async () => (await marks(root)) === "a");
    await new Promise((done) => setTimeout(done, 500));
    expect((await going(root)).size).toBe(0);
    const done = await running;
    expect(done.code).toBe(0);
    expect(done.out).toMatch(/a · correcta · \d+ s\n/);
    expect(await recorded(root)).toHaveLength(1);
    expect((await going(root)).size).toBe(0);
  });
});
