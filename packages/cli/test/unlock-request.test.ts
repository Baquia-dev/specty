// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APP,
  CHANGE,
  CONFIG,
  cli,
  person,
  read,
  SPEC,
  SPEC_PATH,
  tempRepo,
  writeFiles,
} from "./support";

/**
 * A verification that fails and names the test until `src/app.ts` greets with «Hola», as a
 * runner does while the code is missing.
 */
const RED = `node -e "if(!require('fs').readFileSync('src/app.ts','utf8').includes('Hola')){console.log('FAIL src/app.test.ts');process.exit(1)}"`;
/** Under contract, a feature's tests are approved before its code (ADR 0014). */
const CONTRACT = `${CONFIG(RED)}policy:\n  tests: contract\nchecks:\n  levels: { secrets: off }\n`;
/** SPEC with a test in every task, as `contract` requires to propose it. */
const FEATURE = SPEC.replace(
  "  - files: src/app.ts\n  - ac: AC1\n  - type: refactor",
  "  - files: src/app.ts, src/app.test.ts\n  - ac: AC1\n  - type: refactor",
);
const TEST = "it('AC1: saluda a Ana', () => {});\n";
/** The change the agent asks to make to TEST, as `git diff` writes it. */
const PATCH = [
  "diff --git a/src/app.test.ts b/src/app.test.ts",
  "--- a/src/app.test.ts",
  "+++ b/src/app.test.ts",
  "@@ -1 +1 @@",
  "-it('AC1: saluda a Ana', () => {});",
  "+it('AC1: saluda a Ana', () => {}); // Hola, Ana",
  "",
].join("\n");
const REASON = "El test no comprueba que el saludo lleve «Hola, Ana»";
/** The full command the refusals give to ask for the unlock again. */
const FULL =
  '`specty scope add src/app.test.ts --task T1 --reason "<motivo>" --patch <parche> --evidence <ruta>:<desde>-<hasta>`';

/** FEATURE's change with its test approved by the person and T1 active. */
async function implementing(): Promise<string> {
  const root = await tempRepo({ ...APP, ".specty/config.yaml": CONTRACT });
  await cli(root, ["new", "Saludo personalizado"]);
  await writeFiles(root, { [SPEC_PATH]: FEATURE });
  expect((await cli(root, ["propose"])).code).toBe(0);
  await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  await writeFiles(root, { "src/app.test.ts": TEST });
  const sent = await cli(root, ["propose"]);
  expect(sent.code, sent.out).toBe(0);
  const approval = await cli(root, ["approve"], { terminal: person() });
  expect(approval.code, approval.out).toBe(0);
  await cli(root, ["next"]);
  return root;
}

const stateOf = async (root: string) =>
  JSON.parse(await read(root, `.specty/changes/${CHANGE}/state.json`));

/** `scope add` of the approved test for T1 with `extra` options, and `stdin` if given. */
const ask = (root: string, extra: readonly string[], stdin?: string) =>
  cli(
    root,
    ["scope", "add", "src/app.test.ts", "--task", "T1", "--reason", REASON, ...extra],
    stdin === undefined ? {} : { stdin },
  );

/** The `--evidence` options for each of `pieces`. */
const evidence = (...pieces: readonly string[]) => pieces.flatMap((piece) => ["--evidence", piece]);

describe("an unlock without its patch or its evidence", () => {
  it("AC1: creates no request, and says what is missing, what each option is and the full command", async () => {
    const root = await implementing();
    const bare = await ask(root, []);
    expect(bare.code, bare.out).toBe(1);
    expect(bare.out).toContain(
      "Para desbloquear un test aprobado faltan `--patch` y `--evidence`.",
    );
    expect(bare.out).toContain("`--patch` es el cambio exacto que harás al test");
    expect(bare.out).toContain("`--evidence` son las líneas que lo justifican");
    expect(bare.out).toContain(`SIGUIENTE: pídelo con ${FULL}.`);
    const patchOnly = await ask(root, ["--patch", "-"], PATCH);
    expect(patchOnly.code, patchOnly.out).toBe(1);
    expect(patchOnly.out).toContain("Para desbloquear un test aprobado falta `--evidence`.");
    const evidenceOnly = await ask(root, evidence("src/app.ts:1-1"));
    expect(evidenceOnly.code, evidenceOnly.out).toBe(1);
    expect(evidenceOnly.out).toContain("Para desbloquear un test aprobado falta `--patch`.");
    const state = await stateOf(root);
    expect(state.pending.scopeRequests).toEqual([]);
    expect(state.maxIds.S).toBeUndefined();
  });
});

describe("a patch that does not do", () => {
  it("AC3: is refused when it cannot be read, is no diff, is too long, touches other files or does not apply", async () => {
    const root = await implementing();
    const refused = async (patch: readonly string[], stdin?: string) => {
      const run = await ask(root, [...patch, ...evidence("src/app.ts:1-1")], stdin);
      expect(run.code, run.out).toBe(1);
      expect(run.out).toContain(`SIGUIENTE: corrígelo y vuelve a pedirlo con ${FULL}.`);
      return run.out;
    };
    expect(await refused(["--patch", "falta.patch"])).toContain(
      "No se puede leer el parche `falta.patch`.",
    );
    expect(await refused(["--patch", "-"], "hola\n")).toContain(
      "El parche no es un diff unificado: `git apply` dice «",
    );
    expect(await refused(["--patch", "-"], "x\n".repeat(501))).toContain(
      "El parche tiene 501 líneas, y el máximo es 500.",
    );
    const other = `${PATCH}diff --git a/src/app.ts b/src/app.ts\n--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1 @@\n-export const greet = () => 'hola';\n+export const greet = () => 'Hola';\n`;
    expect(await refused(["--patch", "-"], other)).toContain(
      "El parche toca archivos que no son los tests que pides desbloquear: src/app.ts.",
    );
    const stale = PATCH.replace("-it('AC1: saluda a Ana'", "-it('AC1: saluda a Eva'");
    expect(await refused(["--patch", "-"], stale)).toContain(
      "El parche no se aplica a la versión bloqueada del test: `git apply` dice «",
    );
    // Past the guard, as a shell command could: the test is not the version the patch is for.
    await writeFiles(root, { "src/app.test.ts": "it('AC1: saluda', () => {});\n" });
    expect(await refused(["--patch", "-"], PATCH)).toContain(
      "`src/app.test.ts` no está como se bloqueó.",
    );
    expect((await stateOf(root)).pending.scopeRequests).toEqual([]);
  });
});

describe("evidence that does not do", () => {
  it("AC4: is refused with another form, too many lines, an untracked file, missing lines or too many pieces", async () => {
    const root = await implementing();
    // A file git does not track yet.
    await writeFiles(root, { "notas.txt": "uno\ndos\n" });
    const refused = async (...pieces: readonly string[]) => {
      const run = await ask(root, ["--patch", "-", ...evidence(...pieces)], PATCH);
      expect(run.code, run.out).toBe(1);
      expect(run.out).toContain(`SIGUIENTE: corrígelo y vuelve a pedirlo con ${FULL}.`);
      return run.out;
    };
    expect(await refused("src/app.ts")).toContain(
      "`src/app.ts` no es una evidencia: escríbela como `<ruta>:<desde>-<hasta>`",
    );
    expect(await refused("src/app.ts:3-1")).toContain("`src/app.ts:3-1` no es una evidencia");
    expect(await refused("src/app.ts:0-1")).toContain("`src/app.ts:0-1` no es una evidencia");
    expect(await refused("src/app.ts:1-41")).toContain(
      "`src/app.ts:1-41` tiene 41 líneas, y el máximo es 40.",
    );
    expect(await refused("notas.txt:1-2")).toContain("`notas.txt:1-2`: git no sigue `notas.txt`");
    expect(await refused("src/app.ts:1-1", "src/app.ts:1-3")).toContain(
      "`src/app.ts:1-3` no existe: `src/app.ts` tiene 1 línea.",
    );
    expect(await refused(...Array.from({ length: 6 }, () => "src/app.ts:1-1"))).toContain(
      "Hay 6 `--evidence`, y el máximo es 5.",
    );
    expect((await stateOf(root)).pending.scopeRequests).toEqual([]);
  });
});

describe("an unlock with its patch and its evidence", () => {
  it("AC5: keeps the patch as given and each piece of evidence as its lines were, from a file or stdin", async () => {
    const root = await implementing();
    const folder = await mkdtemp(join(tmpdir(), "specty-patch-"));
    await writeFile(join(folder, "fix.patch"), PATCH);
    const spec = (await read(root, SPEC_PATH)).split("\n");
    const criterion = spec.findIndex((line) => line.startsWith("- AC1:")) + 1;
    const asked = await ask(root, [
      "--patch",
      join(folder, "fix.patch"),
      ...evidence("src/app.ts:1-1", `${SPEC_PATH}:${criterion}-${criterion + 1}`),
    ]);
    expect(asked.code, asked.out).toBe(0);
    expect(asked.out).toContain("SOLICITUD S1 (desbloquea tests aprobados):\n  src/app.test.ts");
    const kept = [
      { path: "src/app.ts", from: 1, to: 1, text: "export const greet = () => 'hola';" },
      {
        path: SPEC_PATH,
        from: criterion,
        to: criterion + 1,
        text: spec.slice(criterion - 1, criterion + 1).join("\n"),
      },
    ];
    expect((await stateOf(root)).pending.scopeRequests).toEqual([
      {
        id: "S1",
        task: "T1",
        paths: ["src/app.test.ts"],
        reason: REASON,
        patch: PATCH,
        evidence: kept,
      },
    ]);
    const audit = (await read(root, `.specty/changes/${CHANGE}/audit.jsonl`))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(audit.findLast((entry) => entry.event === "scope.requested")?.data).toMatchObject({
      id: "S1",
      patch: PATCH,
      evidence: kept,
    });
    // The code changes after the request: S1 keeps its lines as they were, and S2, from stdin,
    // the new ones.
    const greet = "export const greet = (name) => 'Hola, ' + name;";
    await writeFiles(root, { "src/app.ts": `${greet}\n` });
    const again = await ask(root, ["--patch", "-", ...evidence("src/app.ts:1-1")], PATCH);
    expect(again.code, again.out).toBe(0);
    const [first, second] = (await stateOf(root)).pending.scopeRequests;
    expect(first.evidence).toEqual(kept);
    expect(second).toMatchObject({
      id: "S2",
      patch: PATCH,
      evidence: [{ path: "src/app.ts", from: 1, to: 1, text: greet }],
    });
  });
});

describe("--patch or --evidence without an unlock", () => {
  it("AC6: widens nothing, and says they are only for unlocking", async () => {
    const root = await implementing();
    for (const extra of [["--patch", "-"], evidence("src/app.ts:1-1")]) {
      const run = await cli(
        root,
        ["scope", "add", "lib/other.ts", "--task", "T1", "--reason", "Un ayudante", ...extra],
        { stdin: PATCH },
      );
      expect(run.code, run.out).toBe(1);
      expect(run.out).toContain(
        "`--patch` y `--evidence` son solo para desbloquear un test aprobado, y ninguna de esas rutas lo es.",
      );
      expect(run.out).toContain(
        'SIGUIENTE: pídelo sin ellos: `specty scope add lib/other.ts --task T1 --reason "<motivo>"`.',
      );
    }
    const state = await stateOf(root);
    expect(state.pending.scopeRequests).toEqual([]);
    expect(state.tasks.T1.scopeExtra).toEqual([]);
  });
});
